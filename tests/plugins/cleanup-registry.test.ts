/**
 * The cleanup registry: registration is permission, the order comes from the schema, and the whole
 * batch is one transaction.
 *
 * These are the mechanism's own tests - the account-deletion path that uses it is covered
 * separately (`tests/plugins/admin-cascade.test.ts`, which runs the real delete on a real database).
 * The cases here are the ones a coverage test cannot see:
 *
 *   1. a rule that reaches outside its plugin's declaration must be refused at registration
 *      ("declaration is permission", which is the property the pre-migration cascade did not have);
 *   2. two plugins may not claim the same table's cleanup - one table has one cleanup owner;
 *   3. the run order is derived from `PRAGMA foreign_key_list`, not declared, because a rule that
 *      derives ids from another plugin's table has to run before that table's owner deletes it;
 *   4. an `async` rule is refused: better-sqlite3 transaction callbacks cannot await, so an async
 *      rule would run part of its work outside the transaction while looking atomic;
 *   5. a cycle throws instead of producing a half-applied order;
 *   6. a failure anywhere rolls the whole batch back - the atomicity the ruling kept.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '@thinkclass/kernel';
import { createDbApi, createCleanupRegistry, type CleanupRegistry } from '@thinkclass/plugin-runtime';
import type { CleanupRule, CleanupSubject, DbApi } from '@thinkclass/plugin-sdk';

let db: Database;
let registry: CleanupRegistry;

/**
 * Three tables with a real foreign-key chain: `pets`/`records` -> `students` -> `classes`.
 *
 * Deliberately generic names rather than the product's: the registry must work for any schema, and
 * a test that reuses the product's table names would pass even if the registry had learned them.
 */
function createSchema(database: Database): void {
  database.exec(`
    CREATE TABLE classes (id INTEGER PRIMARY KEY);
    CREATE TABLE students (
      id INTEGER PRIMARY KEY,
      class_id INTEGER REFERENCES classes(id)
    );
    CREATE TABLE pets (
      id INTEGER PRIMARY KEY,
      student_id INTEGER REFERENCES students(id)
    );
    CREATE TABLE records (
      id INTEGER PRIMARY KEY,
      student_id INTEGER REFERENCES students(id)
    );
  `);
}

function pluginOf(name: string, owned: string[]): DbApi {
  return createDbApi({
    db,
    pluginId: name,
    ownedTables: new Set(owned),
    readTables: new Set(),
    strict: true,
  });
}

const subject: CleanupSubject = {
  teacherIds: [1],
  classIds: [10],
  studentIds: [20, 21],
  userIds: [1, 30, 31],
};

function seed(): void {
  db.exec(`
    INSERT INTO classes (id) VALUES (10), (11);
    INSERT INTO students (id, class_id) VALUES (20, 10), (21, 10), (22, 11);
    INSERT INTO pets (id, student_id) VALUES (100, 20), (101, 21), (102, 22);
    INSERT INTO records (id, student_id) VALUES (200, 20), (201, 21), (202, 22);
  `);
}

