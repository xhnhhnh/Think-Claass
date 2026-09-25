import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { aiStudyApi } from '../api/aiStudyApi';

/**
 * Query keys for AI 智学.
 *
 * One root, so a single `invalidateQueries({ queryKey: aiStudyKeys.all })` refreshes the set, the
 * board and anything derived from them. The set key is the *student's current* set rather than an id,
 * because that is what the API answers: "the one open set" is the identity here, which is also why a
 * second generate returns the same set instead of replacing it.
 */
export const aiStudyKeys = {
  all: ['ai-study'] as const,
  mySet: () => ['ai-study', 'my-set'] as const,
  classInsight: (classId: number | null) => ['ai-study', 'class-insight', classId] as const,
};

/** GET /api/ai-study/my/sets/current - the student's open set, or null. */
export function useMyAiStudySet() {
  return useQuery({
    queryKey: aiStudyKeys.mySet(),
    queryFn: async () => (await aiStudyApi.currentMySet()).data,
  });
}

/**
 * POST /api/ai-study/my/sets - 生成今日智学.
 *
 * A mutation rather than a query, for the same reason `useGenerateQuestionsMutation` is: it is an
 * action with a side effect (a set is written), and caching it would mean a page that re-runs it on
 * every mount. The result *is* the new set, and both the set key and the wrong-question book are
 * invalidated - the book moves because a submitted set writes mastery back into it.
 */
export function useGenerateAiStudySetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { subject_id?: number | null; size?: number; hint?: string | null } = {}) =>
      aiStudyApi.generateMySet(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: aiStudyKeys.all });
    },
  });
}

/** PUT /api/ai-study/sets/:id/answers - save, without closing the set. */
export function useSaveAiStudyAnswersMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { setId: number; answers: Array<{ item_id: number; value: string; spent_sec?: number }> }) =>
      aiStudyApi.saveAnswers(input.setId, input.answers),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: aiStudyKeys.all });
    },
  });
}

/** POST /api/ai-study/sets/:id/submit - judge the answers and close the set. */
export function useSubmitAiStudySetMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: number) => aiStudyApi.submitSet(setId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: aiStudyKeys.all });
      // The submit writes mastery through the learning port, so the student's 错题本 is stale the
      // moment it succeeds. Invalidating it here is what stops them opening the book and seeing the
      // number they had before the practice.
      await queryClient.invalidateQueries({ queryKey: ['wrong-questions'] });
    },
  });
}

/** GET /api/ai-study/classes/:classId/insight - the teacher board for one class. */
export function useAiStudyClassInsight(classId: number | null) {
  return useQuery({
    queryKey: aiStudyKeys.classInsight(classId),
    queryFn: async () => (await aiStudyApi.classInsight(classId as number)).data,
    enabled: !!classId,
  });
}

/** POST /api/ai-study/classes/:classId/assign - dispatch sets to the selected students. */
export function useAssignAiStudySetsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { classId: number; studentIds: number[]; subjectId?: number | null; size?: number; hint?: string | null }) =>
      aiStudyApi.assign(input.classId, {
        student_ids: input.studentIds,
        subject_id: input.subjectId ?? null,
        size: input.size,
        hint: input.hint ?? null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: aiStudyKeys.all });
    },
  });
}
