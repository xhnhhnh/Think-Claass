import { useMutation, useQuery } from '@tanstack/react-query';

import { redemptionApi } from '../api/redemptionApi';
import { engagementQueryKeys } from './useMessages';

export function useRedemptionVerifyMutation() {
  return useMutation({ mutationFn: redemptionApi.verify });
}

export function useMyRedemptionTickets(studentId: number | null) {
  return useQuery({
    queryKey: engagementQueryKeys.studentTickets(studentId),
    queryFn: async () => {
      if (!studentId) return [];
      const data = await redemptionApi.getMyTickets(studentId);
      return data.tickets;
    },
    enabled: !!studentId,
  });
}
