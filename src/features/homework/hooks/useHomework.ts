import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  HomeworkAiGeneratePayload,
  HomeworkAiGradePayload,
  HomeworkGradePayload,
  HomeworkPublishPayload,
  HomeworkQaAskPayload,
  HomeworkSaveAnswersPayload,
  HomeworkSubmitPayload,
  HomeworkUpdatePayload,
} from '@thinkclass/contracts/domains/homework';

import { homeworkApi } from '../api/homeworkApi';

/**
 * Homework queries and mutations.
 *
 * The same shape as `useAssignments`: one `*Keys` object so a mutation can invalidate what it
 * changed without the page repeating a literal array, thin `useQuery` wrappers that unwrap
 * `.data` (the api layer returns the whole envelope), and `useMutation` wrappers that
 * invalidate on success.
 *
 * Every key hangs off `homeworkKeys.all`, so a broad
 * `invalidateQueries({ queryKey: homeworkKeys.all })` after a publish or a grading write
 * refreshes the teacher list, the grade sheet and the counts in one call - which is what a
 * page that shows all three needs.
 */
export const homeworkKeys = {
  all: ['homework'] as const,
  list: () => ['homework', 'list'] as const,
  mine: () => ['homework', 'mine'] as const,
  detail: (id: number | null) => ['homework', 'detail', id] as const,
  submissions: (id: number | null) => ['homework', 'submissions', id] as const,
  /**
   * The list page's 已提交/应交 pair.
   *
   * Keyed by the *set* of homework ids rather than by one id, because one query answers for
   * the whole page: `useQueries` would give N loading flags and N cache entries for one
   * column of numbers.
   */
  counts: (idsKey: string) => ['homework', 'counts', idsKey] as const,
  submission: (id: number | null) => ['homework', 'submission', id] as const,
  qa: (id: number | null) => ['homework', 'qa', id] as const,
  /**
   * The teacher's read of one pupil's thread.
   *
   * Keyed by the pupil as well as the homework: one homework has one thread *per student*, so a key
   * without the id would hand a second pupil the first one's messages out of the cache.
   */
  teacherQa: (id: number | null, studentId: number | null) => ['homework', 'qa', id, studentId] as const,
};

/** GET /api/homework - the teacher's own homework. */
export function useHomeworkList() {
  return useQuery({
    queryKey: homeworkKeys.list(),
    queryFn: async () => (await homeworkApi.list()).data,
  });
}

/** GET /api/homework/my - the signed-in student's homework with their own attempt. */
export function useMyHomework() {
  return useQuery({
    queryKey: homeworkKeys.mine(),
    queryFn: async () => (await homeworkApi.listMine()).data,
  });
}

/** GET /api/homework/:id - one homework with its questions. */
export function useHomeworkDetail(id: number | null) {
  return useQuery({
    queryKey: homeworkKeys.detail(id),
    queryFn: async () => (await homeworkApi.detail(id as number)).data,
    enabled: !!id,
  });
}

/** GET /api/homework/:id/submissions - the teacher's grade sheet. */
export function useHomeworkSubmissions(id: number | null) {
  return useQuery({
    queryKey: homeworkKeys.submissions(id),
    queryFn: async () => (await homeworkApi.listSubmissions(id as number)).data,
    enabled: !!id,
  });
}

/**
 * 已提交 / 应交 for every homework on the list page.
 *
 * One query over the whole set: the grade sheet each request returns is already the class roll
 * expanded by the backend, so `rows.length` IS 应交 and the count of non-`draft` rows is
 * 已提交. That is why the page needs no student roster of its own.
 *
 * `total` falls back to `submitted` when the sheet comes back empty, so the UI never divides
 * by a zero it invented.
 */
export function useHomeworkSubmissionCounts(ids: number[]) {
  const sorted = [...ids].sort((a, b) => a - b);
  const idsKey = sorted.join(',');

  return useQuery({
    queryKey: homeworkKeys.counts(idsKey),
    queryFn: async () => {
      const sheets = await Promise.all(
        sorted.map(async (id) => [id, (await homeworkApi.listSubmissions(id)).data] as const),
      );

      const counts: Record<number, { submitted: number; graded: number; total: number }> = {};
      for (const [id, rows] of sheets) {
        const submitted = rows.filter((row) => row.submission.status !== 'draft').length;
        const graded = rows.filter((row) => row.submission.status === 'graded').length;
        counts[id] = { submitted, graded, total: Math.max(rows.length, submitted) };
      }
      return counts;
    },
    enabled: sorted.length > 0,
  });
}

/** GET /api/homework/submissions/:id - one submission with answers and photos. */
export function useHomeworkSubmission(id: number | null) {
  return useQuery({
    queryKey: homeworkKeys.submission(id),
    queryFn: async () => (await homeworkApi.getSubmission(id as number)).data,
    enabled: !!id,
  });
}

