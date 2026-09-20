import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  leavesApi,
  type LeaveDto,
  type LeaveListQuery,
  type NewLeaveInput,
  type UpdateLeavePayload,
} from '../api/leavesApi';

export const leaveQueryKeys = {
  all: ['leaves'] as const,
  list: (query: LeaveListQuery = {}) => ['leaves', 'list', query.studentId ?? null, query.status ?? null] as const,
};

/**
 * Leave requests the actor may read, narrowed by `studentId` / `status`.
 *
 * `enabled` lets a parent page wait until the bound child is known instead of fetching the
 * scope before it can render anything.
 */
export function useLeaves(query: LeaveListQuery = {}, enabled = true) {
  return useQuery({
    queryKey: leaveQueryKeys.list(query),
    queryFn: async (): Promise<LeaveDto[]> => (await leavesApi.list(query)).data,
    enabled,
  });
}

/** Files a leave request for the given child; the server refuses any other student. */
export function useCreateLeaveMutation(studentId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewLeaveInput) => {
      if (!studentId) throw new Error('学生信息不存在');
      return leavesApi.create({ ...input, student_id: studentId });
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: leaveQueryKeys.all }),
  });
}

/** Approves or rejects one request; a teacher-only action on the server. */
export function useUpdateLeaveMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateLeavePayload }) => leavesApi.update(id, payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: leaveQueryKeys.all }),
  });
}
