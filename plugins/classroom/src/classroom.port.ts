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
 *
 * Scope and authorization: this port is an in-process API between plugins, not an HTTP
 * surface, so it carries **no** actor checks and no per-caller filtering - a method answers
 * for the id it is given (`listClassStudents`, `listStudentsByParent`) or for one student
 * (`getStudentById`, `getStudentByUserId`). Deciding *who* may ask is the consuming route's
 * job, and each consumer already does it: the classroom HTTP surface scopes its three student
 * reads in `ClassroomService` before ever reaching the repository, and the admin console's
 * deletion cascade (`listClassIdsByTeacher` / `listStudentAccountsByClassIds`) is gated by
 * `requireAdmin` on `DELETE /api/admin/users/:id`. A port method must therefore never be
 * widened into an unauthenticated HTTP answer; when a route needs a scoped read it resolves
 * the scope first, which is the rule the classroom service follows.
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
import { ApiError } from '@thinkclass/kernel';

import type { ClassFeatureResolver } from './classroom.features.js';
import type { ClassroomRepository } from './classroom.repository.js';
import type { ReportQueries } from './classroom.reports.js';
import type { NameCipher } from './classroom.support.js';
import type { StudentRow } from './classroom.types.js';

export interface ClassroomPortDeps {
  /** The port emits `classroom.student.points.changed`; the bus is the plugin's context. */
  ctx: KernelContext;
  repository: ClassroomRepository;
  features: ClassFeatureResolver;
  /** Injected decryptor; identity when the database stores plaintext. */
  cipher: NameCipher;
  /**
   * The report aggregates for the insights domain (P4.3b.12).
   *
   * Kept in its own module rather than inlined here: the port's job is the small, stable student/class
   * interface every domain uses, while the reports are one consumer's aggregates over eight tables.
   * Mixing them would make this file the place both grow.
   */
  reports: ReportQueries;
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

export function createClassroomPort({ ctx, repository, features, cipher, reports }: ClassroomPortDeps): ClassroomPort {
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

    async findClassByInviteCode(code) {
      const row = db.classByInviteCode(code);
      if (!row) return null;
      // `classByInviteCode` projects only `(id, name)` - what the invite lookup needs - so the
      // remaining snapshot fields come from the full row rather than being invented here.
      const full = db.findClassRow(row.id);
      return full ? toClassSnapshot(full) : null;
    },

    /**
     * The whole flag map, in the legacy key space.
     *
     * Wraps the resolver's `getClassFeaturesByClassId`, which throws the legacy 404 for a
     * missing class: the port answers `null` instead, because its only caller (the login
     * response) treated a missing class as "no features" rather than an error.
     */
    async getClassFeatureSnapshot(classId) {
      if (!db.findClassRow(classId)) return null;
      return features.getClassFeaturesByClassId(classId);
    },

    async getClassIdByStudentId(studentId) {
      const row = db.findStudentRow(studentId);
      if (!row) return null;
      return row.class_id;
    },

    // -- report reads (P4.3b.12) ---------------------------------------------
    //
    // Delegated to `classroom.reports.ts`. The port gains three methods and no new dependencies: the
    // aggregate SQL stays in this plugin, which is the only one that may run the joins.

    async getClassReportInputs(classId) {
      return reports.classReportInputs(classId, cipher);
    },

    async getStudentReportInputs(studentId) {
      return reports.studentReportInputs(studentId, cipher);
    },

    async getStudentAccessView(studentId) {
      return reports.studentAccessView(studentId);
    },

    async countLeaveRequestsForStudents(studentIds) {
      return reports.countLeaveRequests(studentIds);
    },

    async listRecentLeaves(studentId, limit) {
      return reports.recentLeaves(studentId, limit);
    },

    async listStudentsByParent(parentId) {
      return db.listStudentsByParent(parentId).map((row) => toStudentSnapshot(row, cipher));
    },

    /**
     * Names for a set of ids, decrypted.
     *
     * The decryption is the reason this method exists at all: a caller that asked for the raw rows
     * would either render ciphertext or need the key.
     */
    async listStudentNamesByIds(studentIds) {
      const names: Record<number, string> = {};
      for (const row of db.listStudentNamesByIds(studentIds)) {
        names[row.id] = cipher.decrypt(row.name);
      }
      return names;
    },

    /**
     * Debit the spendable balance and append the ledger entry in **one** transaction.
     *
     * Two writes that the pre-migration callers wrapped together (lucky draw, pet action); keeping
     * them apart would let a crash leave a debit with no ledger row. The refusal codes are the
     * existing ones, so a caller's `if (result.refusal)` keeps working.
     */
    async spendStudentCredits({ studentId, delta, entry }) {
      const before = db.findStudentRow(studentId);
      if (!before) {
        return { refusal: { code: 'student-not-found', message: '学生未找到' } };
      }
      if (delta < 0 && (before.available_points ?? 0) + delta < 0) {
        return { refusal: { code: 'insufficient-credits', message: '积分不足' } };
      }

      const updated = db.tx(() => {
        db.addStudentAvailable(studentId, delta);
        const row = db.findStudentRow(studentId) as StudentRow;
        const recordId = db.insertRecord(entry.studentId, entry.type, entry.amount, entry.description);
        db.insertPointEvent({ studentId, recordId, source: entry.type.toLowerCase(), category: 'balance', growth: 0, credits: delta, total: row.total_points ?? 0, available: row.available_points ?? 0 });
        return row;
      });

      return { value: { availablePoints: updated.available_points ?? 0 } };
    },

    async linkParentToStudent(parentId, studentId) {
      db.linkParentToStudent(parentId, studentId);
    },

    /**
     * Bind a login account to a student row.
     *
     * The name is encrypted here rather than by the caller: `students.name` is AES-encrypted at
     * rest, and this is the only write path the identity domain has to it. A caller passing
     * plaintext would drop at-rest encryption for a name the product displays, silently.
     */
    async bindStudentToUser({ studentId, userId, name }) {
      const row = db.findStudentRow(studentId);
      if (!row) {
        return { refusal: { code: 'student-not-found', message: '未找到该学生记录' } };
      }
      if (row.user_id != null && row.user_id !== userId) {
        return { refusal: { code: 'already-bound', message: '该学生已被绑定' } };
      }

      const encrypted = name == null ? null : cipher.encrypt(String(name));
      const updated = db.tx(() => {
        db.bindStudentAccount(studentId, userId, encrypted);
        return db.findStudentRow(studentId) as StudentRow;
      });

      return { value: toStudentSnapshot(updated, cipher) };
    },

    async listClassStudents(classId) {
      return db.listClassStudents(classId).map((row) => toStudentSnapshot(row, cipher));
    },

    // -- account-deletion scope (P4.3b.14) -----------------------------------
    //
    // Both reads exist for `DELETE /api/admin/users/:id`: the console deletes a teacher, so it has
    // to learn which classes that teacher owns and which student rows (and login rows) live in
    // them, then hand each set to the domain that owns the table. Ids only - a row-shaped answer
    // would be a second projection of `classes`/`students` for one caller's convenience.

    async listClassIdsByTeacher(teacherId) {
      return db.listClassIdsByTeacher(teacherId);
    },

    /**
     * The `(student row, login row)` pairs in these classes.
     *
     * An empty `classIds` answers `[]` without a query - it asks for nothing, and must never mean
     * "every student". A student with no login row appears with `userId: null`, because their
     * roster row still has to be deleted.
     */
    async listStudentAccountsByClassIds(classIds) {
      if (classIds.length === 0) return [];
      return db.listStudentAccountsByClassIds(classIds).map((row) => ({
        studentId: row.id,
        userId: row.user_id ?? null,
      }));
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
      if (!Number.isInteger(delta) || delta <= 0) throw new Error('奖励积分必须是正整数');
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

    async awardStudentPoints({ studentId, amount, type, description, actorId, requestId }) {
      if (!Number.isInteger(amount) || amount <= 0) throw new Error('奖励积分必须是正整数');
      const before = db.findStudentRow(studentId);
      if (!before) throw new ApiError(404, '学生未找到');
      const source = type.toLowerCase();
      const category = /TASK_TREE|TEAM_QUEST/.test(type) ? 'collaboration'
        : /CHALLENGE|BOSS|DUNGEON/.test(type) ? 'competition' : 'participation';
      let replayed = false;
      const result = db.tx(() => {
        if (requestId) {
          const existing = db.findPointEvent(studentId, requestId);
          if (existing) {
            if (existing.source !== source || Number(existing.requested_delta) !== amount) throw new Error('请求标识已用于其他奖励');
            replayed = true;
            return { totalPoints: Number(existing.growth_balance), availablePoints: Number(existing.credits_balance) };
          }
        }
        db.addStudentPointsPair(studentId, amount);
        const row = db.findStudentRow(studentId) as StudentRow;
        const recordId = db.insertRecord(studentId, type, amount, description);
        db.insertPointEvent({ studentId, recordId, requestId, source, category, growth: amount, credits: amount, participation: category === 'participation' ? 1 : 0, requested: amount, total: row.total_points ?? 0, available: row.available_points ?? 0 });
        return { totalPoints: row.total_points ?? 0, availablePoints: row.available_points ?? 0 };
      });
      if (!replayed) emitPointsChanged(studentId, before.class_id, amount, description, actorId);
      return result;
    },

    /**
     * Move the *spendable* half of the balance.
     *
     * `adjustPoints` moves `total_points` and `available_points` together, which is what
     * earning or fiat spending does; a feature plugin buying something moves only the
     * spendable half, because the points were still earned. Both live behind this port so
     * `students` keeps exactly one writer.
     */
    async transferStudentCredits({ studentId, delta, reason, actorId, ledger }) {
      const before = db.findStudentRow(studentId);
      if (!before) {
        return { refusal: { code: 'student-not-found', message: '学生未找到' } };
      }

      if (delta < 0 && (before.available_points ?? 0) + delta < 0) {
        return { refusal: { code: 'insufficient-credits', message: '积分不足' } };
      }

      const updated = db.tx(() => {
        db.addStudentAvailable(studentId, delta);
        const row = db.findStudentRow(studentId) as StudentRow;
        const type = ledger?.type ?? reason.toUpperCase().replace(/\./g, '_');
        const recordId = db.insertRecord(studentId, type, delta, ledger?.description ?? reason);
        db.insertPointEvent({ studentId, recordId, source: reason, category: 'balance', growth: 0, credits: delta, total: row.total_points ?? 0, available: row.available_points ?? 0 });
        return row;
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
      db.tx(() => {
        const student = db.findStudentRow(entry.studentId);
        if (!student) throw new Error('学生未找到');
        const recordId = db.insertRecord(entry.studentId, entry.type, entry.amount, entry.description);
        const type = entry.type.toUpperCase();
        const reward = entry.amount > 0 && /REWARD|WIN|CONSOLATION/.test(type);
        const category = reward
          ? /TASK_TREE|TEAM_QUEST/.test(type) ? 'collaboration'
            : /CHALLENGE|BOSS|DUNGEON/.test(type) ? 'competition' : 'participation'
          : type === 'BOSS_ATTACK' ? 'participation' : 'balance';
        db.insertPointEvent({
          studentId: entry.studentId,
          recordId,
          source: type.toLowerCase(),
          category,
          growth: reward ? entry.amount : 0,
          credits: entry.amount,
          participation: type === 'BOSS_ATTACK' ? 1 : reward && category === 'participation' ? 1 : 0,
          total: student.total_points ?? 0,
          available: student.available_points ?? 0,
        });
      });
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