/** GET /api/homework/:id/qa - the student's AI question thread. */
export function useHomeworkQa(id: number | null) {
  return useQuery({
    queryKey: homeworkKeys.qa(id),
    queryFn: async () => (await homeworkApi.listQa(id as number)).data,
    enabled: !!id,
  });
}

/**
 * The same thread, read by the teacher on a named pupil's behalf.
 *
 * Separate from `useHomeworkQa` rather than an optional argument on it because the two have
 * different *requirements*, not just different parameters: the backend pins a student to their own
 * `studentId` and refuses a query naming someone else, while a teacher gets a 400 unless they name
 * one. Folding both into one hook would make the teacher's required argument look optional and the
 * student's forbidden one look available.
 *
 * The cache key includes the pupil, so opening a second student's thread cannot show the first
 * one's messages while it loads - which is exactly the bug that would leak one pupil's questions
 * into another's panel.
 */
export function useTeacherHomeworkQa(id: number | null, studentId: number | null) {
  return useQuery({
    queryKey: homeworkKeys.teacherQa(id, studentId),
    queryFn: async () => (await homeworkApi.listQa(id as number, studentId as number)).data,
    enabled: !!id && !!studentId,
  });
}

/**
 * POST /api/homework/ai/questions - 出题.
 *
 * A mutation, not a query: it is an action (one model call) that must not be prefetched, cached or
 * refired on focus, and its result is a *draft* the teacher edits - caching it under a topic would
 * make "generate again" return the first answer. Nothing is invalidated, because nothing on the
 * server changed: the candidates exist only in the dialog until it is saved.
 *
 * The envelope is handed back untouched, like every other hook here, so the caller unwraps `.data`
 * itself - the one shape a reader who knows this feature tree already knows.
 */
export function useGenerateQuestionsMutation() {
  return useMutation({
    mutationFn: (payload: HomeworkAiGeneratePayload) => homeworkApi.generateQuestions(payload),
  });
}

/** POST /api/homework - publish a new homework. */
export function usePublishHomeworkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: HomeworkPublishPayload) => homeworkApi.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.all });
    },
  });
}

/** PUT /api/homework/:id - edit an existing homework. */
export function useUpdateHomeworkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: HomeworkUpdatePayload }) =>
      homeworkApi.update(id, payload),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.all });
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.detail(variables.id) });
    },
  });
}

/** DELETE /api/homework/:id. */
export function useDeleteHomeworkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => homeworkApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.all });
    },
  });
}

/**
 * POST /api/homework/:id/attempt - start or resume the student's own attempt.
 *
 * `startAttempt` is awaited by the page on mount, so the mutation is called directly rather
 * than through `useQuery`: it creates a `draft` row the first time, and a GET-shaped cache
 * entry for a write is a worse lie than a local `useState`.
 */
export function useStartAttemptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (homeworkId: number) => homeworkApi.startAttempt(homeworkId),
    onSuccess: async (_data, homeworkId) => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.mine() });
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.detail(homeworkId) });
    },
  });
}

/** PUT /api/homework/submissions/:id/answers - the student's auto-save. */
export function useSaveAnswersMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, payload }: { submissionId: number; payload: HomeworkSaveAnswersPayload }) =>
      homeworkApi.saveAnswers(submissionId, payload),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.submission(variables.submissionId) });
    },
  });
}

/** POST /api/homework/submissions/:id/submit. */
export function useSubmitAttemptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, payload }: { submissionId: number; payload: HomeworkSubmitPayload }) =>
      homeworkApi.submitAttempt(submissionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.all });
    },
  });
}

/** POST /api/homework/submissions/:id/photos - multipart, one photo. */
export function useUploadPhotoMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, formData }: { submissionId: number; formData: FormData }) =>
      homeworkApi.uploadPhoto(submissionId, formData),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.submission(variables.submissionId) });
    },
  });
}

/** PUT /api/homework/submissions/:id - the teacher's grading write. */
export function useGradeSubmissionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, payload }: { submissionId: number; payload: HomeworkGradePayload }) =>
      homeworkApi.gradeSubmission(submissionId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.all });
    },
  });
}

/**
 * POST /api/homework/:id/ai-grade - the AI assist.
 *
 * The response body, not the absence of a thrown error, is what says whether the AI half ran:
 * `data.ai.available === false` is a successful request whose model half declined. Callers must
 * read `ai.message` in that case rather than treating the mutation as a grade.
 */
export function useAiGradeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ homeworkId, payload }: { homeworkId: number; payload: HomeworkAiGradePayload }) =>
      homeworkApi.aiGrade(homeworkId, payload),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.submissions(variables.homeworkId) });
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.all });
    },
  });
}

/** POST /api/homework/:id/qa - ask the assistant. */
export function useAskQaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ homeworkId, payload }: { homeworkId: number; payload: HomeworkQaAskPayload }) =>
      homeworkApi.askQa(homeworkId, payload),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: homeworkKeys.qa(variables.homeworkId) });
    },
  });
}
