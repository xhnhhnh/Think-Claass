import type { Migration } from '@thinkclass/kernel';

/** Event response fields introduced after the initial incentive policy migration. */
export const incentiveEventReceiptMigration: Migration = {
  id: '0000f_incentive_event_receipt',
  owner: 'classroom',
  up: `
    ALTER TABLE point_events ADD COLUMN requested_delta INTEGER;
    ALTER TABLE point_events ADD COLUMN growth_balance INTEGER;
    ALTER TABLE point_events ADD COLUMN credits_balance INTEGER;
  `,
};
