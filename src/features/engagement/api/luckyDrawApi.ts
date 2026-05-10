import { apiGet, apiPost } from '@/lib/api';
import type { LuckyDrawConfigPayload, LuckyDrawPrizeDto } from '@/shared/engagement/contracts';

export const luckyDrawApi = {
  getConfig: (teacherId: number) =>
    apiGet<{ success: true; configs: LuckyDrawPrizeDto[]; cost_points: number }>(`/api/lucky-draw/config?teacherId=${teacherId}`),
  saveConfig: (payload: LuckyDrawConfigPayload) => apiPost<{ success: true }>('/api/lucky-draw/config', payload),
  draw: (studentId: number) =>
    apiPost<{ success: true; prize: { prize_name: string }; message: string }>('/api/lucky-draw/draw', { studentId }),
};
