/**
 * Payment repository - the SQL for `payment_orders` and `payment_transactions`.
 *
 * Relocated from the Prisma calls in `api/services/paymentService.ts`. The domain rewrites them
 * onto `ctx.db` rather than keeping Prisma, for two reasons that are not stylistic:
 *
 *  1. **Ownership.** `ctx.db` is the ownership-checked handle, and these two tables are declared
 *     in `data.adopted`, so a statement naming an undeclared table fails in development. Prisma
 *     bypasses that check entirely.
 *  2. **One connection.** `.env` points Prisma at `DATABASE_URL` while the application uses
 *     `DATABASE_FILE` - two independent settings that happen to agree today (HANDOFF section 9,
 *     P4.3b.5c finding #1). A plugin reading orders through one connection and writing users
 *     through another would inherit that split the moment either setting changes.
 *
 * Field mapping notes, all measured against the Prisma schema rather than guessed:
 *
 *  - `expires_at` is a `DATETIME`. Prisma returned a `Date`, and the pre-migration status route
 *    compared it with `order.expires_at.getTime() < Date.now()`. Here the row is read as the
 *    stored value and compared in SQL, which keeps the comparison on the column instead of
 *    round-tripping a JS `Date` through it.
 *  - `channel_payload` is a JSON string and stays one: `readOrderRuntime` parses it and falls
 *    back to `mock`/`mock` on malformed input, exactly as before.
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';

export interface PaymentOrderRow {
  id: number;
  order_no: string;
  user_id: number;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  channel_order_id: string | null;
  qr_code_url: string | null;
  payment_url: string | null;
  channel_payload: string | null;
  expires_at: string | null;
  activated_at?: string | null;
}

export interface NewOrderInput {
  orderNo: string;
  userId: number;
  method: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  channelOrderId: string;
  qrCodeUrl: string;
  paymentUrl: string;
  channelPayload: string;
  expiresAt: string;
}

export interface PaymentRepository {
  insertOrder(input: NewOrderInput): number;
  insertTransaction(input: {
    orderId: number;
    type: string;
    status: string;
    provider: string;
    providerTradeNo: string | null;
    signature?: string | null;
    payload: string;
  }): void;
  findOrderByNo(orderNo: string): PaymentOrderRow | undefined;
  findOrderById(id: SqlParam): PaymentOrderRow | undefined;
  expire(orderId: SqlParam): void;
  markPaid(orderId: SqlParam, activatedAt: string): void;
}

export function createPaymentRepository(db: DbApi): PaymentRepository {
  return {
    insertOrder(input) {
      const info = db.run(
        `INSERT INTO payment_orders
           (order_no, user_id, source, payment_method, amount, currency, status, description,
            channel_order_id, qr_code_url, payment_url, channel_payload, expires_at)
         VALUES (?, ?, 'direct_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.orderNo,
          input.userId,
          input.method,
          input.amount,
          input.currency,
          input.status,
          input.description,
          input.channelOrderId,
          input.qrCodeUrl,
          input.paymentUrl,
          input.channelPayload,
          input.expiresAt,
        ],
      );
      return Number(info.lastInsertRowid);
    },

    insertTransaction(input) {
      db.run(
        `INSERT INTO payment_transactions
           (order_id, transaction_type, status, provider, provider_trade_no, signature, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.orderId,
          input.type,
          input.status,
          input.provider,
          input.providerTradeNo as never,
          (input.signature ?? null) as never,
          input.payload,
        ],
      );
    },

    findOrderByNo(orderNo) {
      return db.get<PaymentOrderRow>(`SELECT * FROM payment_orders WHERE order_no = ?`, [orderNo]);
    },

    findOrderById(id) {
      return db.get<PaymentOrderRow>(`SELECT * FROM payment_orders WHERE id = ?`, [id]);
    },

    /**
     * Close an order whose payment window has passed.
     *
     * The caller decides *whether* it has passed, not this method: `expires_at` is a `DATETIME`
     * column that two writers fill in two different formats - this plugin writes ISO-8601
     * (`...T...Z`), while rows seeded by raw SQL carry SQLite's `YYYY-MM-DD HH:MM:SS` - and SQLite
     * compares those lexicographically, so `'2026-01-02 03:04:05' < '2026-01-02T03:04:05.678Z'` is
     * **false** for the same instant. A `WHERE expires_at < ?` guard would therefore silently never
     * expire a seeded order. Parsing both formats is the only comparison that holds for both.
     */
    expire(orderId) {
      db.run(`UPDATE payment_orders SET status = 'EXPIRED' WHERE id = ?`, [orderId]);
    },

    markPaid(orderId, activatedAt) {
      db.run(`UPDATE payment_orders SET status = 'PAID', activated_at = ? WHERE id = ?`, [activatedAt, orderId]);
    },
  };
}
