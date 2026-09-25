/**
 * Parent-buff plugin tests.
 *
 * The two guards moved here from `api/modules/platform/platform.service.test.ts`, along with
 * a real-SQLite layer that runs the repository through a `DbApi` built from the manifest's
 * declaration with ownership checking ON.
 *
 * The interesting case is the daily limit, because it is the only behavior in this domain
 * that depends on *time*: `date(created_at) = ?` compares against SQLite's own date function,
 * so a fake repository cannot prove it works. The real-database block drives it with rows
 * written by SQLite's CURRENT_TIMESTAMP, and then proves yesterday's blessing does not block
 * today's.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

import { ApiError, openDatabase, type Database } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import {
  createParentBuffRepository,
  type ParentBuffRepository,
} from '../../plugins/parent-buff/src/parentBuff.repository.js';
import { ParentBuffService, type ParentBuffClassroom } from '../../plugins/parent-buff/src/parentBuff.service.js';
import { ParentBuffController } from '../../plugins/parent-buff/src/parentBuff.controller.js';

function fakeRepository(overrides: Partial<ParentBuffRepository> = {}): ParentBuffRepository {
  return {
    findToday: vi.fn(() => undefined),
    insert: vi.fn(),
    ...overrides,
  };
}

/**
 * The classroom port the authorization check reads.
 *
 * `listStudentsByParent` is the only method this domain uses (see `ParentBuffClassroom`), so the
 * double is one function: parent 8 is linked to students 2 and 20, and nobody else is linked to
 * anything.
 */
function fakeClassroom(children: Array<{ id: number; classId: number }> = [
  { id: 2, classId: 1 },
  { id: 20, classId: 1 },
]): ParentBuffClassroom {
  return {
    listStudentsByParent: vi.fn(async () => children.map((child) => ({ ...child }))),
    getStudentById: vi.fn(async (id: number) => children.find((child) => child.id === id) ?? null),
    getClassById: vi.fn(async (id: number) => ({ id, teacherId: 5 })),
    checkStudentFeature: vi.fn(async () => ({ value: true })),
  } as never;
}

function fakeRequest(actor: { userId: number; role: string } | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'session' : 'none' } } as unknown as Request;
}

