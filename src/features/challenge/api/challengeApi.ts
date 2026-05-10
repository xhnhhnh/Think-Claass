import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type {
  BossAttackResultDto,
  ChallengeAnswersInput,
  ChallengeQuestionDto,
  ChallengeSubmissionDto,
  WorldBossDto,
  WorldBossPayload,
} from '../types';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export const challengeApi = {
  getQuestions: (studentId: number, limit = 5) =>
    apiGet<ApiSuccess<{ questions: ChallengeQuestionDto[] }> & { questions: ChallengeQuestionDto[] }>(
      `/api/challenge/students/${studentId}/questions?limit=${limit}`,
    ),

  submitAnswers: (payload: { studentId: number; answers: ChallengeAnswersInput }) =>
    apiPost<ApiSuccess<ChallengeSubmissionDto> & ChallengeSubmissionDto>(
      `/api/challenge/students/${payload.studentId}/submissions`,
      { answers: payload.answers },
    ),

  getActiveBoss: (classId: number) =>
    apiGet<ApiSuccess<{ boss: WorldBossDto | null }> & { boss: WorldBossDto | null }>(
      `/api/challenge/classes/${classId}/bosses/active`,
    ),

  getWorldBosses: () =>
    apiGet<ApiSuccess<{ bosses: WorldBossDto[] }> & { bosses: WorldBossDto[] }>('/api/challenge/bosses'),

  createWorldBoss: (payload: WorldBossPayload) =>
    apiPost<ApiSuccess<{ id: number }> & { id?: number }>('/api/challenge/bosses', payload),

  deleteWorldBoss: (bossId: number) =>
    apiDelete<ApiSuccess<{ deleted: boolean }>>(`/api/challenge/bosses/${bossId}`),

  attackBoss: (bossId: number, studentId: number) =>
    apiPost<ApiSuccess<BossAttackResultDto> & BossAttackResultDto>(`/api/challenge/bosses/${bossId}/attacks`, { studentId }),
};
