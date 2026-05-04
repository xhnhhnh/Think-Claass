import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { studentsApi } from '../api/studentsApi';
import type { StudentDto } from '@/shared/classroom/contracts';

export type Student = StudentDto;

export const classroomQueryKeys = {
  students: (classId: number | string | null) => ['students', classId] as const,
  student: (studentId: number | null) => ['student', studentId] as const,
  records: (params: { studentId?: number; teacherId?: number }) => ['student-records', params] as const,
  achievements: (studentId: number | null) => ['student-achievements', studentId] as const,
  pendingPeerReviews: (studentId: number | null) => ['pending-peer-reviews', studentId] as const,
};

export function useStudents(classId: number | null) {
  return useQuery({
    queryKey: classroomQueryKeys.students(classId),
    queryFn: async () => {
      if (!classId) return [];
      const data = await studentsApi.getStudents(classId);
      return data.students;
    },
    enabled: !!classId,
  });
}

export function useAllStudents(enabled = true) {
  return useQuery({
    queryKey: classroomQueryKeys.students(null),
    queryFn: async () => {
      const data = await studentsApi.getStudents();
      return data.students;
    },
    enabled,
  });
}

export function useStudentById(studentId: number | null) {
  return useQuery({
    queryKey: classroomQueryKeys.student(studentId),
    queryFn: async () => {
      if (!studentId) return null;
      const data = await studentsApi.getStudentById(studentId);
      return data.student;
    },
    enabled: !!studentId,
  });
}

export function useStudentAchievements(studentId: number | null) {
  return useQuery({
    queryKey: classroomQueryKeys.achievements(studentId),
    queryFn: async () => {
      if (!studentId) return [];
      const data = await studentsApi.getAchievements(studentId);
      return data.achievements;
    },
    enabled: !!studentId,
  });
}

export function usePendingPeerReviews(studentId: number | null) {
  return useQuery({
    queryKey: classroomQueryKeys.pendingPeerReviews(studentId),
    queryFn: async () => {
      if (!studentId) return [];
      const data = await studentsApi.getPendingPeerReviews(studentId);
      return data.pending;
    },
    enabled: !!studentId,
  });
}

export function useStudentMutations(classId: number | null) {
  const queryClient = useQueryClient();

  const addPointsMutation = useMutation({
    mutationFn: ({ studentId, amount, reason }: { studentId: number; amount: number; reason: string }) =>
      studentsApi.updatePoints(studentId, { amount, reason }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: classroomQueryKeys.students(classId) });
      toast.success(`已为该学生${variables.amount > 0 ? '加' : '扣'} ${Math.abs(variables.amount)} 分`);
    },
  });

  const addBatchPointsMutation = useMutation({
    mutationFn: ({ studentIds, amount, reason }: { studentIds: number[]; amount: number; reason: string }) =>
      studentsApi.batchPoints({ studentIds, amount, reason }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: classroomQueryKeys.students(classId) });
      toast.success(`已为选中学生${variables.amount > 0 ? '加' : '扣'} ${Math.abs(variables.amount)} 分`);
    },
  });

  const changeGroupMutation = useMutation({
    mutationFn: ({ studentId, groupId }: { studentId: number; groupId: string }) =>
      studentsApi.updateGroup(studentId, groupId === 'ungrouped' ? null : parseInt(groupId, 10)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classroomQueryKeys.students(classId) });
      toast.success('分组修改成功');
    },
  });

  const changeClassMutation = useMutation({
    mutationFn: ({ studentId, newClassId }: { studentId: number; newClassId: number }) => studentsApi.updateClass(studentId, newClassId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classroomQueryKeys.students(classId) });
      toast.success('班级修改成功');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ studentId, newPassword }: { studentId: number; newPassword: string }) => studentsApi.resetPassword(studentId, newPassword),
    onSuccess: () => toast.success('密码重置成功'),
  });

  return { addPointsMutation, addBatchPointsMutation, changeGroupMutation, changeClassMutation, resetPasswordMutation };
}
