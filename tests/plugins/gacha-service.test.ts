/**
 * GachaService unit tests.
 *
 * Rewritten for the plugin world in P4.3b. The pre-migration test
 * (`api/modules/gacha/gacha.service.test.ts`) faked a `GachaRepository` that also owned
 * `students` and `records`; both of those moved behind `classroom.public`, so the test
 * now fakes a *port* as well and can assert what actually matters: that the spend and
 * the ledger go through the port, that a refused transfer costs nothing, and that a
 * failed pet write gives the points back.
 *
 * The three behavioural expectations are carried over unchanged from the
 * pre-migration test; the rest cover the port boundary the migration introduced.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort, ClassroomRefusal, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { CreatePetDictionaryPayload } from '@thinkclass/contracts/domains/gacha';
import { ApiError, openDatabase } from '@thinkclass/kernel';
import { createDbApi, TableOwnershipError } from '@thinkclass/plugin-runtime';

import { createGachaRepository } from '../../plugins/gacha/src/gacha.repository.js';
import { GachaService } from '../../plugins/gacha/src/gacha.service.js';
import type {
  GachaPool,
  GachaRepository,
  PetCollectionItem,
  PetDictionaryEntry,
} from '../../plugins/gacha/src/gacha.types.js';

class FakeGachaRepository implements GachaRepository {
  pools: GachaPool[] = [];
  dictionary: PetDictionaryEntry[] = [{ id: 1, name: '星兽', rarity: 'SSR', element: 'star', base_power: 100 }];
  collection: PetCollectionItem[] = [];
  nextDictionaryId = 2;
  nextInstanceId = 10;
  /** When set, the draw's platform writes fail, for compensation tests. */
  failInserts = false;

  transaction<T>(fn: () => T): T {
    return fn();
  }
  listDictionary() {
    return this.dictionary;
  }
  createDictionaryEntry(input: CreatePetDictionaryPayload) {
    const id = this.nextDictionaryId++;
    this.dictionary.push({ ...input, id });
    return id;
  }
  listPools(classId: number) {
    return this.pools.filter((pool) => pool.class_id === classId);
  }
  listActivePools(classId: number) {
    return this.listPools(classId).filter((pool) => pool.is_active);
  }
  createDefaultPool(classId: number) {
    this.pools.push({
      id: 1,
      class_id: classId,
      name: '默认',
      cost_points: 100,
      ssr_rate: 1,
      sr_rate: 0,
      r_rate: 0,
      n_rate: 0,
      is_active: 1,
    });
  }
  getPool(poolId: number) {
    return this.pools.find((pool) => pool.id === poolId) ?? null;
  }
  listDictionaryByRarity(rarity: string) {
    return this.dictionary.filter((pet) => pet.rarity === rarity);
  }
  insertStudentPet(studentId: number, petDictId: number) {
    if (this.failInserts) throw new Error('sqlite: disk I/O error');
    const pet = this.dictionary.find((entry) => entry.id === petDictId)!;
    this.collection.push({ ...pet, instance_id: this.nextInstanceId++, level: 1, experience: 0, is_active: 0 });
  }
  listCollection() {
    return this.collection;
  }
  clearActivePet() {
    this.collection = this.collection.map((pet) => ({ ...pet, is_active: 0 }));
  }
  setActivePet(_studentId: number, instanceId: number) {
    const index = this.collection.findIndex((pet) => pet.instance_id === instanceId);
    if (index < 0) return 0;
    this.collection[index] = { ...this.collection[index], is_active: 1 };
    return 1;
  }
}

/**
 * A fake classroom: the student balance and the ledger live here, exactly as they do
 * behind the real port. `featureEnabled` is the `enable_gacha` gate.
 */
class FakeClassroom implements ClassroomPort {
  /** Account-deletion scope (P4.3b.14): gacha never asks for it; the port requires both. */
  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  students = new Map<number, { snapshot: StudentSnapshot; featureEnabled: boolean }>();
  ledger: Array<{ studentId: number; type: string; amount: number; description: string }> = [];
  /** Set to make `transferStudentCredits` refuse, for the no-overdraw tests. */
  failCredits: ClassroomRefusal | null = null;

  async getStudentById(studentId: number) {
    return this.students.get(studentId)?.snapshot ?? null;
  }
  async getClassById(classId: number) {
    return classId === 3 ? { id: 3, name: '一班', teacherId: 7, inviteCode: 'ABC' } : null;
  }
  async listClassStudents(classId: number) {
    return [...this.students.values()].map((entry) => entry.snapshot).filter((s) => s.classId === classId);
  }
  async assertStudentInClass(studentId: number, classId: number) {
    const entry = this.students.get(studentId);
    if (!entry || entry.snapshot.classId !== classId) throw new Error('not in class');
  }
  async adjustPoints() {
    throw new Error('not used by gacha');
  }
  async transferStudentCredits(input: { studentId: number; delta: number }) {
    if (this.failCredits) return { refusal: this.failCredits };
    const entry = this.students.get(input.studentId);
    if (!entry) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    const available = entry.snapshot.availablePoints + input.delta;
    if (available < 0) {
      return { refusal: { code: 'insufficient-credits' as const, message: '积分不足' } };
    }
    entry.snapshot = { ...entry.snapshot, availablePoints: available };
    return { value: { availablePoints: available } };
  }
  async recordStudentLedgerEntry(entry: { studentId: number; type: string; amount: number; description: string }) {
    this.ledger.push(entry);
  }
  async checkStudentFeature(studentId: number) {
    const entry = this.students.get(studentId);
    if (!entry) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    if (!entry.featureEnabled) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true };
  }
  async checkClassFeature() {
    const enabled = [...this.students.values()].some((entry) => entry.featureEnabled);
    if (!enabled) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true };
  }
}

