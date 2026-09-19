/**
 * Challenge service.
 *
 * Two storage boundaries meet here, and the difference is the point of the migration:
 *
 *   challenge_records, world_bosses   owned by this plugin   -> `ctx.db` (repository)
 *   students, records                 owned by classroom     -> `classroom.public`
 *
 * The pre-migration service wrote `students.total_points` / `students.available_points`
 * and appended to `records` directly, and read `students` for its 404s and for the
 * class roster. All of that now goes through the port, so `students` and `records` keep
 * exactly one writer.
 *
 * ## Atomicity, stated honestly
 *
 * The original code mutated `students`, `records`, `challenge_records` and
 * `world_bosses` inside one better-sqlite3 transaction. That is no longer possible: the
 * port writes through the classroom plugin, and a synchronous transaction cannot span
 * an `await`. Each step below is therefore individually atomic rather than collectively
 * so, and the ordering is chosen so that the failure that can actually happen is the
 * harmless one:
 *
 *   submit  - score from `question_bank`, then award points through the port, then log
 *             the ledger entry, then write the plugin's own attempt row. A failure
 *             before the award leaves nothing behind; a failure after it leaves the
 *             student paid with no attempt row, which is the visible-but-harmless side.
 *
 *   attack  - the boss row is marked defeated *before* the class is rewarded, so a
 *             failure inside the reward loop cannot pay the same class twice for the
 *             same boss (the next attack sees `status = 'defeated'` and 404s). The cost
 *             is that a mid-loop failure can leave part of the class unrewarded, which
 *             the ledger makes visible. The reverse order would double-pay on a retry,
 *             which is worse and invisible.
 *
 * Restoring true cross-plugin atomicity needs a kernel-level unit of work, which is
 * P6/P7 work (the same limitation economy recorded).
 */

import type { ClassroomPort, ClassroomRefusal, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { PetPort } from '@thinkclass/contracts/domains/pet';
import { ApiError } from '@thinkclass/kernel';

import { isAnswerCorrect, mapQuestionRow, parseMaybeJson, toAnswerList } from './challenge.mappers.js';
import type { ChallengeAnswersInput, ChallengeRepository, WorldBossPayload } from './challenge.types.js';

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

/**
 * Map a refusal from the classroom port onto this domain's HTTP status and message.
 *
 * The port cannot throw the kernel's `ApiError` (contracts are type-only, guardrail
 * G6), so it returns a code and each caller decides. The messages are the ones the
 * pre-migration `api/utils/classFeatures.ts` and `api/utils/apiError.ts` produced, so
 * the HTTP contract does not move.
 */
function toApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal.code) {
    case 'feature-disabled':
      return new ApiError(403, '该功能当前已关闭');
    case 'class-not-found':
      return new ApiError(404, '班级未找到');
    case 'student-not-found':
      return new ApiError(404, '学生未找到');
    default:
      return new ApiError(400, refusal.message);
  }
}

export class ChallengeService {
  constructor(
    private readonly repository: ChallengeRepository,
    private readonly classroom: ClassroomPort,
    /**
     * Resolves the pet domain's port, or null when the pet plugin is not active.
     *
     * A **function**, not the port itself, and that is not a style choice: plugins are set up
     * in slug order, so `challenge` initialises before `pet` does and `ctx.tryUse('pet.public')`
     * called during `setup()` returns null - permanently, because the result was captured. The
     * first real-boot probe of this change measured exactly that: damage stayed at the fallback
     * of 10 while the database held a pet with `attack_power` 468. The registry is a live map,
     * so resolving at call time sees the port that `pet` publishes a few milliseconds later.
     *
     * Resolving lazily is also what keeps this dependency optional: `ctx.use` plus
     * `dependsOn: { pet }` would make the resolver reject challenge entirely whenever pet is
     * disabled, for a value that already has a sensible fallback.
     */
    private readonly resolvePets: () => PetPort | null = () => null,
  ) {}