describe('ParentBuffService guards (relocated)', () => {
  it('requires a studentId', () => {
    const service = new ParentBuffService(fakeRepository(), fakeClassroom());

    expect(() => service.createParentBuff({})).toThrow(ApiError);
    try {
      service.createParentBuff({});
    } catch (error) {
      expect((error as ApiError).statusCode).toBe(400);
      expect((error as ApiError).message).toBe('Student ID required');
    }
  });

  it('rejects a second blessing on the same day', () => {
    const repository = fakeRepository({ findToday: vi.fn(() => ({ id: 1 })) });
    const service = new ParentBuffService(repository, fakeClassroom());

    try {
      service.createParentBuff({ studentId: 2 });
      throw new Error('expected a throw');
    } catch (error) {
      expect((error as ApiError).statusCode).toBe(400);
      expect((error as ApiError).message).toBe('今日已经施放过祝福了');
    }
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('records the blessing when none exists today', () => {
    const repository = fakeRepository();
    const service = new ParentBuffService(repository, fakeClassroom());

    expect(service.createParentBuff({ studentId: 2 })).toBeUndefined();
    expect(repository.insert).toHaveBeenCalledWith(2);
  });

  it('treats studentId 0 as missing, not as a valid id', () => {
    // `if (!studentId)` rather than `== null`, so 0 is rejected. Preserved deliberately.
    const service = new ParentBuffService(fakeRepository(), fakeClassroom());
    expect(() => service.createParentBuff({ studentId: 0 })).toThrow('Student ID required');
  });

  it('binds a parent to their own children, through the classroom port', async () => {
    const classroom = fakeClassroom();
    const service = new ParentBuffService(fakeRepository(), classroom);

    await expect(service.assertActorMayBless({ id: 8, role: 'parent' }, 2)).resolves.toBeUndefined();
    expect(classroom.listStudentsByParent).toHaveBeenCalledWith(8);

    // A student the parent is not linked to is refused rather than blessed.
    await expect(service.assertActorMayBless({ id: 8, role: 'parent' }, 99)).rejects.toMatchObject({
      status: 403,
      message: '无权限执行该操作',
    });

    await expect(service.assertActorMayBless({ id: 5, role: 'teacher' }, 2)).resolves.toBeUndefined();
    await expect(service.assertActorMayBless({ id: 5, role: 'teacher' }, 99)).rejects.toMatchObject({ status: 403 });
    await expect(service.assertActorMayBless({ id: 6, role: 'teacher' }, 2)).rejects.toMatchObject({ status: 403 });
    const disabled = fakeClassroom();
    vi.mocked(disabled.checkStudentFeature).mockResolvedValue({ refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } });
    await expect(new ParentBuffService(fakeRepository(), disabled).assertActorMayBless({ id: 8, role: 'parent' }, 2))
      .rejects.toMatchObject({ status: 403, message: '该功能当前已关闭' });
  });
});

describe('ParentBuffController', () => {
  it('answers a bare success envelope for a parent blessing their own child', async () => {
    const service = { createParentBuff: vi.fn(), assertActorMayBless: vi.fn(async () => undefined) };
    const controller = new ParentBuffController(service as never);

    expect(await controller.createParentBuff(fakeRequest({ userId: 8, role: 'parent' }), { studentId: 2 })).toEqual({
      success: true,
    });
    expect(service.assertActorMayBless).toHaveBeenCalledWith({ id: 8, role: 'parent', studentId: undefined }, 2);
    expect(service.createParentBuff).toHaveBeenCalledWith({ studentId: 2 });
  });

  it('lets an ApiError propagate with its own status and message', async () => {
    // The legacy `throwPlatformError(error, errorMessage)` wrapper is gone; the composition's
    // global filter renders the ApiError. What must not change is the status and the body.
    const controller = new ParentBuffController({
      assertActorMayBless: vi.fn(async () => undefined),
      createParentBuff: () => {
        throw new ApiError(400, '今日已经施放过祝福了');
      },
    } as never);

    try {
      await controller.createParentBuff(fakeRequest({ userId: 8, role: 'parent' }), { studentId: 2 });
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(400);
      expect((error as ApiError).message).toBe('今日已经施放过祝福了');
    }
  });
});

/**
 * The manifest is the declaration the ownership check enforces; run the shipped SQL through
 * it against a real database.
 */
describe('shipped SQL matches the manifest data declaration', () => {
  /** Mirrors `plugins/parent-buff/plugin.json` -> `data`. */
  const DECLARED = { adopted: ['parent_activity'], reads: [] as string[] };

  let db: Database;
  let api: DbApi;

  beforeEach(() => {
    db = openDatabase(':memory:');
    // The real DDL, from api/schema/legacyBootSchema.ts: parent_id and student_id are
    // nullable references, activity_type is NOT NULL, points_awarded defaults to 0.
    db.exec(`
      CREATE TABLE parent_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER,
        student_id INTEGER,
        activity_type TEXT NOT NULL,
        description TEXT,
        points_awarded INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    api = createDbApi({
      db,
      pluginId: 'parent-buff',
      ownedTables: new Set(DECLARED.adopted),
      readTables: new Set(DECLARED.reads),
      strict: true,
    });
  });

  it('both statements pass the ownership check', () => {
    const repository = createParentBuffRepository(api);
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];

    expect(() => repository.findToday(2, today)).not.toThrow();
    expect(() => repository.insert(2)).not.toThrow();
  });

  it('refuses a write outside its declaration', () => {
    // Non-vacuity: the harness can fail.
    expect(() => api.run('DELETE FROM students WHERE id = ?', [1])).toThrow(
      /may not write to table "students"/,
    );
  });

  it('records the row the original recorded, with no parent_id', () => {
    const repository = createParentBuffRepository(api);
    repository.insert(2);

    const row = db.prepare('SELECT * FROM parent_activity').get() as Record<string, unknown>;
    expect(row).toMatchObject({ parent_id: null, student_id: 2, activity_type: 'PARENT_BUFF', points_awarded: 0 });
    expect(row.created_at).toBeTruthy();
  });

  it('enforces one blessing per calendar day, using SQLite dates', () => {
    const repository = createParentBuffRepository(api);
    const service = new ParentBuffService(repository, fakeClassroom());
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];

    // First blessing succeeds, second is refused - and the guard really consults the table.
    service.createParentBuff({ studentId: 2 });
    expect(repository.findToday(2, today)).toBeTruthy();
    expect(() => service.createParentBuff({ studentId: 2 })).toThrow('今日已经施放过祝福了');

    // Another student is unaffected.
    expect(() => service.createParentBuff({ studentId: 3 })).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM parent_activity').get()).toEqual({ n: 2 });
  });

  it("does not let yesterday's blessing block today", () => {
    const repository = createParentBuffRepository(api);
    const service = new ParentBuffService(repository, fakeClassroom());

    // Write the row with an explicit yesterday timestamp rather than relying on the clock.
    db.prepare(
      "INSERT INTO parent_activity (student_id, activity_type, points_awarded, created_at) VALUES (?, ?, ?, date('now', '-1 day'))",
    ).run(2, 'PARENT_BUFF', 0);

    expect(() => service.createParentBuff({ studentId: 2 })).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS n FROM parent_activity').get()).toEqual({ n: 2 });
  });
});
