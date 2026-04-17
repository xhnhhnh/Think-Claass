import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { messagesApi } from '@/api/messages';

export function useMessages(classId: number | null, type: string) {
  return useQuery({
    queryKey: ['messages', classId, type],
    queryFn: async () => {
      if (!classId) return [];
      const data = await messagesApi.getMessages(classId, type);
      return data.messages;
    },
    enabled: !!classId,
  });
}

export function useSendMessageMutation(classId: number | null, type: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: messagesApi.sendMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['messages', classId, type] });
    },
  });
}
