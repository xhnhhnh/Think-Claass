import { useMutation, useQuery } from '@tanstack/react-query';

import { challengeApi } from '@/api/challenge';

export function useChallengeQuestions(limit = 5) {
  return useQuery({
    queryKey: ['challenge-questions', limit],
    queryFn: async () => {
      const data = await challengeApi.getQuestions(limit);
      return data.questions;
    },
  });
}

export function useChallengeSubmitMutation(studentId: number | null) {
  return useMutation({
    mutationFn: async (answers: Record<number, unknown>) => {
      if (!studentId) {
        throw new Error('学生信息不存在');
      }
      return challengeApi.submitAnswers({ studentId, answers });
    },
  });
}

export function useActiveBoss(classId: number | null) {
  return useQuery({
    queryKey: ['active-world-boss', classId],
    queryFn: async () => {
      if (!classId) return null;
      const data = await challengeApi.getActiveBoss(classId);
      return data.boss;
    },
    enabled: !!classId,
  });
}

export function useAttackBossMutation(studentId: number | null) {
  return useMutation({
    mutationFn: async (bossId: number) => {
      if (!studentId) {
        throw new Error('学生信息不存在');
      }
      return challengeApi.attackBoss(bossId, studentId);
    },
  });
}
