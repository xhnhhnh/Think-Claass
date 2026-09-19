/**
 * System plugin tests.
 *
 * Two things are worth pinning here, and neither is a port interaction:
 *
 *  1. the eight envelope shapes, because this domain does NOT use the `{success, data}`
 *     form the rest of the API uses - it returns `{success, questions|settings|logs}`,
 *     and `backup/export` is not an envelope at all;
 *  2. that `upsertSetting` still takes the update-if-exists branch, which is the only
 *     real branching logic the domain has.
 *
 * The final block is the interesting one: it executes the repository's SQL against a real
 * in-memory database through a `DbApi` built from the manifest's data declaration with
 * ownership checking ON. A statement naming an undeclared table throws there, so the
 * manifest and the shipped SQL cannot drift apart silently.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openDatabase, type Database } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import { createSystemRepository, BACKUP_TABLES } from '../../plugins/system/src/system.repository.js';
import { SystemService } from '../../plugins/system/src/system.service.js';
import { SystemController } from '../../plugins/system/src/system.controller.js';
import type { QuestionInput, SystemRepository } from '../../plugins/system/src/system.types.js';

type Mocked = ReturnType<typeof vi.fn>;

function fakeRepository(overrides: Partial<SystemRepository> = {}): SystemRepository {
  return {
    listQuestions: vi.fn(() => []),
    createQuestion: vi.fn(() => ({ id: 1 })),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
    listSettings: vi.fn(() => []),
    findSetting: vi.fn(() => false),
    updateSetting: vi.fn(),
    insertSetting: vi.fn(),
    listLogs: vi.fn(() => []),
    dumpTable: vi.fn(() => []),
    ...overrides,
  };
}

describe('SystemController envelope shapes', () => {
  let repository: SystemRepository;
  let controller: SystemController;

  beforeEach(() => {
    repository = fakeRepository();
    controller = new SystemController(new SystemService(repository));
  });

  it('lists questions under `questions`, not `data`', () => {
    (repository.listQuestions as Mocked).mockReturnValue([{ id: 1, title: 'Q' }]);

    expect(controller.getQuestions('5')).toEqual({
      success: true,
      questions: [{ id: 1, title: 'Q' }],
    });
    expect(repository.listQuestions).toHaveBeenCalledWith('5');
  });

  it('returns the created question under `question`', () => {
    (repository.createQuestion as Mocked).mockReturnValue({ id: 9, title: 'New' });

    expect(controller.createQuestion({ title: 'New' } as QuestionInput)).toEqual({
      success: true,
      question: { id: 9, title: 'New' },
    });
  });

  it('acknowledges updates and deletes with a bare success', () => {
    expect(controller.updateQuestion('3', {} as QuestionInput)).toEqual({ success: true });
    expect(repository.updateQuestion).toHaveBeenCalledWith('3', {});
    expect(controller.deleteQuestion('3')).toEqual({ success: true });
    expect(repository.deleteQuestion).toHaveBeenCalledWith('3');
  });

  it('lists settings and logs under their own keys', () => {
    (repository.listSettings as Mocked).mockReturnValue([{ key: 'k' }]);
    (repository.listLogs as Mocked).mockReturnValue([{ id: 1 }]);

    expect(controller.getSettings()).toEqual({ success: true, settings: [{ key: 'k' }] });
    expect(controller.getLogs()).toEqual({ success: true, logs: [{ id: 1 }] });
  });

  it('sends the backup body verbatim with the download headers', () => {
    // Nest would otherwise serialize the returned string *as* a JSON string, so the
    // download would arrive quoted and escaped. `@Res()` exists to prevent exactly that.
    const response = { setHeader: vi.fn(), send: vi.fn() };

    controller.exportBackup(response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-disposition',
      'attachment; filename=backup.json',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-type', 'application/json');
    expect(response.send).toHaveBeenCalledTimes(1);
    expect(typeof response.send.mock.calls[0][0]).toBe('string');
  });
});

describe('SystemService.upsertSetting branch', () => {
  it('updates when the key already exists', () => {
    const repository = fakeRepository({ findSetting: vi.fn(() => true) });
    new SystemService(repository).upsertSetting({ key: 'k', value: 'v', description: 'd' });

    expect(repository.updateSetting).toHaveBeenCalledWith('k', 'v', 'd');
    expect(repository.insertSetting).not.toHaveBeenCalled();
  });

  it('inserts when the key is new', () => {
    const repository = fakeRepository({ findSetting: vi.fn(() => false) });
    new SystemService(repository).upsertSetting({ key: 'k', value: 'v', description: 'd' });

    expect(repository.insertSetting).toHaveBeenCalledWith('k', 'v', 'd');
    expect(repository.updateSetting).not.toHaveBeenCalled();
  });
});

describe('SystemService.exportBackup', () => {
  it('dumps every backup table into one pretty-printed JSON object', () => {
    const repository = fakeRepository({ dumpTable: vi.fn((table: string) => [{ table }]) });

    const parsed = JSON.parse(new SystemService(repository).exportBackup());

    expect(Object.keys(parsed)).toEqual([...BACKUP_TABLES]);
    expect(parsed.users).toEqual([{ table: 'users' }]);
    expect(repository.dumpTable).toHaveBeenCalledTimes(BACKUP_TABLES.length);
  });

  it('fails the whole export when one table is unreadable', () => {
    // Pins the *current* behavior: a failure propagates rather than silently returning a
    // partial backup, which for a download named backup.json would be worse than an error.
    const repository = fakeRepository({
      dumpTable: vi.fn((table: string) => {
        if (table === 'pets') throw new Error('no such table: pets');
        return [];
      }),
    });

    expect(() => new SystemService(repository).exportBackup()).toThrow('no such table: pets');
  });
});

/**
 * The manifest is the declaration the ownership check enforces, so exercise the real SQL
 * through it rather than trusting that the two lists agree.
 */
