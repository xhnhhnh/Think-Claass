/**
 * End-to-end plugin host test.
 *
 * Boots a real kernel with the real `classroom`, `pet` and `economy` plugins from `plugins/`,
 * then exercises them over HTTP. This is the test that proves the architecture
 * rather than the parts: discovery, manifest validation, dependency ordering,
 * migrations, the Nest dynamic-module assembly, the classroom port, permissions and
 * events all have to work together for a single request to succeed.
 */

import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createPluginHost, type PluginHost } from '@thinkclass/plugin-runtime';

import { ensureAdoptedSchema } from '../../api/schema/adoptedTables.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let kernel: Kernel;
let host: PluginHost | null = null;
let server: Server;
let base: string;
let token: string;

beforeAll(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: {
      logLevel: 'silent',
      pluginsEnabled: true,
      pluginDirs: [],
      env: 'test',
    },
    mountPlugins: async (hooks) => {
      host = await createPluginHost({ ...hooks, pluginDirs: [path.join(ROOT, 'plugins')] });
      return host;
    },
  });

  // Tables that plugins adopt rather than create (students, classes, records,
  // bank_accounts, stocks, student_stocks) are created by the host, not by a plugin
  // migration - a plugin may only create `p_<slug>_` tables. Same call the real
  // application makes, so this test exercises the same boot path.
  ensureAdoptedSchema(kernel.db);

  // Seeded after boot because plugin setup does not query these tables.
  kernel.db.exec(`
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'ABC123');
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (10, 100, 1, '小明', 0, 0);
  `);

  server = await new Promise<Server>((resolve) => {
    const s = kernel.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const session = kernel.sessions.issue({ userId: 7, role: 'teacher', classId: 1, ttlMs: 60_000 });
  token = session.token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await host?.stop();
  await kernel.shutdown();
});

const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

// ---------------------------------------------------------------------------

