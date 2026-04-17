import { apiGet, apiPost } from '@/lib/api';

export interface ChallengeQuestion {
  id: number;
  title: string;
  type: 'SINGLE' | 'MULTIPLE' | 'JUDGE';
  options: string[] | string;
}

export interface WorldBoss {
  id: number;
  name: string;
  description: string;
  hp: number;
  max_hp: number;
  level: number;
  status: string;
}

export interface ChallengeSubmitResponse {
  success: true;
  score: number;
  correctCount: number;
  wrongCount: number;
  results: Array<{
    questionId: number;
    isCorrect: boolean;
    correctAnswer: string | string[];
    explanation: string;
    userAnswer: string | string[];
  }>;
}

export interface BossAttackResponse {
  success: true;
  defeated: boolean;
  damage: number;
  newHp: number;
  rewardPoints: number;
}

export const challengeApi = {
  getQuestions: (limit = 5) =>
    apiGet<{ success: true; questions: ChallengeQuestion[] }>(`/api/challenge/questions?limit=${limit}`),

  submitAnswers: (payload: { studentId: number; answers: Record<number, unknown> }) =>
    apiPost<ChallengeSubmitResponse>('/api/challenge/submit', payload),

  getActiveBoss: (classId: number) =>
    apiGet<{ success: true; boss: WorldBoss | null }>(`/api/challenge/boss/active/${classId}`),

  attackBoss: (bossId: number, studentId: number) =>
    apiPost<BossAttackResponse>(`/api/challenge/boss/${bossId}/attack`, { studentId }),
};
