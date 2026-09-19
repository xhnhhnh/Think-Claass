/**
 * `classroom.public` - the published port.
 *
 * Lifted out of `index.ts` when the HTTP surface moved in (P4.3b.6b) so the port and the
 * routes can share one repository and one feature resolver instead of each holding its own
 * SQL. `plugins/pet`, `plugins/economy`, `plugins/challenge` and `tests/plugins/host.test.ts`
 * consume this object, and its behaviour is unchanged: same method names, same snapshots,
 * same refusal codes and messages, same ordering, same event payloads. What changed is only
 * where the rows come from (the shared repository) and that the capability lookup goes
 * through the shared resolver with the identical assignment-first/column-fallback order.
 *
 * Port methods express refusal as *data* (`ClassroomResult`), never as a throw: contracts
 * are type-only (G6) and a boolean-literal discriminated union does not narrow under
 * `strict:false`. The `assertStudentInClass` helper is the exception - it is an assertion
 * and its pre-migration callers catch its rejection.
 */

import type {
  ClassSnapshot,
  ClassroomPort,
  ClassroomResult,
  PointLedgerEntry,
  PointLedgerRow,
  StudentSnapshot,
} from '@thinkclass/contracts/domains/classroom';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { ClassFeatureResolver } from './classroom.features.js';
import type { ClassroomRepository } from './classroom.repository.js';
import type { NameCipher } from './classroom.support.js';
import type { StudentRow } from './classroom.types.js';

export interface ClassroomPortDeps {
  /** The port emits `classroom.student.points.changed`; the bus is the plugin's context. */
  ctx: KernelContext;
  repository: ClassroomRepository;
  features: ClassFeatureResolver;
  /** Injected decryptor; identity when the database stores plaintext. */
  cipher: NameCipher;
}

function toStudentSnapshot(row: StudentRow, cipher: NameCipher): StudentSnapshot {
  return {
    id: row.id,
    classId: row.class_id,
    userId: row.user_id ?? null,
    // Names are AES-encrypted at rest for modern rows and plaintext for very old ones
    // (api/services/studentService.ts). The host supplies the decryptor, so a plugin
    // never has to reach for `api/**` or re-implement a security-sensitive helper.
    name: cipher.decrypt(row.name),
    totalPoints: row.total_points ?? 0,
    availablePoints: row.available_points ?? 0,
    groupId: row.group_id ?? null,
  };
}

function toClassSnapshot(row: {
  id: number;
  name: string;
  teacher_id: number | null;
  invite_code: string;
}): ClassSnapshot {
  return {
    id: row.id,
    name: row.name,
    teacherId: row.teacher_id ?? null,
    inviteCode: row.invite_code,
  };
}

export function createClassroomPort({ ctx, repository, features, cipher }: ClassroomPortDeps): ClassroomPort {
  const db = repository;

  function requireStudent(studentId: number): StudentRow {
    const row = db.findStudentRow(studentId);
    if (!row) throw new Error(`学生不存在: ${studentId}`);
    return row;
  }

  /** Assignment first, then the legacy column; never throws for a missing class. */
  function classFeatureCheck(classId: number, feature: string): ClassroomResult<true> {
    const row = db.findClassRow(classId);
    if (!row) {
      return { refusal: { code: 'class-not-found', message: '班级未找到' } };
    }
    if (!features.isFeatureEnabled(classId, feature)) {
      return { refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } };
    }
    return { value: true };
  }

  function emitPointsChanged(
    studentId: number,
    classId: number,
    delta: number,
    reason: string,
    actorId: number,
  ): void {
    ctx.events.emit('classroom.student.points.changed', { studentId, classId, delta, reason, actorId });
  }

  return {
    async checkAnyClassFeature(classId, featureList) {
      const row = db.findClassRow(classId);
      if (!row) {
        return { refusal: { code: 'class-not-found', message: '班级未找到' } };
      }
      if (!featureList.some((feature) => features.isFeatureEnabled(classId, feature))) {
        return { refusal: { code: 'feature-disabled', message: '该功能当前已关闭' } };
      }
      return { value: true };
    },

    async getStudentById(studentId) {
      const row = db.findStudentRow(studentId);
      return row ? toStudentSnapshot(row, cipher) : null;
    },

    async getStudentByUserId(userId) {
      // Multiple students could share a user id in principle; the legacy resolver
      // (`getClassIdByUserId`) took the first match, and ordering by id keeps that
      // deterministic instead of leaving it to the query planner.
      const row = db.findStudentByUserId(userId);
      return row ? toStudentSnapshot(row, cipher) : null;
    },

    async getClassById(classId) {
      const row = db.findClassRow(classId);
      return row ? toClassSnapshot(row) : null;
    },

    async listClassStudents(classId) {
      return db.listClassStudents(classId).map((row) => toStudentSnapshot(row, cipher));
    },

    async searchClasses(query, excludeClassId, limit = -1) {
      return db.searchClasses(query, excludeClassId, limit).map(toClassSnapshot);
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

      const updated = db.tx(() => {
        db.addStudentPointsPair(studentId, delta);
        return db.findStudentRow(studentId) as StudentRow;
      });

      emitPointsChanged(studentId, before.class_id, delta, reason, actorId);

      return {
        totalPoints: updated.total_points ?? 0,
        availablePoints: updated.available_points ?? 0,
      };
    },

    /**
     * Move the *spendable* half of the balance.
     *
     * `adjustPoints` moves `total_points` and `available_points` together, which is what
     * earning or fiat spending does; a feature plugin buying something moves only the
     * spendable half, because the points were still earned. Both live behind this port so
     * `students` keeps exactly one writer.
     */
    async transferStudentCredits({ studentId, delta, reason, actorId }) {
      const before = db.findStudentRow(studentId);
      if (!before) {
        return { refusal: { code: 'student-not-found', message: '学生未找到' } };
      }

      if (delta < 0 && (before.available_points ?? 0) + delta < 0) {
        return { refusal: { code: 'insufficient-credits', message: '积分不足' } };
      }

      const updated = db.tx(() => {
        db.addStudentAvailable(studentId, delta);
        return db.findStudentRow(studentId) as StudentRow;
      });

      emitPointsChanged(studentId, before.class_id, delta, reason, actorId);

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
      db.insertRecord(entry.studentId, entry.type, entry.amount, entry.description);
    },

    async listStudentLedger(studentId, limit) {
      const rows = limit === undefined ? db.listStudentLedger(studentId) : db.listStudentLedger(studentId, limit);

      return rows.map(
        (row): PointLedgerRow => ({
          id: row.id,
          studentId: row.student_id,
          type: row.type,
          amount: row.amount,
          description: row.description ?? null,
          createdAt: String(row.created_at),
        }),
      );
    },

    async sumClassPointsEarnedSince(classId, since) {
      // The join is why this lives here rather than in the caller: only classroom knows
      // which students belong to a class.
      return db.sumClassPointsEarnedSince(classId, since);
    },

    async checkStudentFeature(studentId, feature) {
      const student = db.findStudentRow(studentId);
      if (!student) {
        return { refusal: { code: 'student-not-found', message: '学生未找到' } };
      }
      return classFeatureCheck(student.class_id, feature);
    },

    async checkClassFeature(classId, feature) {
      return classFeatureCheck(classId, feature);
    },
  };
}