function count(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

/** A rule that deletes the given subject student ids from one table. */
function studentRule(table: string): CleanupRule {
  return {
    tables: [table],
    run(tx, current) {
      const ids = current.studentIds;
      if (ids.length === 0) return;
      tx.run(`DELETE FROM ${table} WHERE student_id IN (${ids.map(() => '?').join(', ')})`, ids);
    },
  };
}

beforeEach(() => {
  db = openDatabase(':memory:', { wal: false });
  createSchema(db);
  seed();
  registry = createCleanupRegistry({ db });
});

describe('registration', () => {
  it('refuses a rule that names a table its plugin did not declare', () => {
    expect(() =>
      registry.register({
        pluginId: 'pet',
        api: pluginOf('pet', ['pets']),
        ownedTables: new Set(['pets']),
        rule: { tables: ['pets', 'students'], run() {} },
      }),
    ).toThrow(/does not own/);

    // Nothing was registered by the failed call, so a later legitimate rule still works.
    expect(registry.tables()).toEqual([]);
  });

  it('refuses a second plugin claiming the same table', () => {
    registry.register({
      pluginId: 'pet',
      api: pluginOf('pet', ['pets']),
      ownedTables: new Set(['pets']),
      rule: studentRule('pets'),
    });

    expect(() =>
      registry.register({
        pluginId: 'classroom',
        api: pluginOf('classroom', ['pets']),
        ownedTables: new Set(['pets']),
        rule: studentRule('pets'),
      }),
    ).toThrow(/already registered/);
  });

  it('refuses a rule with no tables and a rule without run()', () => {
    const owned = new Set(['pets']);
    expect(() =>
      registry.register({ pluginId: 'pet', api: pluginOf('pet', ['pets']), ownedTables: owned, rule: { tables: [], run() {} } }),
    ).toThrow(/no tables/);
    expect(() =>
      registry.register({
        pluginId: 'pet',
        api: pluginOf('pet', ['pets']),
        ownedTables: owned,
        rule: { tables: ['pets'] } as unknown as CleanupRule,
      }),
    ).toThrow(/without a run\(\)/);
  });
});

describe('ordering', () => {
  it('runs the rules that delete referencing rows before the rules that delete referenced rows', () => {
    // Registered parents-first on purpose: the order must come from the schema, not the call order.
    registry.register({
      pluginId: 'classroom',
      api: pluginOf('classroom', ['students', 'classes']),
      ownedTables: new Set(['students', 'classes']),
      rule: {
        tables: ['students', 'classes'],
        run(tx, current) {
          if (current.studentIds.length > 0) {
            tx.run(
              `DELETE FROM students WHERE id IN (${current.studentIds.map(() => '?').join(', ')})`,
              current.studentIds,
            );
          }
          if (current.classIds.length > 0) {
            tx.run(`DELETE FROM classes WHERE id IN (${current.classIds.map(() => '?').join(', ')})`, current.classIds);
          }
        },
      },
    });
    registry.register({
      pluginId: 'pet',
      api: pluginOf('pet', ['pets']),
      ownedTables: new Set(['pets']),
      rule: studentRule('pets'),
    });
    registry.register({
      pluginId: 'economy',
      api: pluginOf('economy', ['records']),
      ownedTables: new Set(['records']),
      rule: studentRule('records'),
    });

    // If the order were wrong, deleting `students` first would fail the immediate foreign-key check.
    expect(registry.executionOrder()).toEqual(['economy', 'pet', 'classroom']);
    registry.run(subject);

    expect(count('pets')).toBe(1); // student 22 is in another class
    expect(count('records')).toBe(1);
    expect(count('students')).toBe(1);
    expect(count('classes')).toBe(1);
  });

  it('throws when the foreign keys form a cycle', () => {
    db.exec(`
      CREATE TABLE a (id INTEGER PRIMARY KEY, b_id INTEGER REFERENCES b(id));
      CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));
    `);
    registry.register({
      pluginId: 'alpha',
      api: pluginOf('alpha', ['a']),
      ownedTables: new Set(['a']),
      rule: { tables: ['a'], run() {} },
    });
    registry.register({
      pluginId: 'beta',
      api: pluginOf('beta', ['b']),
      ownedTables: new Set(['b']),
      rule: { tables: ['b'], run() {} },
    });

    expect(() => registry.run(subject)).toThrow(/cycle/);
  });
});

describe('execution', () => {
  it('runs every rule inside one transaction: a late failure rolls the earlier deletes back', () => {
    registry.register({
      pluginId: 'pet',
      api: pluginOf('pet', ['pets']),
      ownedTables: new Set(['pets']),
      rule: studentRule('pets'),
    });
    registry.register({
      pluginId: 'classroom',
      api: pluginOf('classroom', ['students', 'classes']),
      ownedTables: new Set(['students', 'classes']),
      rule: {
        tables: ['students', 'classes'],
        run() {
          // Throws before touching anything, so the case is about the rollback of the *earlier*
          // rule's delete - not about a foreign-key failure of its own.
          throw new Error('boom');
        },
      },
    });

    expect(() => registry.run(subject)).toThrow('boom');
    expect(count('pets')).toBe(3);
    expect(count('students')).toBe(3);
  });

  it('refuses an async rule instead of letting it escape the transaction', () => {
    registry.register({
      pluginId: 'pet',
      api: pluginOf('pet', ['pets']),
      ownedTables: new Set(['pets']),
      rule: {
        tables: ['pets'],
        run(tx, current) {
          tx.run(
            `DELETE FROM pets WHERE student_id IN (${current.studentIds.map(() => '?').join(', ')})`,
            current.studentIds,
          );
          // The failure mode this guards: an `async` rule returns a promise, so everything after its
          // first `await` would run after the transaction committed - looking atomic, not being it.
          return Promise.resolve() as unknown as void;
        },
      },
    });

    expect(() => registry.run(subject)).toThrow(/returned a promise/);
    // The throw rolled the transaction back, including the statement the rule already ran.
    expect(count('pets')).toBe(3);
  });

  it('normalizes the subject: ids are deduplicated, sorted and non-numeric entries dropped', () => {
    const seen: number[][] = [];
    registry.register({
      pluginId: 'pet',
      api: pluginOf('pet', ['pets']),
      ownedTables: new Set(['pets']),
      rule: {
        tables: ['pets'],
        run(_tx, current) {
          seen.push(current.studentIds);
        },
      },
    });

    registry.run({
      teacherIds: [1, 1],
      classIds: [],
      studentIds: [21, 20, 21, Number.NaN as unknown as number],
      userIds: [],
    });

    expect(seen).toEqual([[20, 21]]);
  });
});
