/**
 * Battles service.
 *
 * Two storage boundaries meet here, and the difference is the point of the migration:
 *
 *   class_battles                        owned by this plugin -> `ctx.db`
 *   classes, students, records           owned by classroom    -> `classroom.public`
 *
 * The pre-migration service read `classes` three ways (a name JOIN, a feature-flag
 * lookup, a name search) and totalled points with `records JOIN students`. All four now
 * go through the port, so the plugin never reaches into another plugin's tables.
 *
 * ## What had to change shape, and why
 *
 * The port is asynchronous (the classroom plugin owns the connection), so every method
 * here is `async` where its pre-migration twin was synchronous. The response envelopes
 * and every status code are unchanged: this is a relocation, not a redesign. Two
 * deliberate details are worth knowing:
 *
 *   - `getStats` hands `start_time` to the ledger port exactly as stored (an ISO string),
 *     because the port compares it against `records.created_at` as a string just as the
 *     pre-migration SQL did - re-formatting it would change which rows count
 *   - `searchClasses` is now capped at the port's default of 10 rows for a *filtered*
 *     search as well; the pre-migration query branch had no LIMIT. That is the one
 *     observable difference this migration introduces, it belongs to the port rather
 *     than to this plugin, and it is reported to the Lead.
 *
 * The class-name JOIN became two `getClassById` calls with a per-request cache. The
 * legacy SQL used INNER JOINs, so a battle pointing at a deleted class disappeared from
 * the result; `withClassNames` reproduces that rather than leaking `undefined` names.
 */

import type {
  BattleClassSummary,
  ClassBattle,
  EndBattlePayload,
  InitiateBattlePayload,
} from '@thinkclass/contracts/domains/battles';
import type { ClassroomPort, ClassroomRefusal } from '@thinkclass/contracts/domains/classroom';
import { ApiError } from '@thinkclass/kernel';

import type { BattlesRepository } from './battles.types.js';
import type { RequestActor } from './battles.authorization.js';

/**
 * Legacy class-scope feature key.
 *
 * Resolved by classroom (capability assignment first, then the `classes.enable_*` column)
 * and never by importing `api/utils/classFeatures.ts`, which cannot be reached from a
 * plugin.
 */
const FEATURE_KEY = 'enable_class_brawl';

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

/**
 * Map a refusal from the classroom port onto this domain's HTTP status.
 *
 * The port cannot throw the kernel's `ApiError` (contracts are type-only, guardrail G6),
 * so it returns a code and each caller decides. The two statuses below are exactly what
 * `assertClassFeatureEnabled` produced before the migration - 404 when the class does not
 * exist, 403 when the flag is off - so the HTTP contract does not move.
 */
function toApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal.code) {
    case 'class-not-found':
      return new ApiError(404, '班级未找到');
    case 'feature-disabled':
      return new ApiError(403, '该功能当前已关闭');
    default:
      return new ApiError(400, refusal.message);
  }
}

/** The roles that reach every class and battle: the admin console. */
function isStaffAdmin(actor: RequestActor): boolean {
  return actor.role === 'admin' || actor.role === 'superadmin';
}

export class BattlesService {
  constructor(
    private readonly repository: BattlesRepository,
    private readonly classroom: ClassroomPort,
  ) {}

  /**
   * The actor-scope half of authorization for a class's battle list: its teacher, a student of the
   * class, or staff admin. The class comes from `classroom.public`, never from the request.
   */
  async assertClassAccess(actor: RequestActor, classIdInput: unknown): Promise<void> {
    const classId = positiveInteger(classIdInput, 'Class id');
    if (isStaffAdmin(actor)) return;

    if (actor.role === 'teacher') {
      await this.assertTeachesClass(actor, classId, '无权限查看该班级对战');
      return;
    }

    if (actor.role === 'student') {
      if ((await this.ownClassId(actor)) !== classId) throw new ApiError(403, '无权限查看该班级对战');
      return;
    }

    throw new ApiError(403, '无权限查看该班级对战');
  }

