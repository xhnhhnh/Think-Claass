import { describe, expect, it, vi } from 'vitest';

import { queryClient } from './queryClient';

/**
 * The one global mutation rule: a settled write marks the student's point balance stale.
 *
 * Before it, the shell's 可用积分 (`['motivation-summary', studentId]`, `staleTime: 5min`) was
 * refreshed by nobody, so a pupil who had just won points saw the old number for minutes - the exact
 * "the game did not pay me" reading the balance exists to avoid.
 */
describe('queryClient mutation defaults', () => {
  it('invalidates the motivation summary on success', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    try {
      const onSuccess = queryClient.getDefaultOptions().mutations?.onSuccess;
      expect(onSuccess, 'the global mutation rule is gone').toBeTruthy();

      await (onSuccess as (data: unknown, variables: unknown, context: unknown) => unknown)(undefined, undefined, undefined);

      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['motivation-summary'] });
    } finally {
      invalidate.mockRestore();
    }
  });
});
