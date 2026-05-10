import { apiGet, apiPost } from '@/lib/api';
import type { MessageDto, SendMessagePayload } from '@/shared/engagement/contracts';

export const messagesApi = {
  getMessages: (classId: number, type: string, params?: { role?: string; involvedId?: number }) => {
    const query = new URLSearchParams({ classId: String(classId), type });
    if (params?.role) query.set('role', params.role);
    if (params?.involvedId) query.set('involvedId', String(params.involvedId));
    return apiGet<{ success: true; messages: MessageDto[] }>(`/api/messages?${query.toString()}`);
  },

  sendMessage: (payload: SendMessagePayload) => apiPost<{ success: true; message?: string }>('/api/messages', payload),
};
