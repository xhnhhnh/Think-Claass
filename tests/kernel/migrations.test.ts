/**
 * Migration runner: ledger, tamper detection, ownership enforcement.
 *
 * The baseline applied DDL on every boot with no record of what had run. These
 * tests pin the behaviour that replaces it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkTableOwnership,
  extractTableOperations,
  listApplied,
  openDatabase,
  pluginTablePrefix,
  rollbackMigration,
  runMigrations,
  type Database,
  type Migration,
} from '@thinkclass/kernel';

let db: Database;

beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => {
  db.close();
});

const createWidgets: Migration = {
  id: '0001_create_widgets',
  owner: 'kernel',
  up: `CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL);`,
  down: `DROP TABLE widgets;`,
};

describe('migration runner', () => {
  it('applies pending migrations and records them', () => {
    const result = runMigrations(db, [createWidgets]);
    expect(result.applied).toEqual(['0001_create_widgets']);
    expect(listApplied(db).map((r) => r.id)).toEqual(['0001_create_widgets']);
  });

  it('skips already-applied migrations', () => {
    runMigrations(db, [createWidgets]);
    const second = runMigrations(db, [createWidgets]);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['0001_create_widgets']);
  });

  it('applies in id order regardless of input order', () => {
    const later: Migration = { id: '0002_add_column', owner: 'kernel', up: `ALTER TABLE widgets ADD COLUMN qty INTEGER;` };
    const result = runMigrations(db, [later, createWidgets]);
    expect(result.applied).toEqual(['0001_create_widgets', '0002_add_column']);
  });

  it('detects a migration whose SQL changed after being applied', () => {
    runMigrations(db, [createWidgets]);
    const tampered: Migration = { ...createWidgets, up: `CREATE TABLE widgets (id INTEGER PRIMARY KEY);` };
    expect(() => runMigrations(db, [tampered])).toThrow(/was modified after it was applied/);
  });

  it('leaves the database unchanged when a migration fails mid-way', () => {
    const broken: Migration = {
      id: '0002_broken',
      owner: 'kernel',
      up: `CREATE TABLE ok_table (id INTEGER); CREATE TABLE ok_table (id INTEGER);`,
    };
    expect(() => runMigrations(db, [createWidgets, broken])).toThrow(/0002_broken/);

    // 0002 is absent from the ledger and its partial work was rolled back.
    expect(listApplied(db).map((r) => r.id)).toEqual(['0001_create_widgets']);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='ok_table'`)
      .get();
    expect(tables).toBeUndefined();
  });

  it('rolls back a reversible migration', () => {
    runMigrations(db, [createWidgets]);
    expect(rollbackMigration(db, createWidgets)).toBe(true);
    expect(listApplied(db)).toEqual([]);
    const table = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'`).get();
    expect(table).toBeUndefined();
  });

  it('refuses to roll back a migration with no down step', () => {
    const irreversible: Migration = { id: '0003_x', owner: 'kernel', up: `CREATE TABLE x (id INTEGER);` };
    runMigrations(db, [irreversible]);
    expect(rollbackMigration(db, irreversible)).toBe(false);
    expect(listApplied(db).map((r) => r.id)).toContain('0003_x');
  });

  it('reports what would run in dry-run mode without touching the database', () => {
    const result = runMigrations(db, [createWidgets], { dryRun: true });
    expect(result.applied).toEqual(['0001_create_widgets']);
    expect(listApplied(db)).toEqual([]);
  });
});

describe('table operation extraction', () => {
  it('finds create, alter, drop and index targets', () => {
    const ops = extractTableOperations(`
      CREATE TABLE IF NOT EXISTS p_pet_pets (id INTEGER);
      ALTER TABLE p_pet_pets ADD COLUMN name TEXT;
      CREATE INDEX idx_pet ON p_pet_pets (name);
      DROP TABLE IF EXISTS p_pet_old;
    `);
    expect(ops).toEqual([
      { operation: 'create', table: 'p_pet_pets' },
      { operation: 'alter', table: 'p_pet_pets' },
      { operation: 'drop', table: 'p_pet_old' },
      { operation: 'index', table: 'p_pet_pets' },
    ]);
  });
});

describe('table ownership enforcement', () => {
  const coreTables = new Set(['sessions', 'settings']);

  it('derives the namespace prefix from a plugin slug', () => {
    expect(pluginTablePrefix('pet')).toBe('p_pet_');
    expect(pluginTablePrefix('acme_quiz')).toBe('p_acme_quiz_');
  });

  it('accepts a plugin migration touching only its own tables', () => {
    const migration: Migration = {
      id: 'p_pet_0001',
      owner: 'pet',
      up: `CREATE TABLE p_pet_pets (id INTEGER); ALTER TABLE p_pet_pets ADD COLUMN name TEXT;`,
    };
    expect(checkTableOwnership(migration, coreTables, { pluginPrefix: 'p_pet_' })).toEqual([]);
  });

  it('rejects a plugin migration reaching into a core table', () => {
    const migration: Migration = {
      id: 'p_pet_0002',
      owner: 'pet',
      up: `ALTER TABLE classes ADD COLUMN pet_enabled INTEGER;`,
    };
    const violations = checkTableOwnership(migration, coreTables, { pluginPrefix: 'p_pet_' });
    expect(violations).toHaveLength(1);
    expect(violations[0].table).toBe('classes');
    expect(violations[0].reason).toMatch(/p_pet_/);
  });

  it('rejects a plugin migration reaching into another plugin\u2019s tables', () => {
    const migration: Migration = {
      id: 'p_pet_0003',
      owner: 'pet',
      up: `DROP TABLE p_gacha_pools;`,
    };
    expect(checkTableOwnership(migration, coreTables, { pluginPrefix: 'p_pet_' })).toHaveLength(1);
  });

  it('lets the kernel touch kernel-owned tables', () => {
    const migration: Migration = { id: '0009', owner: 'kernel', up: `ALTER TABLE settings ADD COLUMN x TEXT;` };
    expect(checkTableOwnership(migration, coreTables)).toEqual([]);
  });

  it('rejects the kernel touching a plugin table', () => {
    const migration: Migration = { id: '0010', owner: 'kernel', up: `DROP TABLE p_pet_pets;` };
    expect(checkTableOwnership(migration, coreTables)).toHaveLength(1);
  });
});