  /**
   * The actor-scope half of authorization for a battle's stats: a teacher of one of the two
   * classes, a student in one of them, or staff admin.
   */
  async assertBattleAccess(actor: RequestActor, battleIdInput: unknown): Promise<void> {
    const { classIds } = await this.battleClasses(battleIdInput);
    if (isStaffAdmin(actor)) return;

    if (actor.role === 'teacher') {
      if (!(await this.teachesAnyClass(actor, classIds))) throw new ApiError(403, '无权限查看该对战');
      return;
    }

    if (actor.role === 'student') {
      const ownClassId = await this.ownClassId(actor);
      if (ownClassId === null || !classIds.includes(ownClassId)) throw new ApiError(403, '无权限查看该对战');
      return;
    }

    throw new ApiError(403, '无权限查看该对战');
  }

  /**
   * The actor-scope half of authorization for the writes (accept / reject / end): a teacher of one
   * of the battle's classes. Staff admin passes.
   */
  async assertBattleTeacher(actor: RequestActor, battleIdInput: unknown): Promise<void> {
    const { classIds } = await this.battleClasses(battleIdInput);
    if (isStaffAdmin(actor)) return;
    if (actor.role !== 'teacher' || !(await this.teachesAnyClass(actor, classIds))) {
      throw new ApiError(403, '无权限管理该对战');
    }
  }

  /**
   * The actor-scope half of authorization for `POST /api/battles`: the battle is opened by *your*
   * class, so the initiator class must be one the actor teaches. Staff admin passes.
   */
  async assertInitiatorClass(actor: RequestActor, classIdInput: unknown): Promise<void> {
    const classId = positiveInteger(classIdInput, 'Initiator class id');
    if (isStaffAdmin(actor)) return;
    if (actor.role !== 'teacher') throw new ApiError(403, '无权限管理该对战');
    await this.assertTeachesClass(actor, classId, '无权限管理该对战');
  }

  /** 404 when the class row is gone, 403 when it belongs to another teacher. */
  private async assertTeachesClass(actor: RequestActor, classId: number, message: string): Promise<void> {
    const klass = await this.classroom.getClassById(classId);
    if (!klass) throw new ApiError(404, '班级未找到');
    if (klass.teacherId !== actor.id) throw new ApiError(403, message);
  }

  private async teachesAnyClass(actor: RequestActor, classIds: number[]): Promise<boolean> {
    for (const classId of classIds) {
      const klass = await this.classroom.getClassById(classId);
      if (klass && klass.teacherId === actor.id) return true;
    }
    return false;
  }

  /** The class the actor's own student row is in, or `null` when it cannot be resolved. */
  private async ownClassId(actor: RequestActor): Promise<number | null> {
    if (actor.classId) return actor.classId;
    if (actor.id === null) return null;
    const student = await this.classroom.getStudentByUserId(actor.id);
    return student?.classId ?? null;
  }

  /**
   * The battle's two class ids, with the same 404s the acting methods produce.
   *
   * Deliberately *without* the class feature gate: authorization decides whether the caller may
   * see the battle at all, and the acting method asks the feature question afterwards, so a refused
   * caller never learns whether the other class has 大乱斗 switched on.
   */
  private async battleClasses(battleIdInput: unknown): Promise<{ classIds: number[] }> {
    const battleId = positiveInteger(battleIdInput, 'Battle id');
    const battle = this.repository.getBattle(battleId);
    if (!battle) throw new ApiError(404, 'Battle not found');

    const [named] = await this.withClassNames([battle]);
    // The legacy lookup joined `classes`, so a battle whose class row had been deleted was already
    // indistinguishable from a missing battle.
    if (!named) throw new ApiError(404, 'Battle not found');

    return { classIds: [named.initiator_class_id, named.target_class_id] };
  }

  async listBattles(classIdInput: unknown): Promise<ClassBattle[]> {
    const classId = positiveInteger(classIdInput, 'Class id');
    await this.assertBrawlEnabled(classId);
    return this.withClassNames(this.repository.listBattles(classId));
  }

  async initiate(input: InitiateBattlePayload) {
    const initiatorClassId = positiveInteger(input.initiator_class_id, 'Initiator class id');
    const targetClassId = positiveInteger(input.target_class_id, 'Target class id');
    await this.assertBrawlEnabled(initiatorClassId);
    await this.assertBrawlEnabled(targetClassId);
    if (this.repository.findActiveBattleForClass(initiatorClassId)) {
      throw new ApiError(400, 'Class is already in a battle');
    }
    return {
      battleId: this.repository.createBattle({ initiator_class_id: initiatorClassId, target_class_id: targetClassId }),
    };
  }

