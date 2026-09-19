/**
 * classroom - foundation plugin.
 *
 * Owns classes and students and publishes `classroom.public`. The HTTP surface of
 * this domain still lives in `api/modules/classroom` and moves here in P4; what P3
 * establishes is the *access path*: every other plugin reaches student and class
 * data through this port, never through the tables.
 *
 * The tables are declared as `adopted` rather than `tables` because they still carry
 * their legacy names. That is a transitional state with a guardrail on it (G10),
 * not a design.
 */

import type {
  ClassSnapshot,
  ClassroomPort,
  PointLedgerEntry,
  StudentSnapshot,
} from '@thinkclass/contracts/domains/classroom';
import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

interface StudentRow {
  id: number;
  user_id: number | null;
  class_id: number;
  group_id?: number | null;
  name: string;
  total_points: number | null;
  available_points: number | null;
}

interface ClassRow {
  id: number;
  name: string;
  teacher_id: number | null;
  invite_code: string;
  [column: string]: unknown;
}

/** Raw `records` row; mapped to `PointLedgerRow` at the port boundary. */
interface LedgerRow {
  id: number;
  student_id: number;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

/** Prefix identifying a legacy class-scope feature column. */
const LEGACY_FEATURE_PREFIX = 'enable_';

/** Plugin that owns class-scope capabilities; must match the manifest id. */
const CAPABILITY_OWNER = 'classroom';

function toStudentSnapshot(row: StudentRow, decryptName: (value: string) => string): StudentSnapshot {
  return {
    id: row.id,
    classId: row.class_id,
    userId: row.user_id ?? null,
    // Names are AES-encrypted at rest for modern rows and plaintext for very old ones
    // (api/services/studentService.ts). The host supplies the decryptor, so a plugin
    // never has to reach for `api/**` or re-implement a security-sensitive helper.
    name: decryptName(row.name),
    totalPoints: row.total_points ?? 0,
    availablePoints: row.available_points ?? 0,
    groupId: row.group_id ?? null,
  };
}

function toClassSnapshot(row: ClassRow): ClassSnapshot {
  return {
    id: row.id,
    name: row.name,
    teacherId: row.teacher_id ?? null,
    inviteCode: row.invite_code,
  };
}

/**
 * Build the classroom port.
 *
 * `decryptName` is injected rather than imported: student names are AES-encrypted at
 * rest (`api/services/studentService.ts`), and the plugin must not reach into `api/**`
 * for the key or re-implement the cipher. The host passes its decryptor; the default is
 * the identity function, which is correct for a database whose rows were never
 * encrypted (the in-memory test databases).
 */
export function createClassroomPort(
  ctx: KernelContext,
  options: { decryptName?: (value: string) => string } = {},
): ClassroomPort {
  const db = ctx.db;
  const decryptName = options.decryptName ?? ((value: string) => value);

  function requireStudent(studentId: number): StudentRow {
    const row = db.get<StudentRow>(`SELECT * FROM students WHERE id = ?`, [studentId]);
    if (!row) throw new Error(`学生不存在: ${studentId}`);
    return row;
  }

  /**
   * Is a class-scope feature flag on?
   *
   * Resolution order is assignment first, then the legacy column - the semantics the
   * pre-migration `api/utils/classFeatures.ts` implemented. The flag names are
   * *derived from the class row* rather than hardcoded, so this file carries no list
   * of the 19 keys and a column added by a future migration is picked up for free.
   */
  function isFeatureEnabled(classId: number, feature: string): boolean {
    const assigned = ctx.permissions.assignedTo('class', classId, `${CAPABILITY_OWNER}.${feature}`);
    if (assigned !== undefined) return assigned;

    const row = db.get<ClassRow>(`SELECT * FROM classes WHERE id = ?`, [classId]);
    if (!row) return false;
    if (!feature.startsWith(LEGACY_FEATURE_PREFIX)) return false;
    return Boolean(row[feature]);
  }

  return {
    async checkAnyClassFeature(classId, features) {
      const row = db.get<{ id: number }>(`SELECT id FROM classes WHERE id = ?`, [classId]);
      if (!row) {
        return { refusal: { code: 'class-not-found', message: '班级未找到' } };
      }
      if (!features.some((feature) => isFeatureEnabled(classId, feature))) {
        return { refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } };
      }
      return { value: true };
    },

    async getStudentById(studentId) {
      const row = db.get<StudentRow>(`SELECT * FROM students WHERE id = ?`, [studentId]);
      return row ? toStudentSnapshot(row, decryptName) : null;
    },

    async getStudentByUserId(userId) {
      // Multiple students could share a user id in principle; the legacy resolver
      // (`getClassIdByUserId`) took the first match, and ordering by id keeps that
      // deterministic instead of leaving it to the query planner.
      const row = db.get<StudentRow>(`SELECT * FROM students WHERE user_id = ? ORDER BY id LIMIT 1`, [userId]);
      return row ? toStudentSnapshot(row, decryptName) : null;
    },

    async getClassById(classId) {
      const row = db.get<ClassRow>(`SELECT * FROM classes WHERE id = ?`, [classId]);
      return row ? toClassSnapshot(row) : null;
    },

    async listClassStudents(classId) {
      const rows = db.query<StudentRow>(`SELECT * FROM students WHERE class_id = ? ORDER BY id`, [classId]);
      return rows.map((row) => toStudentSnapshot(row, decryptName));
    },

    async searchClasses(query, excludeClassId, limit = -1) {
      // SQLite treats a negative LIMIT as "no limit", which is what the legacy query
      // branch did - it filtered by name and returned every match. Applying the
      // unfiltered branch's LIMIT 10 to both would silently truncate search results.
      const rows = query
        ? db.query<ClassRow>(`SELECT * FROM classes WHERE name LIKE ? AND id != ? LIMIT ?`, [
            `%${query}%`,
            excludeClassId,
            limit,
          ])
        : db.query<ClassRow>(`SELECT * FROM classes WHERE id != ? LIMIT ?`, [excludeClassId, limit === -1 ? 10 : limit]);
      return rows.map(toClassSnapshot);
    },

    async assertStudentInClass(studentId, classId) {
      const student = requireStudent(studentId);
      if (student.class_id !== classId) {
        throw new Error(`学生 ${studentId} 不属于班级 ${classId}`);
      }
    },

    async adjustPoints({ studentId, delta, reason, actorId }) {
      // Read the class before the update so the event carries it; consumers
      // (analytics, achievements) should not have to look it up themselves.
      const before = requireStudent(studentId);

      const updated = db.tx((tx) => {
        tx.run(
          `UPDATE students
              SET total_points = COALESCE(total_points, 0) + ?,
                  available_points = COALESCE(available_points, 0) + ?
            WHERE id = ?`,
          [delta, delta, studentId],
        );
        return tx.get<StudentRow>(`SELECT * FROM students WHERE id = ?`, [studentId]) as StudentRow;
      });

      ctx.events.emit('classroom.student.points.changed', {
        studentId,
        classId: before.class_id,
        delta,
        reason,
        actorId,
      });

      return {
        totalPoints: updated.total_points ?? 0,
        availablePoints: updated.available_points ?? 0,
      };
    },

    /**
     * Move the *spendable* half of the balance.
     *
     * `adjustPoints` moves `total_points` and `available_points` together, which is
     * what earning or fiat spending does; a feature plugin buying something moves only
     * the spendable half, because the points were still earned. Both live behind this
     * port so `students` keeps exactly one writer.
     */
    async transferStudentCredits({ studentId, delta, reason, actorId }) {
      const before = db.get<StudentRow>(`SELECT * FROM students WHERE id = ?`, [studentId]);
      if (!before) {
        return { refusal: { code: 'student-not-found', message: '学生未找到' } };
      }

      if (delta < 0 && (before.available_points ?? 0) + delta < 0) {
        return { refusal: { code: 'insufficient-credits', message: '积分不足' } };
      }

      const updated = db.tx((tx) => {
        tx.run(`UPDATE students SET available_points = COALESCE(available_points, 0) + ? WHERE id = ?`, [
          delta,
          studentId,
        ]);
        return tx.get<StudentRow>(`SELECT * FROM students WHERE id = ?`, [studentId]) as StudentRow;
      });

      ctx.events.emit('classroom.student.points.changed', {
        studentId,
        classId: before.class_id,
        delta,
        reason,
        actorId,
      });

      return { value: { availablePoints: updated.available_points ?? 0 } };
    },

    /**
     * Append to the shared point ledger.
     *
     * `records` is written by points, gacha, marketplace, pet, dungeon, battles,
     * challenge, collaboration, engagement and economy - so it belongs to no single
     * feature domain. It lives here because `classroom` owns student points, which is
     * what every entry is about.
     */
    async recordStudentLedgerEntry(entry: PointLedgerEntry) {
      db.run(`INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)`, [
        entry.studentId,
        entry.type,
        entry.amount,
        entry.description,
      ]);
    },

    async listStudentLedger(studentId, limit) {
      const base = `SELECT id, student_id, type, amount, description, created_at
                      FROM records WHERE student_id = ? ORDER BY created_at DESC, id DESC`;
      const rows =
        limit === undefined
          ? db.query<LedgerRow>(base, [studentId])
          : db.query<LedgerRow>(`${base} LIMIT ?`, [studentId, limit]);

      return rows.map((row) => ({
        id: row.id,
        studentId: row.student_id,
        type: row.type,
        amount: row.amount,
        description: row.description ?? null,
        createdAt: String(row.created_at),
      }));
    },

    async sumClassPointsEarnedSince(classId, since) {
      // The join is why this lives here rather than in the caller: only classroom knows
      // which students belong to a class.
      const row = db.get<{ total: number | null }>(
        `SELECT SUM(r.amount) AS total
           FROM records r
           JOIN students s ON r.student_id = s.id
          WHERE s.class_id = ? AND r.created_at >= ? AND r.type = 'ADD_POINTS'`,
        [classId, since],
      );
      return row?.total ?? 0;
    },

    async checkStudentFeature(studentId, feature) {
      const student = db.get<{ class_id: number }>(`SELECT class_id FROM students WHERE id = ?`, [studentId]);
      if (!student) {
        return { refusal: { code: 'student-not-found', message: '学生未找到' } };
      }
      if (!isFeatureEnabled(student.class_id, feature)) {
        return { refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } };
      }
      return { value: true };
    },

    async checkClassFeature(classId, feature) {
      const row = db.get<{ id: number }>(`SELECT id FROM classes WHERE id = ?`, [classId]);
      if (!row) {
        return { refusal: { code: 'class-not-found', message: '班级未找到' } };
      }
      if (!isFeatureEnabled(classId, feature)) {
        return { refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } };
      }
      return { value: true };
    },
  };
}

export default definePlugin({
  async setup(ctx) {
    // The host injects the decryptor through config (see `KernelConfig.decryptName`);
    // absent means identity, which is right for an unencrypted or test database.
    const decryptName = ctx.config.decryptName;
    ctx.provide('classroom.public', createClassroomPort(ctx, decryptName ? { decryptName } : {}));
    ctx.log.info('classroom port published', {
      service: 'classroom.public',
      decryptedNames: Boolean(decryptName),
    });
  },
});
