import type {
  BossAttackResultDto,
  ChallengeAnswerInput,
  ChallengeAnswersInput,
  ChallengeQuestionDto,
  ChallengeSubmissionDto,
  WorldBossDto,
  WorldBossPayload,
} from '../../../src/shared/challenge/contracts.js';

export interface ChallengeQuestionRow {
  id: number;
  title: string;
  type: string;
  options: string | null;
  answer: string;
  explanation: string | null;
}

export interface ChallengeStudentRow {
  id: number;
  class_id: number;
  total_points: number;
  available_points: number;
}

export interface ChallengeRepository {
  transaction<T>(fn: () => T): T;
  listQuestions(limit: number): ChallengeQuestionRow[];
  getQuestion(questionId: number): ChallengeQuestionRow | null;
  getStudent(studentId: number): ChallengeStudentRow | null;
  addStudentPoints(studentId: number, points: number): void;
  insertRecord(studentId: number, type: string, amount: number, description: string): void;
  insertChallengeRecord(studentId: number, score: number, correctCount: number, wrongCount: number): void;
  listBosses(): WorldBossDto[];
  getActiveBoss(): WorldBossDto | null;
  getBoss(bossId: number, activeOnly?: boolean): WorldBossDto | null;
  createBoss(input: Required<Pick<WorldBossPayload, 'name' | 'description' | 'hp' | 'level'>> & Pick<WorldBossPayload, 'start_time' | 'end_time'>): number;
  updateBossHp(bossId: number, hp: number, status: string): void;
  deleteBoss(bossId: number): void;
  getPetAttackPower(studentId: number): number | null;
  listStudentsInClass(classId: number): ChallengeStudentRow[];
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
