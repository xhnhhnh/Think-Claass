/**
 * System repository.
 *
 * The SQL is relocated from `api/modules/system/system.service.ts` unchanged; only the
 * connection changes - `ctx.db` instead of the raw `api/db.ts` handle, so every
 * statement is checked against the tables the manifest declares.
 *
 * Parameter values are forwarded *exactly* as the caller passed them (including
 * `undefined`), because that is what the historical implementation did: better-sqlite3
 * folds an undefined bound parameter to NULL, so coercing to `null` here would look
 * equivalent while changing what a probe observes.
 *
 * `backup/export` is the reason `data.reads` is long: it dumps whole tables that belong
 * to other domains. That read-only access is declared per table rather than hidden
 * behind `SELECT *` on a dynamically built name, because the ownership check cannot see
 * through a computed statement.
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';

import type { QuestionInput, SettingRow, SystemRepository } from './system.types.js';

/**
 * Tables `backup/export` dumps, in the order the historical implementation used.
 *
 * All 17 exist in `api/schema/legacyBootSchema.ts` (verified against the boot DDL, not
 * assumed), so the export never hits "no such table" on a database the application
 * created.
 */
export const BACKUP_TABLES = [
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
  'question_bank',
  'system_settings',
] as const;

/** Pass through whatever the caller gave us, `undefined` included. */
const passthrough = (value: unknown): SqlParam => value as SqlParam;

export function createSystemRepository(db: DbApi): SystemRepository {
  return {
    listQuestions(teacherId) {
      return db.query(
        'SELECT * FROM question_bank WHERE teacher_id = ? ORDER BY created_at DESC',
        [passthrough(teacherId)],
      );
    },

    createQuestion(input: QuestionInput) {
      const info = db.run(
        'INSERT INTO question_bank (title, type, options, answer, explanation, teacher_id) VALUES (?, ?, ?, ?, ?, ?)',
        [
          passthrough(input.title),
          passthrough(input.type),
          passthrough(input.options),
          passthrough(input.answer),
          passthrough(input.explanation),
          passthrough(input.teacher_id),
        ],
      );

      return db.get('SELECT * FROM question_bank WHERE id = ?', [Number(info.lastInsertRowid)]);
    },

    updateQuestion(id, input) {
      db.run(
        'UPDATE question_bank SET title = ?, type = ?, options = ?, answer = ?, explanation = ? WHERE id = ?',
        [
          passthrough(input.title),
          passthrough(input.type),
          passthrough(input.options),
          passthrough(input.answer),
          passthrough(input.explanation),
          id,
        ],
      );
    },

    deleteQuestion(id) {
      db.run('DELETE FROM question_bank WHERE id = ?', [id]);
    },

    listSettings() {
      return db.query<SettingRow>('SELECT * FROM system_settings');
    },

    findSetting(key) {
      return db.get('SELECT id FROM system_settings WHERE key = ?', [passthrough(key)]) !== undefined;
    },

    updateSetting(key, value, description) {
      db.run('UPDATE system_settings SET value = ?, description = ? WHERE key = ?', [
        passthrough(value),
        passthrough(description),
        passthrough(key),
      ]);
    },

    insertSetting(key, value, description) {
      db.run('INSERT INTO system_settings (key, value, description) VALUES (?, ?, ?)', [
        passthrough(key),
        passthrough(value),
        passthrough(description),
      ]);
    },

    listLogs() {
      return db.query(
        `SELECT l.*, u.username as teacher_name
         FROM operation_logs l
         LEFT JOIN users u ON l.teacher_id = u.id
         ORDER BY l.created_at DESC
         LIMIT 100`,
      );
    },

    dumpTable(table) {
      // `table` is never caller-supplied: it comes from `BACKUP_TABLES` above, so the
      // template interpolation cannot be an injection point. Interpolation (rather than
      // a bound parameter) is required because SQLite will not bind an identifier.
      return db.query(`SELECT * FROM ${table}`);
    },
  };
}
