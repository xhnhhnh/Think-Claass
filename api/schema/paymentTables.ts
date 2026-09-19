/**
 * The payment tables, as their own migration.
 *
 * `payment_orders` and `payment_transactions` have always been in
 * `prisma/schema.prisma`, and `api/services/paymentService.ts` queries them on every
 * payment route - but they were in NEITHER the boot DDL nor the developer database. The
 * consequence was measured rather than inferred (`.tmp/payment-live-probe.mts`, legacy
 * composition over a throwaway database):
 *
 *   POST /api/payment/create          -> 500  SQLITE_ERROR: no such table: payment_orders
 *   GET  /api/payment/status/:orderNo -> 500  (same)
 *   POST /api/payment/notify          -> 401  'Invalid signature', i.e. it never even
 *                                             reached the missing table
 *
 * So the whole `/api/payment` surface was dead on anything built from the boot schema,
 * and `prisma db push` was the only thing that could ever have created these tables.
 * Every other payment-ish table (`activation_codes`, `activation_events`) was in the boot
 * DDL all along, which is what made the omission easy to miss.
 *
 * ## Why this is a NEW migration and not an edit to `0000_legacy_boot_schema`
 *
 * A string migration checksums its SQL text (`packages/kernel/src/storage/migrations.ts`),
 * and `runMigrations` THROWS when an already-applied migration's checksum changed:
 *
 *   migration "0000_legacy_boot_schema" was modified after it was applied
 *   (recorded <a>, now <b>). Add a new migration instead of editing an applied one.
 *
 * That is not a hypothetical: the first attempt at this change appended the two tables to
 * the boot DDL, which would have refused to start against every database that had already
 * applied it - including the deployed one. The tables are therefore appended here under a
 * new id. `0000b_` is deliberate: it sorts after `0000_legacy_boot_schema` (so `users`
 * exists before the foreign key that references it) and before `0001_kernel_settings`.
 *
 * ## Column fidelity
 *
 * The column lists are Prisma's own output (`prisma migrate diff --from-empty
 * --to-schema-datamodel`), not a hand-copied approximation, so they match what the
 * generated client expects. Two translations are deliberate:
 *
 *   * Prisma emits the uniqueness on `order_no` as `CREATE UNIQUE INDEX
 *     "sqlite_autoindex_payment_orders_1"`. SQLite reserves the `sqlite_autoindex_*`
 *     namespace for implicit constraints, so creating that index by name fails; written
 *     as an inline `UNIQUE` on the column it produces exactly that index.
 *   * `updated_at` defaults to CURRENT_TIMESTAMP but nothing bumps it on UPDATE - there is
 *     no trigger. That matches the Prisma schema and is left as-is rather than half-fixed
 *     here; `paymentService.markOrderPaid` is the writer that would need to set it.
 *
 * The migration is `owner: 'legacy'`, the same owner as the boot schema: this is the
 * application's own substrate, not a plugin's. A plugin owner may only touch tables
 * prefixed `p_<slug>_`, and these tables must keep their names because the Prisma client
 * is bound to them.
 */

import type { Migration } from '@thinkclass/kernel';

export const PAYMENT_TABLES_MIGRATION_ID = '0000b_payment_tables';

export const paymentTablesMigration: Migration = {
  id: PAYMENT_TABLES_MIGRATION_ID,
  owner: 'legacy',
  up: `
    CREATE TABLE IF NOT EXISTS payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      source TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      status TEXT NOT NULL DEFAULT 'PENDING',
      description TEXT,
      channel_order_id TEXT,
      qr_code_url TEXT,
      payment_url TEXT,
      channel_payload TEXT,
      activated_at DATETIME,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
    CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
      transaction_type TEXT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_trade_no TEXT,
      signature TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);
  `,
  down: `
    DROP TABLE IF EXISTS payment_transactions;
    DROP TABLE IF EXISTS payment_orders;
  `,
};
