/**
 * The legacy query indexes, as a migration.
 *
 * `.tmp/schema-gap-probe.mts` measured this gap the same way as the missing column: a real
 * `createKernel()` boot with the application migrations, checked against every
 * `CREATE INDEX` in `api/db.ts`. **19 of the 20 named indexes did not exist in the kernel
 * composition at all** - they were created only by `initDb()`'s "high frequency query"
 * block, which the kernel composition never runs.
 *
 * Most are performance-only. Two are not, and that is why this is a correctness fix rather
 * than tuning:
 *
 *   * `idx_parent_activity_parent_student` is UNIQUE, and `api/modules/auth/auth.service.ts`
 *     writes `INSERT ... ON CONFLICT(parent_id, student_id) DO UPDATE`. SQLite rejects that
 *     statement outright when no matching unique index exists ("ON CONFLICT clause does not
 *     match any PRIMARY KEY or UNIQUE constraint"), so parent login was a 500 on any
 *     database this composition built.
 *   * `idx_classes_invite_code` is UNIQUE too: without it, two classes can share an invite
 *     code and the join flow silently resolves to whichever row SQLite returns first.
 *
 * The twentieth index, `idx_operation_logs_teacher_id`, is deliberately NOT here: the
 * kernel's own `0005_kernel_operation_logs` migration creates it, and both compositions run
 * the kernel migrations. Copying it would give one index two owners.
 *
 * ## Why this is a string migration
 *
 * Every statement is `IF NOT EXISTS`, so the whole thing is idempotent on databases where
 * `initDb()` already created the indexes. That lets it stay a string migration, whose
 * checksum is the SQL text - the stable form. See `legacyCompatColumns.ts` for the case
 * that genuinely needs a function.
 */

import type { Migration } from '@thinkclass/kernel';

export const LEGACY_COMPAT_INDEXES_MIGRATION_ID = '0000d_legacy_compat_indexes';

export const legacyCompatIndexesMigration: Migration = {
  id: LEGACY_COMPAT_INDEXES_MIGRATION_ID,
  owner: 'legacy',
  up: `
    -- Integrity constraints, not just speed: both back an ON CONFLICT target or an
    -- application-level uniqueness assumption.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_activity_parent_student ON parent_activity(parent_id, student_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_invite_code ON classes(invite_code);

    -- Users and classes.
    CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
    CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
    CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);

    -- Gamification.
    CREATE INDEX IF NOT EXISTS idx_pets_student_id ON pets(student_id);
    CREATE INDEX IF NOT EXISTS idx_shop_items_teacher_id ON shop_items(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_redemption_tickets_student_id ON redemption_tickets(student_id);

    -- Teaching and learning.
    CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON assignments(class_id);
    CREATE INDEX IF NOT EXISTS idx_exams_class_id ON exams(class_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_records_class_id ON attendance_records(class_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON attendance_records(student_id);
    CREATE INDEX IF NOT EXISTS idx_messages_class_id ON messages(class_id);
    CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_activation_events_user_id ON activation_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_activation_events_order_id ON activation_events(order_id);

    -- SLG and the rest.
    CREATE INDEX IF NOT EXISTS idx_territories_class_id ON territories(class_id);
    CREATE INDEX IF NOT EXISTS idx_student_pets_student_id ON student_pets(student_id);
    CREATE INDEX IF NOT EXISTS idx_dungeon_runs_student_id ON dungeon_runs(student_id);
  `,
  down: `
    DROP INDEX IF EXISTS idx_parent_activity_parent_student;
    DROP INDEX IF EXISTS idx_classes_invite_code;
    DROP INDEX IF EXISTS idx_students_class_id;
    DROP INDEX IF EXISTS idx_students_user_id;
    DROP INDEX IF EXISTS idx_classes_teacher_id;
    DROP INDEX IF EXISTS idx_pets_student_id;
    DROP INDEX IF EXISTS idx_shop_items_teacher_id;
    DROP INDEX IF EXISTS idx_redemption_tickets_student_id;
    DROP INDEX IF EXISTS idx_assignments_class_id;
    DROP INDEX IF EXISTS idx_exams_class_id;
    DROP INDEX IF EXISTS idx_attendance_records_class_id;
    DROP INDEX IF EXISTS idx_attendance_records_student_id;
    DROP INDEX IF EXISTS idx_messages_class_id;
    DROP INDEX IF EXISTS idx_messages_receiver_id;
    DROP INDEX IF EXISTS idx_activation_events_user_id;
    DROP INDEX IF EXISTS idx_activation_events_order_id;
    DROP INDEX IF EXISTS idx_territories_class_id;
    DROP INDEX IF EXISTS idx_student_pets_student_id;
    DROP INDEX IF EXISTS idx_dungeon_runs_student_id;
  `,
};
