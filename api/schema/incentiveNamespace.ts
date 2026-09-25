import type { Migration } from '@thinkclass/kernel';

export const incentiveNamespaceMigration: Migration = {
  id: '0000g_incentive_namespace',
  owner: 'classroom',
  up: `
    ALTER TABLE class_incentive_policies RENAME TO p_classroom_incentive_policies;
    ALTER TABLE point_events RENAME TO p_classroom_point_events;
  `,
};
