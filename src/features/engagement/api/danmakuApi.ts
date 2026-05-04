import { apiDelete, apiGet, apiPost } from '@/lib/api';
import type { DanmakuMessageDto, SendDanmakuPayload } from '@/shared/engagement/contracts';

export const danmakuApi = {
  getMessages: (classId: number, since?: number) =>
    apiGet<{ success: true; messages: DanmakuMessageDto[] }>(
      `/api/danmaku?classId=${classId}${since ? `&since=${since}` : ''}`,
    ),

  sendMessage: (payload: SendDanmakuPayload) =>
    apiPost<{ success: true; message: DanmakuMessageDto }>('/api/danmaku', payload),

  cleanup: () => apiDelete<{ success: true }>('/api/danmaku/cleanup'),
};
