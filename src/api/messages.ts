import { apiGet, apiPost } from '@/lib/api';

export const messagesApi = {
  getMessages: (classId: number, type: string) =>
    apiGet<{ success: true; messages: any[] }>(`/api/messages?classId=${classId}&type=${type}`),

  sendMessage: (payload: {
    class_id: number;
    sender_id: number;
    content: string;
    is_anonymous: boolean;
    type: string;
    sender_role: string;
  }) => apiPost<{ success: true }>('/api/messages', payload),
};
