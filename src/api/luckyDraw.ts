import { apiGet, apiPost } from '@/lib/api';

export const luckyDrawApi = {
  getConfig: (teacherId: number) =>
    apiGet<{ success: true; configs: any[]; cost_points: number }>(`/api/lucky-draw/config?teacherId=${teacherId}`),

  saveConfig: (payload: { teacher_id: number; cost_points: number; configs: any[] }) =>
    apiPost<{ success: true }>('/api/lucky-draw/config', payload),

  draw: (studentId: number) =>
    apiPost<{ success: true; prize: { prize_name: string }; message: string }>('/api/lucky-draw/draw', { studentId }),
};
