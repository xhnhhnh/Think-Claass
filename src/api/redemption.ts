import { apiPost } from '@/lib/api';

export const redemptionApi = {
  verify: (payload: { code: string; teacherId?: number }) =>
    apiPost<{ success: true; ticket: any }>('/api/redemption/verify', payload),
};
