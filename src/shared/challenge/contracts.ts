import type { ApiSuccess } from '../core/contracts';

export type ChallengeQuestionType = 'SINGLE' | 'MULTIPLE' | 'JUDGE';

export interface ChallengeQuestionDto {
  id: number;
  title: string;
  type: ChallengeQuestionType;
  options: string[] | string;
}

export interface ChallengeAnswerInput {
  questionId: number;
  answer: unknown;
}

export type ChallengeAnswersInput = Record<number, unknown> | ChallengeAnswerInput[];

export interface ChallengeSubmitInput {
  studentId: number;
  answers: ChallengeAnswersInput;
}

export interface ChallengeAnswerResultDto {
  questionId: number;
  isCorrect: boolean;
  correctAnswer: string | string[];
  explanation: string;
  userAnswer: unknown;
}

export interface ChallengeSubmissionDto {
  score: number;
  correctCount: number;
  wrongCount: number;
  results: ChallengeAnswerResultDto[];
}

export interface WorldBossDto {
  id: number;
  name: string;
  description: string;
  hp: number;
  max_hp: number;
  level: number;
  status: 'active' | 'defeated' | string;
  start_time?: string | null;
  end_time?: string | null;
}

export interface WorldBossPayload {
  name: string;
  description?: string;
  hp: number;
  level?: number;
  start_time?: string | null;
  end_time?: string | null;
}

export interface BossAttackInput {
  studentId: number;
}

export interface BossAttackResultDto {
  defeated: boolean;
  damage: number;
  newHp: number;
  rewardPoints: number;
}

export type ChallengeQuestionsResponse = ApiSuccess<{ questions: ChallengeQuestionDto[] }>;
export type ChallengeSubmitResponse = ApiSuccess<ChallengeSubmissionDto>;
export type WorldBossesResponse = ApiSuccess<{ bosses: WorldBossDto[] }>;
export type ActiveWorldBossResponse = ApiSuccess<{ boss: WorldBossDto | null }>;
export type BossAttackResponse = ApiSuccess<BossAttackResultDto>;
