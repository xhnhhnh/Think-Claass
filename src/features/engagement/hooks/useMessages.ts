import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { messagesApi } from '../api/messagesApi';

export const engagementQueryKeys = {
  messages: (classId: number | null, type: string, params?: { role?: string; involvedId?: number }) =>
    ['messages', classId, type, params?.role, params?.involvedId] as const,
  familyTasks: (studentId: number | null) => ['family-tasks', studentId] as const,
  certificates: ['certificates'] as const,
  studentCertificates: (studentId: number | null) => ['certificates', 'student', studentId] as const,
  studentTickets: (studentId: number | null) => ['redemption', 'my', studentId] as const,
};

export function useMessages(classId: number | null, type: string, params?: { role?: string; involvedId?: number }) {
  return useQuery({
    queryKey: engagementQueryKeys.messages(classId, type, params),
    queryFn: async () => {
      if (!classId) return [];
      const data = await messagesApi.getMessages(classId, type, params);
      return data.messages;
    },
    enabled: !!classId,
  });
}

export function useSendMessageMutation(classId: number | null, type: string, params?: { role?: string; involvedId?: number }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: messagesApi.sendMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: engagementQueryKeys.messages(classId, type, params) });
    },
  });
}
