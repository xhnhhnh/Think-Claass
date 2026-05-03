import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { challengeApi } from '../api/challengeApi';
import type { ChallengeAnswersInput, WorldBossMutationInput } from '../types';

export const challengeQueryKeys = {
  questions: (studentId: number | null, limit: number) => ['challenge', 'questions', studentId, limit] as const,
  activeBoss: (classId: number | null) => ['challenge', 'active-boss', classId] as const,
  worldBosses: ['challenge', 'world-bosses'] as const,
};

export function useChallengeQuestions(studentId: number | null, limit = 5) {
  return useQuery({
    queryKey: challengeQueryKeys.questions(studentId, limit),
    queryFn: async () => {
      if (!studentId) return [];
      const response = await challengeApi.getQuestions(studentId, limit);
      return response.data.questions;
    },
    enabled: !!studentId,
  });
}

export function useChallengeSubmitMutation(studentId: number | null) {
  return useMutation({
    mutationFn: async (answers: ChallengeAnswersInput) => {
      if (!studentId) throw new Error('学生信息不存在');
      return challengeApi.submitAnswers({ studentId, answers });
    },
  });
}

export function useActiveBoss(classId: number | null) {
  return useQuery({
    queryKey: challengeQueryKeys.activeBoss(classId),
    queryFn: async () => {
      if (!classId) return null;
      const response = await challengeApi.getActiveBoss(classId);
      return response.data.boss;
    },
    enabled: !!classId,
  });
}

export function useAttackBossMutation(studentId: number | null, classId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bossId: number) => {
      if (!studentId) throw new Error('学生信息不存在');
      return challengeApi.attackBoss(bossId, studentId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: challengeQueryKeys.activeBoss(classId) });
    },
  });
}

export function useWorldBosses() {
  return useQuery({
    queryKey: challengeQueryKeys.worldBosses,
    queryFn: async () => {
      const response = await challengeApi.getWorldBosses();
      return response.data.bosses;
    },
  });
}

export function useWorldBossMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: WorldBossMutationInput) => {
      if (payload.type === 'create') return challengeApi.createWorldBoss(payload.data);
      return challengeApi.deleteWorldBoss(payload.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: challengeQueryKeys.worldBosses });
      await queryClient.invalidateQueries({ queryKey: ['challenge', 'active-boss'] });
    },
  });
}
