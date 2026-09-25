/**
 * Dungeon service.
 *
 * Two storage boundaries meet here, and the difference is the whole point of the
 * migration:
 *
 *   dungeon_runs                     owned by this plugin  -> `ctx.db`
 *   students.available_points, records owned by classroom   -> `classroom.public`
 *
 * The pre-migration service did all of it against one raw connection: it read and
 * wrote `dungeon_runs`, bumped `students.available_points` directly and inserted the
 * reward row into the shared `records` ledger. The first is this plugin's table and
 * stays; the other two moved behind the port, because a second writer would
 * invalidate classroom's ownership declaration - and the runtime's ownership check
 * rejects the statement at the call site.
 *
 * ## Contract preserved
 *
 * Routes, envelopes, status codes and the "points reward" rules are unchanged:
 *
 *   - a missing student answers 404 `学生未找到` *before* the feature gate, exactly
 *     as `assertStudentFeatureEnabled` did (it looked the student up first);
 *   - a student whose class row is gone answers 404 `班级未找到`, which is why the
 *     gate is the pair `getStudentById` + `checkClassFeature` rather than the
 *     single-call form. Same lookup order, same two statuses, both through the port;
 *   - a class with `enable_dungeon` off answers 403 `该功能当前已关闭`;
 *   - a points reward only moves `available_points` (not `total_points`), which is
 *     what `transferStudentCredits` does and what `adjustPoints` would not.
 *
 * ## Atomicity, stated honestly
 *
 * The original `choose()` ran the run transition and the point grant in one
 * better-sqlite3 transaction. That is no longer possible: the port writes through the
 * classroom plugin and a synchronous transaction cannot span an `await`. So a choice
 * is a short sequence of individually-atomic steps:
 *
 *   feature gate -> run transition (one transaction) -> credit -> ledger entry
 *
 * The ordering picks the failure that is harmless. If the run transition fails,
 * nothing was granted and nothing needs undoing. If the credit is refused (only
 * reachable when the student row vanished between the gate and the write - a positive
 * delta cannot overdraw), the floor has advanced but no points were granted: the
 * player can retry the choice, so the reward is at worst delayed, never duplicated.
 * The reverse order would allow farming the same reward by retrying a failed write.
 *
 * The ledger entry is the last step, so a ledger failure surfaces as a 500 after the
 * credit moved - the same exposure the economy migration documents. Restoring true
 * cross-plugin atomicity needs a kernel-level unit of work, which is P6/P7 work.
 */

import type { ClassroomPort, ClassroomRefusal } from '@thinkclass/contracts/domains/classroom';
import { ApiError } from '@thinkclass/kernel';

import type { RequestActor } from './dungeon.authorization.js';
import type { DungeonChoicePayload, DungeonRepository, DungeonRunRow, FloorChoice } from './dungeon.types.js';

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

function parseBuffs(raw: DungeonRunRow['active_buffs']) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRun(run: DungeonRunRow) {
  return { ...run, active_buffs: parseBuffs(run.active_buffs) };
}

/**
 * Map a refusal from the classroom port onto this domain's HTTP status.
 *
 * The port cannot throw the kernel's `ApiError` (contracts are type-only, guardrail
 * G6), so it returns a code and each caller decides. These are exactly the statuses
 * and messages the pre-migration `assertStudentFeatureEnabled` produced.
 */
function toApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal.code) {
    case 'feature-disabled':
      return new ApiError(403, '该功能当前已关闭');
    case 'student-not-found':
      return new ApiError(404, '学生未找到');
    case 'class-not-found':
      return new ApiError(404, '班级未找到');
    default:
      return new ApiError(400, refusal.message);
  }
}

export function generateFloorChoices(floor: number, random = Math.random): FloorChoice[] {
  if (floor % 5 === 0) {
    return [
      {
        id: 'boss',
        title: '深渊首领',
        description: '强大的怪物拦住了去路。需消耗大量生命值换取史诗级遗物。',
        type: 'combat',
        hpCost: Math.floor(random() * 30) + 40,
        rewardType: 'buff',
        rewardValue: '史诗遗物: 吸血面具',
      },
    ];
  }

  const choices: FloorChoice[] = [];
  const types: FloorChoice['type'][] = ['combat', 'event', 'treasure', 'rest'];
  for (let i = 0; i < 3; i += 1) {
    const type = types[Math.floor(random() * types.length)];
    if (type === 'combat') {
      choices.push({
        id: `combat_${i}`,
        title: '怪物房间',
        description: '一群小怪。',
        type,
        hpCost: Math.floor(random() * 15) + 5,
        rewardType: 'points',
        rewardValue: Math.floor(random() * 50) + 20,
      });
    } else if (type === 'event') {
      choices.push({
        id: `event_${i}`,
        title: '神秘祭坛',
        description: '献祭生命获取随机增益。',
        type,
        hpCost: 20,
        rewardType: 'buff',
        rewardValue: '神秘恩赐: 攻击力+10%',
      });
    } else if (type === 'treasure') {
      choices.push({
        id: `treasure_${i}`,
        title: '宝箱房间',
        description: '需要消耗一点生命值强行破开陷阱锁。',
        type,
        hpCost: 10,
        rewardType: 'points',
        rewardValue: 100,
      });
    } else {
      choices.push({
        id: `rest_${i}`,
        title: '营地',
        description: '安全的休息区，恢复生命值。',
        type,
        hpCost: 0,
        rewardType: 'heal',
        rewardValue: 30,
      });
    }
  }
  return choices;
}

export class DungeonService {
  constructor(
    private readonly repository: DungeonRepository,
    private readonly classroom: ClassroomPort,
    private readonly random = Math.random,
  ) {}

