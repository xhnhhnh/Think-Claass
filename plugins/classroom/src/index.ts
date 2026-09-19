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

/** Prefix identifying a legacy class-scope feature column. */
const LEGACY_FEATURE_PREFIX = 'enable_';

/** Plugin that owns class-scope capabilities; must match the manifest id. */
const CAPABILITY_OWNER = 'classroom';

function toStudentSnapshot(row: StudentRow): StudentSnapshot {
  return {
    id: row.id,
    classId: row.class_id,
    userId: row.user_id ?? null,
    name: row.name,
    totalPoints: row.total_points ?? 0,
    availablePoints: row.available_points ?? 0,
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

export function createClassroomPort(ctx: KernelContext): ClassroomPort {
  const db = ctx.db;

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
    async getStudentById(studentId) {
      const row = db.get<StudentRow>(`SELECT * FROM students WHERE id = ?`, [studentId]);
      return row ? toStudentSnapshot(row) : null;
    },

    async getClassById(classId) {
      const row = db.get<ClassRow>(`SELECT * FROM classes WHERE id = ?`, [classId]);
      return row ? toClassSnapshot(row) : null;
    },

    async listClassStudents(classId) {
      const rows = db.query<StudentRow>(`SELECT * FROM students WHERE class_id = ? ORDER BY id`, [classId]);
      return rows.map(toStudentSnapshot);
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
    ctx.provide('classroom.public', createClassroomPort(ctx));
    ctx.log.info('classroom port published', { service: 'classroom.public' });
  },
});
