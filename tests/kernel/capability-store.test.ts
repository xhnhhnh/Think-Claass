/**
 * Capability assignments.
 *
 * This is the mechanism that replaces the 19 `enable_*` columns on `classes`. The
 * properties that matter are scope addressing (a decision made for one class must not
 * leak to another), precedence (the narrowest scope wins), and persistence (a
 * teacher's toggle must survive a restart, unlike the in-memory default).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CAPABILITY_ASSIGNMENTS_MIGRATION_ID,
  capabilityAssignmentsMigration,
  createPermissionEngine,
  createSqliteAssignmentStore,
  openDatabase,
  runMigrations,
  seedAssignments,
  type Database,
} from '@thinkclass/kernel';
import type { Actor, PermissionDeclaration } from '@thinkclass/contracts';

let db: Database;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db, [capabilityAssignmentsMigration]);
});
afterEach(() => {
  db.close();
});

const declarations: PermissionDeclaration[] = [
  { key: 'classroom.enable_shop', scope: 'class', default: true, label: '积分商城' },
  { key: 'classroom.enable_gacha', scope: 'class', default: false, label: '召唤法阵' },
];

const student: Actor = { userId: 10, role: 'student', studentId: 100, classId: 5 };

describe('capability assignment store', () => {
  it('returns undefined for a capability never assigned', () => {
    const store = createSqliteAssignmentStore(db);
    expect(store.get('class', 5, 'classroom.enable_shop')).toBeUndefined();
  });

  it('round-trips a value', () => {
    const store = createSqliteAssignmentStore(db);
    store.set({ scopeType: 'class', scopeId: 5, capabilityKey: 'classroom.enable_shop', enabled: false });
    expect(store.get('class', 5, 'classroom.enable_shop')).toBe(false);
  });

  it('upserts rather than duplicating', () => {
    const store = createSqliteAssignmentStore(db);
    store.set({ scopeType: 'class', scopeId: 5, capabilityKey: 'classroom.enable_shop', enabled: true });
    store.set({ scopeType: 'class', scopeId: 5, capabilityKey: 'classroom.enable_shop', enabled: false });

    expect(store.get('class', 5, 'classroom.enable_shop')).toBe(false);
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM capability_assignments`).get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it('keeps scopes isolated', () => {
    const store = createSqliteAssignmentStore(db);
    store.set({ scopeType: 'class', scopeId: 5, capabilityKey: 'classroom.enable_shop', enabled: false });
    store.set({ scopeType: 'class', scopeId: 6, capabilityKey: 'classroom.enable_shop', enabled: true });

    expect(store.get('class', 5, 'classroom.enable_shop')).toBe(false);
    expect(store.get('class', 6, 'classroom.enable_shop')).toBe(true);
    // A different scope type with the same id is a different address.
    expect(store.get('student', 5, 'classroom.enable_shop')).toBeUndefined();
  });

  it('lists and filters', () => {
    const store = createSqliteAssignmentStore(db);
    store.set({ scopeType: 'class', scopeId: 5, capabilityKey: 'classroom.enable_shop', enabled: true });
    store.set({ scopeType: 'student', scopeId: 100, capabilityKey: 'classroom.enable_gacha', enabled: true });

    expect(store.list()).toHaveLength(2);
    expect(store.list('class')).toHaveLength(1);
    expect(store.list('class', 5)[0].capabilityKey).toBe('classroom.enable_shop');
    expect(store.list('class', 999)).toEqual([]);
  });

  it('persists across a fresh store over the same database', () => {
    createSqliteAssignmentStore(db).set({
      scopeType: 'class',
      scopeId: 5,
      capabilityKey: 'classroom.enable_shop',
      enabled: false,
    });
    // A second store object stands in for a process restart.
    expect(createSqliteAssignmentStore(db).get('class', 5, 'classroom.enable_shop')).toBe(false);
  });

  it('seeds a map of legacy column values', () => {
    const store = createSqliteAssignmentStore(db);
    const written = seedAssignments(store, 'class', 5, {
      'classroom.enable_shop': true,
      'classroom.enable_gacha': false,
    });
    expect(written).toBe(2);
    expect(store.list('class', 5)).toHaveLength(2);
  });

  it('is created by the kernel migration ledger', () => {
    const fresh = openDatabase(':memory:');
    const result = runMigrations(fresh, [capabilityAssignmentsMigration]);
    expect(result.applied).toEqual([CAPABILITY_ASSIGNMENTS_MIGRATION_ID]);
    fresh.close();
  });
});

describe('assignments drive permission decisions', () => {
  const engineWith = () => {
    const engine = createPermissionEngine({ store: createSqliteAssignmentStore(db) });
    engine.register(declarations, 'classroom');
    return engine;
  };

  it('falls back to the declared default with no assignment', () => {
    const engine = engineWith();
    expect(engine.can(student, 'classroom.enable_shop')).toBe(true);
    expect(engine.can(student, 'classroom.enable_gacha')).toBe(false);
  });

  it('an assignment for the class overrides the default', () => {
    const engine = engineWith();
    engine.store.set({ scopeType: 'class', scopeId: 5, capabilityKey: 'classroom.enable_shop', enabled: false });
    expect(engine.can(student, 'classroom.enable_shop')).toBe(false);
  });

  it('a student-scope assignment beats the class-scope one', () => {
    const engine = engineWith();
    engine.store.set({ scopeType: 'class', scopeId: 5, capabilityKey: 'classroom.enable_shop', enabled: true });
    engine.store.set({ scopeType: 'student', scopeId: 100, capabilityKey: 'classroom.enable_shop', enabled: false });
    expect(engine.can(student, 'classroom.enable_shop')).toBe(false);
  });

  it('does not apply one class decision to another class', () => {
    const engine = engineWith();
    engine.store.set({ scopeType: 'class', scopeId: 5, capabilityKey: 'classroom.enable_shop', enabled: false });

    const otherClass: Actor = { userId: 11, role: 'student', studentId: 101, classId: 6 };
    expect(engine.can(student, 'classroom.enable_shop')).toBe(false);
    expect(engine.can(otherClass, 'classroom.enable_shop')).toBe(true);
  });

  it('adding a capability needs no ALTER TABLE', () => {
    // The whole point of the table: a new flag is a declaration, not a schema change.
    const engine = engineWith();
    engine.register([{ key: 'classroom.enable_newthing', scope: 'class', default: false, label: '新功能' }], 'classroom');
    expect(engine.can(student, 'classroom.enable_newthing')).toBe(false);

    engine.store.set({ scopeType: 'class', scopeId: 5, capabilityKey: 'classroom.enable_newthing', enabled: true });
    expect(engine.can(student, 'classroom.enable_newthing')).toBe(true);
  });
});