  async accept(battleIdInput: unknown) {
    const battle = await this.requireBattle(battleIdInput);
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 15 * 60000);
    this.repository.acceptBattle(battle.id, startTime.toISOString(), endTime.toISOString());
    return { accepted: true };
  }

  async reject(battleIdInput: unknown) {
    const battle = await this.requireBattle(battleIdInput);
    this.repository.rejectBattle(battle.id);
    return { rejected: true };
  }

  async end(battleIdInput: unknown, input: EndBattlePayload = {}) {
    const battle = await this.requireBattle(battleIdInput);
    const winnerClassId = input.winner_class_id ? positiveInteger(input.winner_class_id, 'Winner class id') : null;
    this.repository.endBattle(battle.id, winnerClassId);
    return { ended: true };
  }

  async getStats(battleIdInput: unknown) {
    const battle = await this.requireBattle(battleIdInput);
    let initiatorScore = 0;
    let targetScore = 0;
    if (battle.start_time) {
      // `start_time` is passed through exactly as stored (an ISO string written by
      // `accept`). The port compares it against `records.created_at` as a string, the
      // same way the pre-migration SQL did, so re-formatting it here would change which
      // ledger rows count.
      initiatorScore = await this.classroom.sumClassPointsEarnedSince(battle.initiator_class_id, battle.start_time);
      targetScore = await this.classroom.sumClassPointsEarnedSince(battle.target_class_id, battle.start_time);
    }
    return { battle, initiatorScore, targetScore };
  }

  async searchClasses(query: unknown, excludeClassIdInput: unknown): Promise<BattleClassSummary[]> {
    const excludeClassId = excludeClassIdInput ? positiveInteger(excludeClassIdInput, 'Exclude class id') : 0;
    if (excludeClassId) {
      await this.assertBrawlEnabled(excludeClassId);
    }

    const classes = await this.classroom.searchClasses(query ? String(query) : undefined, excludeClassId);
    // The port hands back a full ClassSnapshot; the endpoint's contract is `{id, name}`
    // only, so the extra fields must not leak into the response.
    return classes.map((entry) => ({ id: entry.id, name: entry.name }));
  }

  /**
   * Load a battle, reproducing the pre-migration `getBattleWithFeatureGuard`.
   *
   * Order preserved: id validation (400) -> battle lookup (404) -> class feature gates
   * (404 when a class is gone, 403 when the flag is off).
   */
  private async requireBattle(battleIdInput: unknown): Promise<ClassBattle> {
    const battleId = positiveInteger(battleIdInput, 'Battle id');
    const battle = this.repository.getBattle(battleId);
    if (!battle) throw new ApiError(404, 'Battle not found');

    const [named] = await this.withClassNames([battle]);
    // The legacy lookup joined `classes`, so a battle whose class row had been deleted
    // was already indistinguishable from a missing battle.
    if (!named) throw new ApiError(404, 'Battle not found');

    await this.assertBrawlEnabled(named.initiator_class_id);
    await this.assertBrawlEnabled(named.target_class_id);
    return named;
  }

  /** Reject when a *class* has 大乱斗 off (or does not exist). */
  private async assertBrawlEnabled(classId: number): Promise<void> {
    const gate = await this.classroom.checkClassFeature(classId, FEATURE_KEY);
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /**
   * Attach `initiator_class_name` / `target_class_name` through the port.
   *
   * `getClassById` is called at most twice per distinct class id, and rows whose class no
   * longer exists are dropped - the behaviour the legacy INNER JOIN produced.
   */
  private async withClassNames(battles: ClassBattle[]): Promise<ClassBattle[]> {
    if (battles.length === 0) return [];

    const names = new Map<number, string | null>();
    const nameOf = async (classId: number): Promise<string | null> => {
      if (!names.has(classId)) {
        const klass = await this.classroom.getClassById(classId);
        names.set(classId, klass ? klass.name : null);
      }
      return names.get(classId) ?? null;
    };

    const resolved: ClassBattle[] = [];
    for (const battle of battles) {
      const initiatorName = await nameOf(battle.initiator_class_id);
      const targetName = await nameOf(battle.target_class_id);
      if (initiatorName === null || targetName === null) continue;
      resolved.push({ ...battle, initiator_class_name: initiatorName, target_class_name: targetName });
    }
    return resolved;
  }
}
