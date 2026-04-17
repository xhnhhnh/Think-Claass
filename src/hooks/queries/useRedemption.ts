import { useMutation } from '@tanstack/react-query';

import { redemptionApi } from '@/api/redemption';

export function useRedemptionVerifyMutation() {
  return useMutation({
    mutationFn: redemptionApi.verify,
  });
}
