/**
 * Plugin isolation primitives.
 *
 * Three mechanisms keep independently written plugins from damaging each other or
 * the host:
 *   - the boundary, which contains faults and degrades a failing plugin
 *   - the ownership-checked database API, which stops a plugin writing outside its
 *     declared tables
 *   - the service registry, which stops a plugin impersonating another's port
 */

import { describe, expect, it, vi } from 'vitest';

import { openDatabase, runMigrations, type Database } from '@thinkclass/kernel';
import {
  createDbApi,
  createPluginBoundary,
  createServiceRegistry,
  ServiceNotAvailableError,
  TableOwnershipError,
} from '@thinkclass/plugin-runtime';

// ---------------------------------------------------------------------------
// boundary
// ---------------------------------------------------------------------------

describe('plugin boundary', () => {
  it('returns the value on success', async () => {
    const boundary = createPluginBoundary();
    const outcome = await boundary.run('p', 'ok', () => 42);
    expect(outcome).toEqual({ ok: true, value: 42 });
  });

  it('distinguishes a void success from a failure', async () => {
    const boundary = createPluginBoundary();
    // The bug this guards: signalling failure with `undefined` made every
    // setup() hook look like it had thrown.
    const success = await boundary.run('p', 'void', () => undefined);
    const failure = await boundary.run('p', 'throws', () => {
      throw new Error('boom');
    });
    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
    if (!failure.ok) expect(failure.error).toBe('boom');
  });

  it('contains a throwing handler instead of propagating it', async () => {
    const boundary = createPluginBoundary();
    await expect(
      boundary.run('p', 'throws', () => {
        throw new Error('boom');
      }),
    ).resolves.toMatchObject({ ok: false });
  });

  it('contains a rejected async handler', async () => {
    const boundary = createPluginBoundary();
    await expect(boundary.run('p', 'rejects', async () => Promise.reject(new Error('async boom')))).resolves.toMatchObject({
      ok: false,
    });
  });

  it('abandons a handler that exceeds its budget', async () => {
    const boundary = createPluginBoundary({ timeoutMs: 20 });
    const outcome = await boundary.run('p', 'hangs', () => new Promise<void>(() => {}));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain('exceeded 20ms');
  });

  it('degrades a plugin once its error rate crosses the threshold', async () => {
    const onDegrade = vi.fn();
    const boundary = createPluginBoundary({ errorThreshold: 3, windowSize: 10, onDegrade });

    for (let i = 0; i < 3; i += 1) {
      await boundary.run('flaky', 'call', () => {
        throw new Error(`failure ${i}`);
      });
    }

    expect(boundary.isDegraded('flaky')).toBe(true);
    expect(onDegrade).toHaveBeenCalledTimes(1);
    expect(boundary.summary().degraded).toBe(1);
  });

  it('stops calling a degraded plugin and can be cleared', async () => {
    const boundary = createPluginBoundary({ errorThreshold: 2 });
    for (let i = 0; i < 2; i += 1) {
      await boundary.run('flaky', 'call', () => {
        throw new Error('x');
      });
    }

    const shouldNotRun = vi.fn();
    const outcome = await boundary.run('flaky', 'call', shouldNotRun);
    expect(shouldNotRun).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, degraded: true });

    boundary.clear('flaky');
    expect(boundary.isDegraded('flaky')).toBe(false);
    await expect(boundary.run('flaky', 'call', () => 'back')).resolves.toEqual({ ok: true, value: 'back' });
  });

  it('keeps one plugin failure from affecting another', async () => {
    const boundary = createPluginBoundary({ errorThreshold: 2 });
    for (let i = 0; i < 3; i += 1) {
      await boundary.run('bad', 'call', () => {
        throw new Error('x');
      });
    }
    expect(boundary.isDegraded('bad')).toBe(true);
    expect(boundary.isDegraded('good')).toBe(false);
    await expect(boundary.run('good', 'call', () => 'fine')).resolves.toEqual({ ok: true, value: 'fine' });
  });

  it('guard swallows failures and passes arguments through', async () => {
    const boundary = createPluginBoundary();
    const double = boundary.guard('p', 'double', (n: number) => n * 2);
    expect(await double(21)).toBe(42);

    const failing = boundary.guard('p', 'fail', () => {
      throw new Error('x');
    });
    expect(await failing()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// database ownership
// ---------------------------------------------------------------------------

describe('plugin database ownership', () => {
  let db: Database;

  const setup = () => {
    db = openDatabase(':memory:');
    db.exec(`
      CREATE TABLE p_demo_things (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO students (id, name) VALUES (1, '小明');
    `);
    return createDbApi({
      db,
      pluginId: 'demo',
      ownedTables: new Set(['p_demo_things']),
      readTables: new Set(['students']),
      strict: true,
    });
  };

  it('allows reads and writes to owned tables', () => {
    const api = setup();
    api.run(`INSERT INTO p_demo_things (name) VALUES (?)`, ['a']);
    expect(api.query(`SELECT * FROM p_demo_things`)).toHaveLength(1);
  });

  it('allows reads of a declared read table', () => {
    const api = setup();
    expect(api.get(`SELECT name FROM students WHERE id = ?`, [1])).toEqual({ name: '小明' });
  });

  it('refuses a write to a table it does not own', () => {
    const api = setup();
    expect(() => api.run(`UPDATE students SET name = ? WHERE id = 1`, ['hacked'])).toThrow(TableOwnershipError);
    // The row is untouched.
    expect(db.prepare(`SELECT name FROM students WHERE id = 1`).get()).toEqual({ name: '小明' });
  });

  it('refuses a write to a table owned by another plugin', () => {
    const api = setup();
    expect(() => api.run(`INSERT INTO p_other_things (name) VALUES (?)`, ['x'])).toThrow(TableOwnershipError);
  });

  it('refuses reading an undeclared table', () => {
    const api = setup();
    expect(() => api.query(`SELECT * FROM classes`)).toThrow(/without declaring it/);
  });

  /**
   * The extractor must not read SQL keywords as table names.
   *
   * An upsert's `DO UPDATE SET col = ...` looks exactly like `UPDATE <table>` to a
   * pattern matcher, so `SET` was reported as a *table* and EVERY
   * `INSERT ... ON CONFLICT DO UPDATE` was refused with the confusing message
   * `plugin "demo" may not write to table "SET"`. Portal's bulk homepage upsert was the
   * first statement in the codebase to use that form; it failed at runtime with a 500
   * while the unit tests - which fake the repository - were all green.
   *
   * `name` is not unique here, but the point is the extractor: the statement must reach
   * SQLite rather than being rejected before it runs.
   */
  it('treats SQL keywords after a verb as keywords, not tables', () => {
    const api = setup();

    expect(() =>
      api.run(
        `INSERT INTO p_demo_things (id, name) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
        [1, 'upserted'],
      ),
    ).not.toThrow();

    expect(api.query(`SELECT name FROM p_demo_things`)).toEqual([{ name: 'upserted' }]);
  });

  it('still resolves DDL targets', () => {
    const api = setup();
    // `CREATE TABLE IF NOT EXISTS x` must resolve to `x`, not to `IF`.
    expect(() => api.exec(`CREATE TABLE IF NOT EXISTS p_demo_things (id INTEGER, name TEXT)`)).not.toThrow();
    expect(() => api.exec(`ALTER TABLE p_demo_things ADD COLUMN note TEXT`)).not.toThrow();
    expect(api.query(`SELECT name FROM sqlite_master WHERE name = 'p_demo_things'`)).toHaveLength(1);
  });

  it('reports the offending table in the error', () => {
    const api = setup();
    try {
      api.run(`DELETE FROM students`);
      throw new Error('expected a TableOwnershipError');
    } catch (error) {
      expect(error).toBeInstanceOf(TableOwnershipError);
      expect((error as TableOwnershipError).table).toBe('students');
      expect((error as TableOwnershipError).message).toContain('does not own it');
    }
  });

  it('does not enforce when strict is off (production)', () => {
    const api = createDbApi({
      db: openDatabase(':memory:'),
      pluginId: 'demo',
      ownedTables: new Set(),
      readTables: new Set(),
      strict: false,
    });
    api.exec(`CREATE TABLE anything (id INTEGER)`);
    expect(api.query(`SELECT * FROM anything`)).toEqual([]);
  });

  it('rolls the whole transaction back on failure', () => {
    const api = setup();
    expect(() =>
      api.tx((tx) => {
        tx.run(`INSERT INTO p_demo_things (name) VALUES (?)`, ['kept']);
        tx.run(`UPDATE students SET name = ? WHERE id = 1`, ['nope']);
      }),
    ).toThrow(TableOwnershipError);
    expect(api.query(`SELECT * FROM p_demo_things`)).toHaveLength(0);
  });

  it('runs migrations through the ledger with namespaced ids', () => {
    const target = openDatabase(':memory:');
    const result = runMigrations(target, [
      { id: 'p_demo_0001', owner: 'demo', up: `CREATE TABLE p_demo_things (id INTEGER);` },
    ]);
    expect(result.applied).toEqual(['p_demo_0001']);
    expect(runMigrations(target, [{ id: 'p_demo_0001', owner: 'demo', up: `CREATE TABLE p_demo_things (id INTEGER);` }]).skipped).toEqual([
      'p_demo_0001',
    ]);
  });
});

// ---------------------------------------------------------------------------
// service registry
// ---------------------------------------------------------------------------

describe('service registry', () => {
  const port = { hello: () => 'hi' };

  it('publishes and resolves a namespaced service', () => {
    const registry = createServiceRegistry();
    registry.provide('demo', 'demo.public', port);
    expect(registry.use('consumer', 'demo.public')).toBe(port);
    expect(registry.has('demo.public')).toBe(true);
  });

  it('refuses a service published under another plugin name', () => {
    const registry = createServiceRegistry();
    // Without this check a plugin could impersonate another's public interface.
    expect(() => registry.provide('impostor', 'classroom.public', port)).toThrow(/namespaced under its own slug/);
  });

  it('refuses a duplicate provider', () => {
    const registry = createServiceRegistry();
    registry.provide('demo', 'demo.public', port);
    expect(() => registry.provide('demo', 'demo.public', port)).toThrow(/already provided/);
  });

  it('names the consumer when a service is missing', () => {
    const registry = createServiceRegistry();
    expect(() => registry.use('pet', 'classroom.public')).toThrow(ServiceNotAvailableError);
    expect(() => registry.use('pet', 'classroom.public')).toThrow(/plugin "pet" requires service "classroom.public"/);
  });

  it('tryUse returns null instead of throwing', () => {
    const registry = createServiceRegistry();
    expect(registry.tryUse('pet', 'classroom.public')).toBeNull();
  });

  it('revoking a plugin drops only its services', () => {
    const registry = createServiceRegistry();
    registry.provide('a', 'a.public', port);
    registry.provide('b', 'b.public', port);

    expect(registry.revoke('a')).toBe(1);
    expect(registry.has('a.public')).toBe(false);
    expect(registry.has('b.public')).toBe(true);
  });
});
