import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignmentsApi, type AssignmentPayload, type StudentAssignmentUpdatePayload } from '../api/assignmentsApi';

export const assignmentKeys = {
  list: (classId?: number | null) => ['assignments', classId ?? null] as const,
  student: (studentId?: number | null) => ['student-assignments', studentId ?? null] as const,
};

export function useAssignments(classId?: number | null) {
  return useQuery({
    queryKey: assignmentKeys.list(classId),
    queryFn: async () => (await assignmentsApi.list(classId ?? undefined)).data,
  });
}

export function useStudentAssignments(studentId?: number | null) {
  return useQuery({
    queryKey: assignmentKeys.student(studentId),
    queryFn: async () => (await assignmentsApi.listStudentAssignments({ studentId: studentId ?? undefined })).data,
    enabled: !!studentId,
  });
}

export function useCreateAssignmentMutation(classId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AssignmentPayload) => assignmentsApi.create(payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: assignmentKeys.list(classId) }),
  });
}

export function useDeleteAssignmentMutation(classId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assignmentsApi.delete(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: assignmentKeys.list(classId) }),
  });
}

export function useUpdateStudentAssignmentMutation(studentId?: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: StudentAssignmentUpdatePayload }) => assignmentsApi.updateStudentAssignment(id, payload),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: assignmentKeys.student(studentId) }),
  });
}
