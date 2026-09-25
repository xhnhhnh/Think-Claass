/**
 * SLG service.
 *
 * Two storage boundaries meet here, and the difference is the whole point of the
 * migration:
 *
 *   territories / class_resources   owned by this plugin -> `ctx.db`
 *   students.available_points, records   owned by classroom -> `classroom.public`
 *
 * The pre-migration service wrote `students.available_points` and inserted into
 * `records` directly. Both now go through the port, because a second writer would make
 * classroom's ownership of those tables meaningless.
 *
 * ## Atomicity, stated honestly
 *
 * `contribute` originally mutated `students`, `records` and `territories` inside one
 * synchronous better-sqlite3 transaction. The credit move is now an `await` against
 * another plugin, and a synchronous transaction cannot span an `await`, so the
 * operation is a short sequence of individually-atomic steps.
 *
 * The ordering is chosen so the failure that can actually happen is the recoverable one:
 *
 *   1. every read-only rejection (404 / 403 / 400) happens first, so a plainly invalid
 *      request writes nothing at all;
 *   2. the plugin-owned territory row is written *before* the await, so the
 *      read-modify-write on `territories` stays synchronous and cannot interleave;
 *   3. the port debit runs second and is compensated by restoring the territory row when
 *      it refuses (a race, since step 1 already checked the balance);
 *   4. the ledger entry is appended last and is not fatal - the points have moved, and a
 *      missing history row is a smaller problem than reporting failure after the
 *      operation succeeded.
 *
 * The remaining exposure is a process death between steps 2 and 3, which the ledger
 * makes visible. Restoring true cross-plugin atomicity needs a kernel-level unit of
 * work, which is P6/P7 work.
 */

import type { ClassroomPort, ClassroomRefusal } from '@thinkclass/contracts/domains/classroom';
import { ApiError } from '@thinkclass/kernel';

import type { RequestActor } from './slg.authorization.js';
import type { CreateTerritoryPayload, SlgRepository, TerritoryContributionPayload, TerritoryYield } from './slg.types.js';

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

/** The roles that reach every class: the admin console. */
function isStaffAdmin(actor: RequestActor): boolean {
  return actor.role === 'admin' || actor.role === 'superadmin';
}

/**
 * Map a refusal from the classroom port onto this domain's HTTP status.
 *
 * The port cannot throw the kernel's `ApiError` (contracts are type-only, guardrail
 * G6), so it returns a code and each caller decides. The statuses and messages are the
 * ones the pre-migration service produced:
 *
 *   - the student gate resolved the class from the student row, so a missing student was
 *     404 学生未找到 (not economy's "Student not found", which comes from a different
 *     first check);
 *   - `insufficient-credits` maps to the English 400 this endpoint has always answered.
 */
function toApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal.code) {
    case 'feature-disabled':
      return new ApiError(403, '该功能当前已关闭');
    case 'class-not-found':
      return new ApiError(404, '班级未找到');
    case 'student-not-found':
      return new ApiError(404, '学生未找到');
    case 'insufficient-credits':
      return new ApiError(400, 'Insufficient points');
    default:
      return new ApiError(400, refusal.message);
  }
}

export class SlgService {
  constructor(
    private readonly repository: SlgRepository,
    private readonly classroom: ClassroomPort,
  ) {}

  /**
   * The actor-scope half of authorization: 403 unless `actor` may read this class's map.
   *
   * The map is class data, so it is the class's teacher, a student *in* that class, or staff
   * admin. The class is resolved through `classroom.public`, never from the request: the
   * pre-migration routes answered any `:classId` to anybody.
   */
  async assertClassAccess(actor: RequestActor, classIdInput: unknown): Promise<void> {
    const classId = positiveInteger(classIdInput, 'Class id');
    if (isStaffAdmin(actor)) return;

    if (actor.role === 'teacher') {
      const klass = await this.classroom.getClassById(classId);
      if (!klass) throw new ApiError(404, '班级未找到');
      if (klass.teacherId !== actor.id) throw new ApiError(403, '无权限访问该班级');
      return;
    }

    if (actor.role === 'student') {
      if ((await this.ownClassId(actor)) !== classId) throw new ApiError(403, '无权限访问该班级');
      return;
    }

    throw new ApiError(403, '无权限访问该班级');
  }

  /**
   * 403 unless `actor` teaches this class (staff admin passes).
   *
   * Territory creation and resource yield move a whole class's resources, so the class's own
   * teacher is the narrowest caller - the legacy routes let anybody name any `:classId`.
   */
  async assertTeacherClass(actor: RequestActor, classIdInput: unknown): Promise<void> {
    const classId = positiveInteger(classIdInput, 'Class id');
    if (isStaffAdmin(actor)) return;

    if (actor.role !== 'teacher') throw new ApiError(403, '无权限管理该班级');

    const klass = await this.classroom.getClassById(classId);
    if (!klass) throw new ApiError(404, '班级未找到');
    if (klass.teacherId !== actor.id) throw new ApiError(403, '无权限管理该班级');
  }

