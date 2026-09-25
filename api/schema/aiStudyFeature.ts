/**
 * The `classes.enable_ai_study` column, as its own migration.
 *
 * ## Why a new migration rather than an edit to one already applied
 *
 * A migration's checksum *is* its content - the boot schema's is its SQL text, the compatibility
 * columns migration's is `up.toString()` - so `runMigrations` refuses to start against a database
 * that already applied either of them if the text changes. Its header says it in as many words:
 * "**this function must never be edited after it has been applied anywhere.** New columns belong in a
 * new migration." This is that new migration, and it is why the schema comment is still accurate
 * rather than an aspiration.
 *
 * ## Why the class needs a column at all
 *
 * `classroom.features.ts` resolves a class-scope flag in two steps: an explicit capability assignment
 * first, then the legacy `classes.enable_*` column. With neither, the answer is `false` - so a
 * manifest permission with no column behind it is not "on by default", it is a flag that can never be
 * turned on: `setClassFeatures` validates the keys it writes against the class row and silently drops
 * anything the row does not carry.
 *
 * That is the failure this migration prevents. `plugins/classroom` declares `classroom.enable_ai_study`
 * so `plugins/ai-study` has a switch a teacher can use; without the column, every request would answer
 * 403 该功能当前已关闭 and no screen could change it.
 *
 * ## Why the default is 0, matching the other nineteen
 *
 * Every feature flag starts off for a class - that is the product's stance, recorded by the one-shot
 * `class_features_default_off_migration_v1` backfill in `api/db.ts`. A twenty-first flag that started
 * on would be the only one that did, and a teacher who never opens 功能控制台 would find a page in the
 * student area that nobody chose to enable. Consistency here is not politeness: the flag is read by
 * the same resolver as the other nineteen, so a different default would read as a bug in that resolver.
 */

import type { Database, Migration } from '@thinkclass/kernel';

export const AI_STUDY_FEATURE_MIGRATION_ID = '0000h_ai_study_feature_column';

export const aiStudyFeatureColumnMigration: Migration = {
  id: AI_STUDY_FEATURE_MIGRATION_ID,
  owner: 'app',
  /**
   * A function, because SQLite has no `ADD COLUMN IF NOT EXISTS`: a plain SQL migration would fail
   * with "duplicate column name" on every database created after this list existed. The column name
   * and definition are literals *inside* `up` so that `up.toString()` - the checksum - changes if
   * either does.
   */
  up: (db: Database) => {
    const table = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get('classes');
    if (!table) {
      // Every open question about a missing table is worse than a hard failure: continuing would
      // create the very silently-disabled feature this migration exists to prevent.
      throw new Error('cannot add classes.enable_ai_study: table "classes" does not exist');
    }

    const columns = (db.pragma('table_info(classes)') as Array<{ name: string }>).map((column) => column.name);
    if (columns.includes('enable_ai_study')) return;

    db.exec('ALTER TABLE classes ADD COLUMN enable_ai_study INTEGER DEFAULT 0');
  },
  // No `down`: SQLite cannot drop a column in place, and rebuilding `classes` to undo one integer is
  // a worse risk than leaving it. The rollback path is "restore the database" - the same ruling
  // `legacyCompatColumnsMigration` records.
};