  /**
   * Questions for the quiz.
   *
   * When `studentId` is given (the student-scoped route) the caller's class must have
   * `enable_challenge` on. Order is preserved from the pre-migration service: the
   * student lookup (404) runs before the feature check (403).
   */
  async getQuestions(limitInput: unknown = 10, studentIdInput?: unknown) {
    const limit = Math.min(50, Math.max(1, Number(limitInput) || 10));
    if (studentIdInput) {
      const studentId = positiveInteger(studentIdInput, 'Student id');
      await this.requireStudent(studentId);
      await this.assertStudentFeature(studentId, 'enable_challenge');
    }
    return this.repository.listQuestions(limit).map(mapQuestionRow);
  }

  /**
   * Feature gate for the legacy actor-scoped alias `GET /api/challenge/questions`.
   *
   * This is the one route the pre-migration controller gated on the *caller* rather
   * than on a path id: `assertActorFeatureEnabled(actor.id, 'student',
   * 'enable_challenge')` resolved `students.user_id = actor.id` and then checked that
   * student's class. The user-id lookup is not derivable from the kernel's actor
   * (`sessions.verify` returns `{ userId, role }` only), so it is a port call:
   * `getStudentByUserId`.
   *
   * The 404 message is deliberately `班级未找到`: that is the string
   * `getClassIdByUserId` threw when no student matched the user id, and the deployed
   * client contract is preserved rather than tidied.
   */
  async assertActorCanReadQuestions(userId: number): Promise<void> {
    const student = await this.classroom.getStudentByUserId(userId);
    if (!student) {
      throw new ApiError(404, '班级未找到');
    }
    await this.assertStudentFeature(student.id, 'enable_challenge');
  }

  /**
   * Score a submission and pay for it.
   *
   * Validation order is unchanged: student (404) -> feature gate (403) -> body (400).
   * Only a positive score touches the balance and the ledger; the attempt row is
   * always written.
   */
  async submitAnswers(studentIdInput: unknown, answers: ChallengeAnswersInput) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    await this.requireStudent(studentId);
    await this.assertStudentFeature(studentId, 'enable_challenge');
    if (!answers) {
      throw new ApiError(400, 'Missing required fields');
    }

    let correctCount = 0;
    let wrongCount = 0;
    let score = 0;
    const results = [];

    for (const item of toAnswerList(answers)) {
      const question = this.repository.getQuestion(positiveInteger(item.questionId, 'Question id'));
      if (!question) continue;

      const correct = isAnswerCorrect(item.answer, question.answer);
      if (correct) {
        correctCount += 1;
        score += 2;
      } else {
        wrongCount += 1;
      }

      results.push({
        questionId: question.id,
        isCorrect: correct,
        correctAnswer: parseMaybeJson(question.answer) as string | string[],
        explanation: question.explanation ?? '',
        userAnswer: item.answer,
      });
    }

    if (score > 0) {
      // `adjustPoints` moves total_points and available_points together - the same
      // both-columns update the pre-migration `addStudentPoints` performed.
      await this.classroom.adjustPoints({
        studentId,
        delta: score,
        reason: 'challenge.reward',
        actorId: 0,
      });
      await this.ledger(studentId, 'CHALLENGE_REWARD', score, '挑战模式加分');
    }