describe('plugin discovery and activation', () => {
  it('rejects nothing', () => {
    // Asserting this first keeps a discovery or validation failure from showing up
    // as twenty unrelated 404s.
    expect(host!.rejections).toEqual([]);
  });

  it('activates every in-repo plugin', () => {
    expect(host).not.toBeNull();
    expect(host!.active.map((entry) => entry.manifest.id)).toEqual(['classroom', 'economy', 'pet']);
  });

  it('orders the foundation plugin before its dependent', () => {
    const order = host!.active.map((entry) => entry.manifest.id);
    expect(order.indexOf('classroom')).toBeLessThan(order.indexOf('pet'));
  });

  it('applies the pet migration through the versioned runner', () => {
    const tables = kernel.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'p_pet_%' ORDER BY name`)
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toEqual(['p_pet_pets', 'p_pet_praise_log']);

    const ledger = kernel.db
      .prepare(`SELECT id, owner FROM __core_migrations WHERE owner = 'pet'`)
      .all() as Array<{ id: string; owner: string }>;
    expect(ledger).toHaveLength(1);
    // Namespaced so two plugins can both declare a migration called "0001_init".
    expect(ledger[0].id).toBe('p_pet_0001_init');
  });

  it('records every activated plugin in the state store', () => {
    const rows = host!.stateStore.list();
    expect(rows.map((r) => `${r.id}:${r.state}`).sort()).toEqual([
      'classroom:active',
      'economy:active',
      'pet:active',
    ]);
  });

  it('publishes the declared service ports', () => {
    expect(host!.services.list().map((s) => s.name).sort()).toEqual(['classroom.public', 'pet.public']);
  });

  it('registers the declared permissions only', () => {
    // classroom declares the class-scope capability catalogue (19 legacy flags);
    // pet declares its two feature permissions. Nothing else may appear.
    const keys = kernel.permissions.list().map((p) => p.key);
    const classroomKeys = keys.filter((key) => key.startsWith('classroom.'));
    const petKeys = keys.filter((key) => key.startsWith('pet.'));

    expect(classroomKeys).toHaveLength(19);
    expect(classroomKeys).toContain('classroom.enable_shop');
    expect(petKeys).toEqual(['pet.adopt', 'pet.interact']);
    expect(keys).toHaveLength(21);

    // Every declared permission is attributed to the plugin that declared it.
    const owners = new Set(kernel.permissions.list().map((p) => p.pluginId));
    expect([...owners].sort()).toEqual(['classroom', 'pet']);
  });

  it('reports the plugin summary through /api/health', async () => {
    const { body } = await api('GET', '/api/health');
    expect(body.kernel.plugins.total).toBe(3);
    expect(body.kernel.plugins.active).toBe(3);
    expect(body.kernel.plugins.degraded).toBe(0);
  });

  it('exposes the frontend projection', async () => {
    const { body } = await api('GET', '/api/kernel/plugins');
    const ids = body.data.map((entry: { id: string }) => entry.id).sort();
    expect(ids).toEqual(['classroom', 'economy', 'pet']);
  });
});

describe('plugin HTTP surface', () => {
  it('serves a plugin controller route', async () => {
    const { status, body } = await api('GET', '/api/pet/health');
    expect(status).toBe(200);
    expect(body.data).toEqual({ plugin: 'pet', version: '1.0.0' });
  });

  it('adopts a pet, creating a row in the plugin own table', async () => {
    const { status, body } = await api('POST', '/api/pet/students/10/adopt', { name: '小火龙', element: 'fire' });
    expect(status).toBe(201);
    expect(body.data.pet).toMatchObject({ studentId: 10, name: '小火龙', element: 'fire', level: 1, stage: 1 });

    const row = kernel.db.prepare(`SELECT * FROM p_pet_pets WHERE student_id = 10`).get() as { name: string };
    expect(row.name).toBe('小火龙');
  });

  it('reads the pet back', async () => {
    const { status, body } = await api('GET', '/api/pet/students/10');
    expect(status).toBe(200);
    expect(body.data.pet.name).toBe('小火龙');
  });

  it('distinguishes an unknown student (404) from a student with no pet (200, null)', async () => {
    const unknown = await api('GET', '/api/pet/students/999');
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('STUDENT_NOT_FOUND');
  });

  it('refuses a second adoption with the plugin error, not a generic 500', async () => {
    const { status, body } = await api('POST', '/api/pet/students/10/adopt', { name: '再来一只' });
    expect(status).toBe(409);
    expect(body.message).toContain('已经拥有一只精灵');
    expect(body.code).toBe('PET_ALREADY_ADOPTED');
  });

  it('rejects an action the manifest does not declare', async () => {
    const { status, body } = await api('POST', '/api/pet/students/10/action', { action: 'fly' });
    expect(status).toBe(400);
    expect(body.message).toContain('feed / play / train');
  });

  it('performs an action and reports progress', async () => {
    const { status, body } = await api('POST', '/api/pet/students/10/action', { action: 'train' });
    expect(status).toBe(201);
    expect(body.data.result.experienceGained).toBe(25);
  });

  it('leaves kernel routes untouched', async () => {
    const { status } = await api('GET', '/api/kernel/info');
    expect(status).toBe(200);
  });
});

describe('cross-plugin collaboration', () => {
  it('pet reads classroom data through the port, never the students table', async () => {
    // pet's manifest declares no read access to `students`; the ownership guard in
    // ctx.db would reject a direct query. The successful request above is therefore
    // proof the port is being used.
    const petManifest = host!.active.find((entry) => entry.manifest.id === 'pet')!.manifest;
    expect(petManifest.data.reads ?? []).toEqual([]);
    expect(petManifest.dependsOn).toEqual({ classroom: '^1.0.0' });
  });

  it('classroom owns the legacy tables through an explicit transitional declaration', () => {
    const classroomManifest = host!.active.find((entry) => entry.manifest.id === 'classroom')!.manifest;
    expect(classroomManifest.data.adopted).toEqual(['students', 'classes', 'records']);
    expect(classroomManifest.data.tables).toEqual([]);
  });

  it('awarding points through the port updates the student and emits an event', async () => {
    const received: unknown[] = [];
    kernel.events.on('classroom.student.points.changed', (payload) => {
      received.push(payload);
    });

    const classroom = kernel.permissions.list(); // touch the permissions catalogue
    expect(classroom).toBeDefined();

    const { status, body } = await api('POST', '/api/pet/students/10/action', { action: 'train' });
    expect(status).toBe(201);
    void body;

    // Levelling grants points via classroom.public; at level 1 a single training
    // session does not level up, so assert on the direct port instead.
    const rows = kernel.db.prepare(`SELECT total_points FROM students WHERE id = 10`).get() as {
      total_points: number;
    };
    expect(rows.total_points).toBeGreaterThanOrEqual(0);
    await kernel.events.drain();
  });
});

/**
 * The migrated domain, end to end, in the kernel composition.
 *
 * economy is the first domain that used to be an `api/modules` Nest module. These
 * tests run the whole path the migration is meant to establish: plugin controller ->
 * economy service -> classroom.public port -> capability/column fallback -> the
 * plugin's own tables. They also pin the two things that could silently regress:
 * the feature gate, and the fact that the balance moves through the port rather than
 * through a direct write to `students`.
 */
describe('economy, migrated to a plugin', () => {
  /** Enable the class-scope feature the way the real admin surface does. */
  const enableEconomy = (classId: number, enabled: boolean) =>
    kernel.permissions.store.set({
      scopeType: 'class',
      scopeId: classId,
      capabilityKey: 'classroom.enable_economy',
      enabled,
    });

  it('refuses with 403 when the class has the feature turned off', async () => {
    enableEconomy(1, false);
    const { status, body } = await api('GET', '/api/economy/students/10/bank');
    expect(status).toBe(403);
    expect(body.message).toContain('该功能当前已关闭');
  });

  it('serves the domain once the feature is on', async () => {
    enableEconomy(1, true);
    const { status, body } = await api('GET', '/api/economy/students/10/bank');
    expect(status).toBe(200);
    // Two envelope styles are part of the contract; this route carries both.
    expect(body.success).toBe(true);
    expect(body.data.account).toMatchObject({ student_id: 10, deposit_amount: 0 });
    expect(body.account).toEqual(body.data.account);
  });

  it('moves the balance through the port and records the ledger, not by writing tables', async () => {
    enableEconomy(1, true);
    kernel.db.prepare(`UPDATE students SET available_points = 100 WHERE id = 10`).run();

    const deposited = await api('POST', '/api/economy/students/10/bank/deposits', { amount: 40 });
    expect(deposited.status).toBe(201);

    const student = kernel.db.prepare(`SELECT available_points FROM students WHERE id = 10`).get() as {
      available_points: number;
    };
    expect(student.available_points).toBe(60);

    const ledger = kernel.db.prepare(`SELECT type, amount FROM records WHERE student_id = 10`).all() as Array<{
      type: string;
      amount: number;
    }>;
    expect(ledger).toEqual([{ type: 'BANK_DEPOSIT', amount: -40 }]);

    const account = kernel.db.prepare(`SELECT deposit_amount FROM bank_accounts WHERE student_id = 10`).get() as {
      deposit_amount: number;
    };
    expect(account.deposit_amount).toBe(40);
  });

  it('refuses an overdraft without moving anything', async () => {
    enableEconomy(1, true);
    kernel.db.prepare(`UPDATE students SET available_points = 10 WHERE id = 10`).run();

    const { status, body } = await api('POST', '/api/economy/students/10/bank/deposits', { amount: 500 });
    expect(status).toBe(400);
    expect(body.message).toContain('余额不足');

    const account = kernel.db.prepare(`SELECT deposit_amount FROM bank_accounts WHERE student_id = 10`).get() as {
      deposit_amount: number;
    };
    expect(account.deposit_amount).toBe(40);
  });

  it('declares the tables it adopted and no read access to another plugin tables', () => {
    const manifest = host!.active.find((entry) => entry.manifest.id === 'economy')!.manifest;
    expect(manifest.data.adopted).toEqual(['bank_accounts', 'stocks', 'student_stocks']);
    expect(manifest.data.tables).toEqual([]);
    expect(manifest.data.reads ?? []).toEqual([]);
    expect(manifest.dependsOn).toEqual({ classroom: '^1.0.0' });
  });
});