describe('shipped SQL matches the manifest data declaration', () => {
  /** Mirrors `plugins/system/plugin.json` -> `data`. */
  const DECLARED = {
    adopted: ['question_bank', 'system_settings'],
    reads: [
      'users',
      'classes',
      'students',
      'pets',
      'shop_items',
      'records',
      'point_presets',
      'student_groups',
      'praises',
      'announcements',
      'settings',
      'certificates',
      'messages',
      'family_tasks',
      'class_announcements',
      'operation_logs',
    ],
  };

  const ALL_TABLES = [...DECLARED.adopted, ...DECLARED.reads];

  let db: Database;
  let api: DbApi;

  beforeEach(() => {
    db = openDatabase(':memory:');

    for (const table of ALL_TABLES) {
      // Empty tables: the point is the ownership check and the SQL's shape, not the DDL
      // (guardrail G13 owns schema completeness).
      const columns =
        table === 'question_bank'
          ? 'id INTEGER PRIMARY KEY, title TEXT, type TEXT, options TEXT, answer TEXT, explanation TEXT, teacher_id TEXT, created_at DATETIME'
          : table === 'system_settings'
            ? 'id INTEGER PRIMARY KEY, key TEXT, value TEXT, description TEXT, updated_at DATETIME'
            : table === 'operation_logs'
              ? 'id INTEGER PRIMARY KEY, teacher_id INTEGER, created_at DATETIME'
              : table === 'users'
                ? 'id INTEGER PRIMARY KEY, username TEXT'
                : 'id INTEGER PRIMARY KEY';
      db.exec(`CREATE TABLE ${table} (${columns});`);
    }

    api = createDbApi({
      db,
      pluginId: 'system',
      ownedTables: new Set(DECLARED.adopted),
      readTables: new Set(DECLARED.reads),
      strict: true,
    });
  });

  it('every repository statement passes the ownership check', () => {
    const repository = createSystemRepository(api);

    expect(() => repository.listQuestions('5')).not.toThrow();
    expect(() => repository.createQuestion({ title: 't' })).not.toThrow();
    expect(() => repository.updateQuestion('1', { title: 't' })).not.toThrow();
    expect(() => repository.deleteQuestion('1')).not.toThrow();
    expect(() => repository.listSettings()).not.toThrow();
    expect(() => repository.findSetting('k')).not.toThrow();
    expect(() => repository.updateSetting('k', 'v', 'd')).not.toThrow();
    expect(() => repository.insertSetting('k', 'v', 'd')).not.toThrow();
    expect(() => repository.listLogs()).not.toThrow();
  });

  it('every backup table is declared, so dumpTable passes the ownership check', () => {
    const repository = createSystemRepository(api);

    for (const table of BACKUP_TABLES) {
      expect(() => repository.dumpTable(table), `undeclared table: ${table}`).not.toThrow();
    }
  });

  it('BACKUP_TABLES names no table outside the declaration', () => {
    const declared = new Set(ALL_TABLES);
    expect(BACKUP_TABLES.filter((table) => !declared.has(table))).toEqual([]);
  });

  it('refuses a write to a table the plugin only declared as read', () => {
    // Non-vacuity: proves the harness above can fail, so the passes above mean something.
    // `operation_logs` belongs to the kernel's audit sink; a write must be refused.
    expect(() => api.run('DELETE FROM operation_logs WHERE id = ?', [1])).toThrow(
      /may not write to table "operation_logs"/,
    );
  });
});
