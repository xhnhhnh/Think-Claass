import { QueryClient } from '@tanstack/react-query';

/**
 * The query client, and the one global mutation rule.
 *
 * ## Why every mutation refreshes the point balance
 *
 * The student shell's 可用积分 comes from `['motivation-summary', studentId]`
 * (`StudentLayout`, `StudentOverviewPage`), and the global `staleTime` is five minutes. Nearly every
 * student action can move that number - answering a challenge, opening a dungeon chest, buying in
 * the shop, bidding in an auction, drawing a card, redeeming a ticket, peer review, the bank's
 * interest - and each of those mutations invalidated its own keys and only its own keys. So the
 * balance sat stale for up to five minutes after the very actions that change it, which reads as
 * "the game did not give me my points".
 *
 * The fix is one rule instead of a dozen: a settled mutation marks the balance stale. It costs at
 * most one extra GET per write (and none at all for pages that never read it), it cannot drift out
 * of step with a new mutation the way a per-hook list would, and it is deliberately *not* scoped to
 * the student role - an admin console write finding no such query is a no-op.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
    mutations: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['motivation-summary'] });
      },
    },
  },
});