    this.repository.insertChallengeRecord(studentId, score, correctCount, wrongCount);
    return { score, correctCount, wrongCount, results };
  }

  /** The active world boss for a class; the class-scope flag gates it. */
  async getActiveBoss(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    await this.assertClassFeature(classId, 'enable_world_boss');
    return this.repository.getActiveBoss();
  }

  /** Global boss list. No feature gate: the pre-migration service had none. */
  listBosses() {
    return this.repository.listBosses();
  }

  /** Teacher boss CRUD. No feature gate: the pre-migration service had none. */
  createBoss(input: WorldBossPayload) {
    const name = String(input.name || '').trim();
    const hp = positiveInteger(input.hp, 'Boss hp');
    if (!name) {
      throw new ApiError(400, 'Invalid input');
    }
    const id = this.repository.createBoss({
      name,
      description: input.description ?? '',
      hp,
      level: input.level ? positiveInteger(input.level, 'Boss level') : 1,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
    });
    return { id };
  }

  deleteBoss(bossIdInput: unknown) {
    const bossId = positiveInteger(bossIdInput, 'Boss id');
    if (!this.repository.getBoss(bossId)) {
      throw new ApiError(404, 'Boss not found');
    }
    this.repository.deleteBoss(bossId);
    return { deleted: true };
  }

  /**
   * Attack the world boss as `studentId`, rewarding the whole class on a kill.
   *
   * Order is preserved from the pre-migration transaction: feature gate -> boss
   * lookup (404 when gone or already defeated) -> student lookup -> pet damage -> boss
   * write -> class rewards -> attack ledger entry. See the atomicity note at the top
   * of this file for why the boss write comes before the rewards.
   */
  async attackBoss(bossIdInput: unknown, studentIdInput: unknown) {
    const bossId = positiveInteger(bossIdInput, 'Boss id');
    const studentId = positiveInteger(studentIdInput, 'Student id');
    await this.assertStudentFeature(studentId, 'enable_world_boss');

    const boss = this.repository.getBoss(bossId, true);
    if (!boss) {
      throw new ApiError(404, 'Boss not found or already defeated');
    }

    const student = await this.requireStudent(studentId);
    // `?? 10` is the pre-migration default, and it now covers two cases that used to be one:
    // the student has no pet, and the pet plugin is not running at all.
    const damage = (await this.resolvePets()?.getBattleProfile(studentId))?.attackPower ?? 10;
    const newHp = Math.max(0, boss.hp - damage);
    const defeated = newHp <= 0;
    const rewardPoints = defeated ? boss.level * 50 : 0;

    this.repository.updateBossHp(bossId, newHp, defeated ? 'defeated' : 'active');

    if (defeated) {
      for (const classStudent of await this.classroom.listClassStudents(student.classId)) {
        await this.classroom.adjustPoints({
          studentId: classStudent.id,
          delta: rewardPoints,
          reason: 'world_boss.reward',
          actorId: 0,
        });
        await this.ledger(classStudent.id, 'BOSS_REWARD', rewardPoints, '世界Boss被击败奖励');
      }
    }

    await this.ledger(studentId, 'BOSS_ATTACK', 0, `攻击了世界Boss，造成 ${damage} 点伤害`);
    return { defeated, damage, newHp, rewardPoints };
  }

  /**
   * Resolve a student through the port, or answer 404.
   *
   * The message is the pre-migration service's `'Student not found'` for the two
   * student-scoped routes; the actor-scoped alias uses its own 404 message (see
   * `assertActorCanReadQuestions`).
   */
  private async requireStudent(studentId: number): Promise<StudentSnapshot> {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }
    return student;
  }

  /** Student-scope feature gate: 403 when the student's class has the flag off. */
  private async assertStudentFeature(studentId: number, feature: string): Promise<void> {
    const gate = await this.classroom.checkStudentFeature(studentId, feature);
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /**
   * Class-scope feature gate.
   *
   * Needed because `getActiveBoss` holds a class id and no student id - the port
   * exposes both forms rather than this plugin re-deriving the flag semantics.
   */
  private async assertClassFeature(classId: number, feature: string): Promise<void> {
    const gate = await this.classroom.checkClassFeature(classId, feature);
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /**
   * Append to the shared point ledger.
   *
   * Deliberately not fatal: the balance has already moved, and a missing history row
   * is a smaller problem than a challenge attempt reporting failure after it
   * succeeded. The plugin boundary logs the failure, so it is visible rather than
   * silent.
   */
  private async ledger(studentId: number, type: string, amount: number, description: string): Promise<void> {
    await this.classroom.recordStudentLedgerEntry({ studentId, type, amount, description });
  }
}
