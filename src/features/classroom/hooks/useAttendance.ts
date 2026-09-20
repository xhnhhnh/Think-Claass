import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  attendanceApi,
  type AttendanceListQuery,
  type AttendanceRow,
  type SaveAttendancePayload,
} from '../api/attendanceApi';

export const attendanceQueryKeys = {
  all: ['attendance'] as const,
  list: (query: AttendanceListQuery = {}) =>
    ['attendance', 'list', query.classId ?? null, query.studentId ?? null, query.date ?? null] as const,
};

/**
 * Attendance rows for the actor's scope, narrowed by `classId` / `date` / `studentId`.
 *
 * `enabled` exists because a page that has not resolved its class or day yet must not fire a
 * request that would come back as the whole class history.
 */
export function useAttendance(query: AttendanceListQuery = {}, enabled = true) {
  return useQuery({
    queryKey: attendanceQueryKeys.list(query),
    queryFn: async (): Promise<AttendanceRow[]> => (await attendanceApi.list(query)).data,
    enabled,
  });
}

/** Saves one class-day; every attendance list is stale afterwards. */
export function useSaveAttendanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveAttendancePayload) => attendanceApi.save(payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.all }),
  });
}
