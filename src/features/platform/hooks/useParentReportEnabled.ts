import { useSettings } from '@/hooks/queries/useSettings';

/**
 * Whether 家长成长报告 is switched on.
 *
 * `enable_parent_report` gates a *setting*, not a page: the same report endpoint
 * (`/api/analytics/students/:id/report`) feeds two parent screens - 成长足迹 (`/parent/report`) and
 * 学习采撷 (`/parent/assignments`) - and only the first one checked it. So an admin who turned the
 * report off still had pupils' assignments and grades readable at the other URL, which is the
 * "switched off everywhere except where you look" shape of a half-applied switch.
 *
 * One hook rather than a second `=== '0'` comparison, because the two pages disagreeing is exactly
 * what happened: the value is a string in the settings contract (`'0'` / `'1'`), and '0' is truthy
 * in JavaScript, so every caller has to remember the comparison.
 *
 * `undefined` means the settings request has not answered yet. Callers should treat that as "not
 * known yet" and keep rendering; the flag's default is on, and flashing a disabled page while the
 * answer is in flight would be a worse lie than showing the page for one frame.
 */
export function useParentReportEnabled(): { known: boolean; enabled: boolean } {
  const { data: settings } = useSettings();
  return {
    known: settings !== undefined,
    enabled: settings?.enable_parent_report !== '0',
  };
}
