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

import type { ClassSnapshot, ClassroomPort, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
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
}

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
  };
}

export default definePlugin({
  async setup(ctx) {
    ctx.provide('classroom.public', createClassroomPort(ctx));
    ctx.log.info('classroom port published', { service: 'classroom.public' });
  },
});
