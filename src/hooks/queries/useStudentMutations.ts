import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi } from '@/api/students';
import { teacherApi } from '@/api/teacher';
import { toast } from 'sonner';

export function useStudentMutations(classId: number | null) {
  const queryClient = useQueryClient();

  const addPointsMutation = useMutation({
    mutationFn: async ({ studentId, amount, reason }: { studentId: number; amount: number; reason: string }) => {
      return studentsApi.updatePoints(studentId, { amount, reason });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['students', classId] });
      toast.success(`已为该学生${variables.amount > 0 ? '加' : '扣'} ${Math.abs(variables.amount)} 分`);
    }
  });

  const addBatchPointsMutation = useMutation({
    mutationFn: async ({ studentIds, amount, reason }: { studentIds: number[]; amount: number; reason: string }) => {
      return teacherApi.batchPoints({ studentIds, amount, reason });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['students', classId] });
      toast.success(`已为选中学生${variables.amount > 0 ? '加' : '扣'} ${Math.abs(variables.amount)} 分`);
    }
  });

  const changeGroupMutation = useMutation({
    mutationFn: async ({ studentId, groupId }: { studentId: number; groupId: string }) => {
      return studentsApi.updateGroup(studentId, groupId === 'ungrouped' ? null : parseInt(groupId, 10));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', classId] });
      toast.success('分组修改成功');
    }
  });

  const changeClassMutation = useMutation({
    mutationFn: async ({ studentId, newClassId }: { studentId: number; newClassId: number }) => {
      return studentsApi.updateClass(studentId, newClassId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students', classId] });
      toast.success('班级修改成功');
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ studentId, newPassword }: { studentId: number; newPassword: string }) => {
      return studentsApi.resetPassword(studentId, newPassword);
    },
    onSuccess: () => {
      toast.success('密码重置成功');
    }
  });

  return {
    addPointsMutation,
    addBatchPointsMutation,
    changeGroupMutation,
    changeClassMutation,
    resetPasswordMutation,
  };
}