function setup() {
  const repository = new FakeGachaRepository();
  const classroom = new FakeClassroom();
  classroom.students.set(1, {
    snapshot: { id: 1, classId: 3, userId: 100, name: '小明', totalPoints: 500, availablePoints: 500 },
    featureEnabled: true,
  });
  return { repository, classroom, service: new GachaService(repository, classroom, () => 0) };
}

describe('GachaService', () => {
  let repository: FakeGachaRepository;
  let classroom: FakeClassroom;
  let service: GachaService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
  });

  it('auto-creates class pools and draws into the collection', async () => {
    expect(await service.listPools(3)).toHaveLength(1);
    const results = await service.draw(1, { poolId: 1, times: 1 });

    expect(results[0].rarity).toBe('SSR');
    expect(repository.collection).toHaveLength(1);
    // 500 - 100, moved through the port rather than by writing `students`
    expect(classroom.students.get(1)?.snapshot.availablePoints).toBe(400);
  });

  it('rejects draws with insufficient points', async () => {
    await service.listPools(3);
    classroom.students.get(1)!.snapshot = { ...classroom.students.get(1)!.snapshot, availablePoints: 0 };

    await expect(service.draw(1, { poolId: 1, times: 1 })).rejects.toThrow(ApiError);
    expect(repository.collection).toHaveLength(0);
  });

  it('keeps only one active pet', async () => {
    await service.listPools(3);
    await service.draw(1, { poolId: 1, times: 1 });

    expect((await service.setActivePet(1, 10)).activePetId).toBe(10);
    expect(repository.collection[0].is_active).toBe(1);
  });

  it('creates dictionary entries', () => {
    const created = service.createDictionary({ name: '月兽', element: 'moon', rarity: 'SR', base_power: 80 });

    expect(created.id).toBe(2);
    expect(service.listDictionary().map((pet) => pet.name)).toEqual(['星兽', '月兽']);
  });

  it('appends the draw to the shared ledger through the port', async () => {
    await service.listPools(3);
    await service.draw(1, { poolId: 1, times: 1 });

    expect(classroom.ledger).toHaveLength(1);
    expect(classroom.ledger[0]).toMatchObject({ studentId: 1, type: 'GACHA_PULL', amount: -100 });
    expect(classroom.ledger[0].description).toContain('Gacha Pull');
  });

  it('rejects the whole operation when the class has the feature disabled', async () => {
    classroom.students.get(1)!.featureEnabled = false;

    await expect(service.listPools(3)).rejects.toMatchObject({ status: 403 });
    await expect(service.draw(1, { poolId: 1, times: 1 })).rejects.toMatchObject({ status: 403 });

    // Nothing moved: the gate runs before the pool lookup and before any spend.
    expect(repository.pools).toHaveLength(0);
    expect(repository.collection).toHaveLength(0);
    expect(classroom.students.get(1)?.snapshot.availablePoints).toBe(500);
    expect(classroom.ledger).toHaveLength(0);
  });

  it('reports a missing student as 404 before the feature gate', async () => {
    await expect(service.draw(999, { poolId: 1, times: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(service.listCollection(999)).rejects.toMatchObject({ status: 404 });
  });

  it('validates the draw payload before touching the port', async () => {
    await expect(service.draw(1, { poolId: 1, times: 0 })).rejects.toMatchObject({
      status: 400,
      message: 'Times is invalid',
    });
    expect(classroom.ledger).toHaveLength(0);
  });

  /**
   * The interesting failure: the port has already debited the balance, so a platform
   * write that fails must be compensated or the student would be charged for pets they
   * never received. (The pre-migration version could not fail this way - it was one
   * transaction - so this is new behaviour the migration must get right.)
   */
  it('refunds the debit when the pet write fails', async () => {
    await service.listPools(3);
    repository.failInserts = true;

    await expect(service.draw(1, { poolId: 1, times: 1 })).rejects.toThrow('disk I/O error');

    expect(classroom.students.get(1)?.snapshot.availablePoints).toBe(500);
    expect(repository.collection).toHaveLength(0);
    expect(classroom.ledger).toHaveLength(0);
  });

  it('rejects the draw when the port refuses the credit transfer', async () => {
    await service.listPools(3);
    classroom.failCredits = { code: 'insufficient-credits', message: '积分不足' };

    await expect(service.draw(1, { poolId: 1, times: 1 })).rejects.toMatchObject({
      status: 400,
      message: 'Insufficient points',
    });

    expect(repository.collection).toHaveLength(0);
    expect(classroom.students.get(1)?.snapshot.availablePoints).toBe(500);
    expect(classroom.ledger).toHaveLength(0);
  });
});

/**
 * The repository is thin, but the ownership declaration is the security boundary, so
 * it is worth one test that the plugin's `DbApi` is what it actually reaches for - and
 * that it never touches `students` or `records`, which belong to classroom.
 */
describe('createGachaRepository', () => {
  it('touches only tables gacha declared', () => {
    const seen: string[] = [];
    const stub = {
      get: (sql: string) => {
        seen.push(sql);
        return undefined;
      },
      query: (sql: string) => {
        seen.push(sql);
        return [];
      },
      run: (sql: string) => {
        seen.push(sql);
        return { changes: 0, lastInsertRowid: 0 };
      },
      tx: <T>(fn: (tx: unknown) => T) => fn(stub),
      exec: () => {},
    };

    const repository = createGachaRepository(stub as never);
    repository.listDictionary();
    repository.createDictionaryEntry({ name: '星兽', element: 'star', rarity: 'SSR', base_power: 100 });
    repository.listPools(3);
    repository.listActivePools(3);
    repository.createDefaultPool(3);
    repository.getPool(1);
    repository.listDictionaryByRarity('SSR');
    repository.insertStudentPet(1, 1);
    repository.listCollection(1);
    repository.clearActivePet(1);
    repository.setActivePet(1, 10);
    repository.transaction(() => repository.listPools(3));

    const touched = new Set<string>();
    for (const sql of seen) {
      for (const match of sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/gi)) touched.add(match[1]);
    }

    expect([...touched].sort()).toEqual(['gacha_pools', 'pet_dictionary', 'student_pets']);
    expect([...touched]).not.toContain('students');
    expect([...touched]).not.toContain('records');
  });
});

