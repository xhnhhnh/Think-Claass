/**
 * Challenge domain types.
 *
 * The DTOs are re-exported from `@thinkclass/contracts` so the plugin and the
 * frontend share one definition; only what describes this plugin's own storage is
 * declared here.
 *
 * What is deliberately absent is as important as what is present: the pre-migration
 * repository owned `students` (`getStudent`, `addStudentPoints`, `listStudentsInClass`)
 * and the shared `records` ledger (`insertRecord`). Both moved behind
 * `classroom.public`, so they are no longer reachable from this interface at all.
 */

import type {
  BossAttackResultDto,
  ChallengeAnswerInput,
  ChallengeAnswersInput,
  ChallengeQuestionDto,
  ChallengeSubmissionDto,
  WorldBossDto,
  WorldBossPayload,
} from '@thinkclass/contracts/domains/challenge';

/** One `question_bank` row; read-only here - the system domain authors it. */
export interface ChallengeQuestionRow {
  id: number;
  title: string;
  type: string;
  options: string | null;
  answer: string;
  explanation: string | null;
}

/** Input to `createBoss` after the service has filled in every default. */
export type ChallengeBossInput = Required<Pick<WorldBossPayload, 'name' | 'description' | 'hp' | 'level'>> &
  Pick<WorldBossPayload, 'start_time' | 'end_time'>;

export interface ChallengeRepository {
  listQuestions(limit: number): ChallengeQuestionRow[];
  getQuestion(questionId: number): ChallengeQuestionRow | null;

  /** The plugin's own attempt log; the learner-facing response does not include it. */
  insertChallengeRecord(studentId: number, score: number, correctCount: number, wrongCount: number): void;

  listBosses(): WorldBossDto[];
  getActiveBoss(): WorldBossDto | null;
  getBoss(bossId: number, activeOnly?: boolean): WorldBossDto | null;
  createBoss(input: ChallengeBossInput): number;
  updateBossHp(bossId: number, hp: number, status: string): void;
  deleteBoss(bossId: number): void;

  /**
   * The attacking student's pet power, or `null` when they have no pet.
   *
   * `pets` is another domain's legacy table and there is no port accessor for
   * `attack_power` yet, so this is a declared read (`data.reads`) rather than a port
   * call. See the manifest's `_reads_note`.
   */
  getPetAttackPower(studentId: number): number | null;
}

export type {
  BossAttackResultDto,
  ChallengeAnswerInput,
  ChallengeAnswersInput,
  ChallengeQuestionDto,
  ChallengeSubmissionDto,
  WorldBossDto,
  WorldBossPayload,
};
