import { apiGet, apiPost } from '@/lib/api';
import type { RedemptionTicketDto } from '@/shared/engagement/contracts';

export const redemptionApi = {
  verify: (payload: { code: string; teacherId?: number }) =>
    apiPost<{ success: true; ticket: RedemptionTicketDto }>('/api/redemption/verify', payload),
  getMyTickets: (studentId: number) => apiGet<{ success: true; tickets: RedemptionTicketDto[] }>(`/api/redemption/my?studentId=${studentId}`),
};