  /**
   * The actor-scope half of authorization for the acting routes: 403 unless `actor` is the student
   * this row belongs to.
   *
   * The claim is resolved from the actor - its `studentId` when the host's scope resolver filled it
   * in, otherwise the student bound to the login's `userId` through `classroom.public` - so an
   * authenticated caller cannot advance, or collect the reward for, another student's run.
   */
  async assertSelfStudent(actor: RequestActor, studentIdInput: unknown): Promise<void> {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    if (actor.role !== 'student' || (await this.ownStudentId(actor)) !== studentId) {
      throw new ApiError(403, '无权限使用该学生账号');
    }
  }

  /**
   * The actor-scope half of authorization for the read routes: the student's own row, or a teacher
   * who teaches the class that row is in (the matrix allows `teacher（本班，只读）`).
   */
  async assertStudentReadable(actor: RequestActor, studentIdInput: unknown): Promise<void> {
    const studentId = positiveInteger(studentIdInput, 'Student id');

    if (actor.role === 'student') {
      if ((await this.ownStudentId(actor)) !== studentId) throw new ApiError(403, '无权限查看该学生');
      return;
    }

    if (actor.role === 'teacher') {
      const student = await this.classroom.getStudentById(studentId);
      if (!student) throw new ApiError(404, '学生未找到');
      const owned = actor.id === null ? [] : await this.classroom.listClassIdsByTeacher(actor.id);
      if (!owned.includes(student.classId)) throw new ApiError(403, '无权限查看该学生');
      return;
    }

    throw new ApiError(403, '无权限查看该学生');
  }

  /** The student row this login owns, or `null` when the account is unbound. */
  private async ownStudentId(actor: RequestActor): Promise<number | null> {
    if (actor.studentId) return actor.studentId;
    if (actor.id === null) return null;
    const student = await this.classroom.getStudentByUserId(actor.id);
    return student?.id ?? null;
  }

  async getRun(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    await this.requireDungeonStudent(studentId);
    const run = this.repository.getActiveRun(studentId);
    if (!run) return { run: null, best_floor: this.repository.getBestFloor(studentId) };
    const mapped = mapRun(run);
    return { run: mapped, choices: generateFloorChoices(mapped.current_floor, this.random) };
  }

  async startRun(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    await this.requireDungeonStudent(studentId);
    const runId = this.repository.transaction(() => {
      this.repository.endActiveRuns(studentId);
      return this.repository.createRun(studentId);
    });
    return { runId };
  }

  async choose(studentIdInput: unknown, input: DungeonChoicePayload) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    await this.requireDungeonStudent(studentId);

    // Platform table first, in one transaction: a throw here rolls the run
    // transition back and nothing has been granted yet.
    const outcome = this.repository.transaction(() => {
      const runRow = this.repository.getActiveRun(studentId);
      if (!runRow) throw new ApiError(404, 'No active run');

      const run = mapRun(runRow);
      let newHp = run.current_hp - Number(input.hpCost || 0);
      let status = run.status;
      let newFloor = run.current_floor;
      const activeBuffs = [...run.active_buffs];
      // The ledger description names the floor the choice was made on, i.e. before
      // the increment - same value the pre-migration `insertRecord` used.
      const rewardFloor = run.current_floor;
      /** `null` means "this was not a points reward"; 0 is a valid reward. */
      let reward: number | null = null;

      if (newHp <= 0) {
        status = 'died';
        newHp = 0;
      } else {
        newFloor += 1;
        if (input.rewardType === 'heal') {
          newHp = Math.min(run.max_hp, newHp + Number(input.rewardValue || 0));
        } else if (input.rewardType === 'buff' && input.rewardValue) {
          activeBuffs.push(String(input.rewardValue));
        } else if (input.rewardType === 'points') {
          reward = Number(input.rewardValue || 0);
        }
      }

      this.repository.updateRun(run.id, {
        currentFloor: newFloor,
        maxFloor: Math.max(newFloor, run.max_floor),
        currentHp: newHp,
        activeBuffs,
        status,
      });

      return { status, newHp, newFloor, reward, rewardFloor };
    });

    if (outcome.reward !== null) {
      await this.grantReward(studentId, outcome.reward, outcome.rewardFloor);
    }

    return { status: outcome.status, newHp: outcome.newHp, newFloor: outcome.newFloor };
  }

  async abandon(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    await this.requireDungeonStudent(studentId);
    this.repository.endActiveRuns(studentId);
    return { abandoned: true };
  }

  /**
   * The feature gate, through the port.
   *
   * Deliberately the two-step form: the pre-migration helper resolved the student's
   * class first (404 `学生未找到`) and then the class row (404 `班级未找到`), and
   * `checkStudentFeature` would collapse the second case into a 403. Both calls are
   * port calls, so `students` and `classes` still have exactly one reader.
   */
  private async requireDungeonStudent(studentId: number): Promise<void> {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, '学生未找到');

    const gate = await this.classroom.checkClassFeature(student.classId, 'enable_dungeon');
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /**
   * Grant a points reward: move the spendable balance, then append the ledger row.
   *
   * `transferStudentCredits` (not `adjustPoints`) because the pre-migration code ran
   * `UPDATE students SET available_points = available_points + ?` - the earned half of
   * the balance is untouched by a dungeon reward.
   */
  private async grantReward(studentId: number, amount: number, floor: number): Promise<void> {
    await this.classroom.awardStudentPoints({
      studentId,
      amount,
      type: 'DUNGEON_REWARD',
      description: `Found treasure on floor ${floor}`,
      actorId: 0,
    });
  }
}