/**
 * The repository driven through a *real* `DbApi` in strict mode over in-memory
 * SQLite. This is what the plugin runtime hands `createGachaRepository` outside
 * production, so it is the check that every statement stays inside `data.adopted` -
 * and, unlike the name-shaped stub above, it also proves the SQL runs: a column that
 * does not exist or a syntax error fails here.
 */
describe('createGachaRepository against a real ownership-checked DbApi', () => {
  function setupDb() {
    const db = openDatabase(':memory:');
    db.exec(`
      CREATE TABLE pet_dictionary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        element TEXT NOT NULL,
        rarity TEXT NOT NULL,
        base_power INTEGER NOT NULL,
        description TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE student_pets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        pet_dict_id INTEGER,
        level INTEGER DEFAULT 1,
        experience INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE gacha_pools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER,
        name TEXT NOT NULL,
        cost_points INTEGER NOT NULL,
        ssr_rate REAL DEFAULT 0.01,
        sr_rate REAL DEFAULT 0.1,
        r_rate REAL DEFAULT 0.3,
        n_rate REAL DEFAULT 0.59,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO pet_dictionary (name, element, rarity, base_power, description)
      VALUES ('星兽', 'star', 'SSR', 100, '');
    `);

    const api = createDbApi({
      db,
      pluginId: 'gacha',
      // Exactly `data.adopted` from plugins/gacha/plugin.json.
      ownedTables: new Set(['pet_dictionary', 'gacha_pools', 'student_pets']),
      readTables: new Set(),
      strict: true,
    });
    return { db, api };
  }

  it('runs a full draw against the real tables', async () => {
    const { db, api } = setupDb();
    const classroom = new FakeClassroom();
    classroom.students.set(1, {
      snapshot: { id: 1, classId: 3, userId: 100, name: '小明', totalPoints: 500, availablePoints: 500 },
      featureEnabled: true,
    });
    const service = new GachaService(createGachaRepository(api), classroom, () => 0);

    const pools = await service.listPools(3);
    expect(pools).toHaveLength(1);

    const results = await service.draw(1, { poolId: pools[0].id, times: 1 });
    expect(results[0].rarity).toBe('SSR');

    expect(db.prepare('SELECT COUNT(*) AS n FROM student_pets').get()).toEqual({ n: 1 });
    expect(classroom.students.get(1)?.snapshot.availablePoints).toBe(400);
    expect(classroom.ledger).toEqual([
      {
        studentId: 1,
        type: 'GACHA_PULL',
        amount: -100,
        description: 'Performed 1x Gacha Pull from 限定召唤: 星空之约',
      },
    ]);
  });

  it('refuses the two statements the pre-migration repository was allowed to make', () => {
    const { api } = setupDb();

    // The old SQLite repository did both of these directly. The ownership check is
    // what stops the plugin from reintroducing them, and it runs before execution -
    // neither table even exists in this database.
    expect(() => api.run('UPDATE students SET available_points = ? WHERE id = ?', [0, 1])).toThrow(
      TableOwnershipError,
    );
    expect(() =>
      api.run('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)', [
        1,
        'GACHA_PULL',
        -100,
        '',
      ]),
    ).toThrow(TableOwnershipError);
  });
});