  /**
   * 403 unless `actor` is the student this row belongs to.
   *
   * The claim is resolved from the actor - its `studentId` when the host's scope resolver filled
   * it in, otherwise the student bound to the login's `userId` through `classroom.public` - so a
   * student cannot contribute, or spend points, on another student's behalf.
   */
  async assertSelfStudent(actor: RequestActor, studentIdInput: unknown): Promise<void> {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    if (actor.role !== 'student' || (await this.ownStudentId(actor)) !== studentId) {
      throw new ApiError(403, '无权限使用该学生账号');
    }
  }

  /** The student row this login owns, or `null` when the account is unbound. */
  private async ownStudentId(actor: RequestActor): Promise<number | null> {
    if (actor.studentId) return actor.studentId;
    if (actor.id === null) return null;
    const student = await this.classroom.getStudentByUserId(actor.id);
    return student?.id ?? null;
  }

  /** The class the actor's own student row is in, or `null` when it cannot be resolved. */
  private async ownClassId(actor: RequestActor): Promise<number | null> {
    if (actor.classId) return actor.classId;
    if (actor.id === null) return null;
    const student = await this.classroom.getStudentByUserId(actor.id);
    return student?.classId ?? null;
  }

  async getMap(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    await this.requireSlgClass(classId);
    return {
      territories: this.repository.listTerritories(classId),
      resources: this.repository.getOrCreateResources(classId),
    };
  }

  async contribute(studentIdInput: unknown, territoryIdInput: unknown, input: TerritoryContributionPayload) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const territoryId = positiveInteger(territoryIdInput, 'Territory id');
    const amount = positiveInteger(input.amount, 'Amount');

    // `assertStudentFeatureEnabled(studentId, 'enable_slg')` in the pre-migration
    // service: the student lookup and the feature gate were one step, and it ran before
    // any other check.
    await this.requireSlgStudent(studentId);

    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, 'Student not found');
    if (student.availablePoints < amount) throw new ApiError(400, 'Insufficient points');

    // Both checks below run before anything is written, preserving the pre-migration
    // order: an over-contribution against a missing territory is a 400, not a 404.
    const territory = this.repository.getTerritory(territoryId);
    if (!territory) throw new ApiError(404, 'Territory not found');
    if (territory.status === 'owned') throw new ApiError(400, 'Territory already owned');

    const nextContribution = territory.current_contribution + amount;
    const status = nextContribution >= territory.cost_to_unlock ? 'owned' : 'unlocking';

    this.repository.updateTerritoryContribution(territoryId, nextContribution, status);

    const moved = await this.classroom.transferStudentCredits({
      studentId,
      delta: -amount,
      reason: 'slg.contribute',
      actorId: 0,
      ledger: { type: 'SLG_CONTRIBUTE', description: `Contributed to territory: ${territory.name}` },
    });
    if (moved.refusal) {
      // The territory row is already committed; put it back so the map and the balance
      // never disagree. This path is a race - the balance was checked above - but a
      // half-applied contribution would be permanent.
      this.repository.updateTerritoryContribution(territoryId, territory.current_contribution, territory.status);
      throw toApiError(moved.refusal);
    }

    return { contributed: true };
  }

  async createTerritory(input: CreateTerritoryPayload) {
    const classId = positiveInteger(input.class_id, 'Class id');
    if (!input.name || !input.type) throw new ApiError(400, 'Missing fields');
    await this.requireSlgClass(classId);

    const territory = {
      class_id: classId,
      name: input.name,
      type: input.type,
      cost_to_unlock: Number(input.cost_to_unlock || 1000),
      x_pos: Number(input.x_pos || 0),
      y_pos: Number(input.y_pos || 0),
    };
    return { territoryId: this.repository.createTerritory(territory) };
  }

  async yieldResources(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    await this.requireSlgClass(classId);

    const resourceYield: TerritoryYield = { wood: 0, stone: 0, magic_dust: 0, gold: 0 };
    for (const territory of this.repository.listOwnedTerritoryYields(classId)) {
      if (territory.type === 'forest') resourceYield.wood += territory.level * 10;
      if (territory.type === 'mine') resourceYield.stone += territory.level * 10;
      if (territory.type === 'magic_spring') resourceYield.magic_dust += territory.level * 5;
      if (territory.type === 'city') resourceYield.gold += territory.level * 20;
    }

    // Always runs, even for an all-zero yield: the pre-migration transaction created the
    // `class_resources` row on a yield call regardless of the totals.
    this.repository.applyYield(classId, resourceYield);
    return { yield: resourceYield };
  }

  /**
   * Reject when a *class* has slg off.
   *
   * Three call sites hold a class id and no student id, so the port exposes the
   * class-scoped form rather than this plugin re-deriving the flag semantics.
   */
  private async requireSlgClass(classId: number): Promise<void> {
    const gate = await this.classroom.checkClassFeature(classId, 'enable_slg');
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /** Reject when the class that owns `studentId` has slg off (404 for an unknown student). */
  private async requireSlgStudent(studentId: number): Promise<void> {
    const gate = await this.classroom.checkStudentFeature(studentId, 'enable_slg');
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /**
   * Append to the shared point ledger.
   *
   * Not fatal: the balance has already moved, and a missing history row is a smaller
   * problem than a contribution reporting failure after it succeeded. It is logged by
   * the boundary, so a failure is visible rather than silent.
   */
  private async ledger(studentId: number, type: string, amount: number, description: string): Promise<void> {
    await this.classroom.recordStudentLedgerEntry({ studentId, type, amount, description });
  }
}
