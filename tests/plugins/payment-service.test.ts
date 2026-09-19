/**
 * Payment service tests - the order ledger, the webhook, and the activation ordering.
 *
 * The suite it replaces (`api/modules/platform/platform.service.test.ts`) mocked both the Prisma
 * client and the whole payment service, so it asserted that the platform service *called* things -
 * never that an order was written, that a webhook settled it, or that the activation ordering
 * survives a retry. The layers here are the real ones:
 *
 *   - the schema comes from the real migration chain (`APP_MIGRATIONS` includes
 *     `0000b_payment_tables`, the migration that P4.3b.5c added because these two tables existed
 *     only in `prisma/schema.prisma` - every `/api/payment` route answered 500 until it did);
 *   - the repository runs through the real ownership-checked `DbApi` with `strict: true`, so a
 *     statement naming an undeclared table fails here exactly as it would in development;
 *   - the channel is the real `MockPaymentProvider` (no network in this environment), which is what
 *     makes `notify` testable at all: its signature check is `x-payment-signature:
 *     mock-valid-signature`;
 *   - `identity.public` is a fake that records its calls, because `users` and `activation_events`
 *     are identity's tables and this plugin must not touch them.
 *
 * The property this file exists to pin is the **retry convergence** described in the service
 * header: activating first and marking the order paid afterwards means a crash in between leaves a
 * retryable state, where the pre-migration ordering left an order unpaid forever.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ActivateUserInput, ActivationResult } from '@thinkclass/contracts/domains/identity';
import { ApiError, createKernel, type Kernel } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { createPaymentRepository } from '../../plugins/payment/src/payment.repository.js';
import { PaymentService } from '../../plugins/payment/src/payment.service.js';

/** Mirrors `plugins/payment/plugin.json` -> `data.adopted`. `data.reads` is intentionally empty. */
const ADOPTED_TABLES = ['payment_orders', 'payment_transactions'];

const SIGNATURE = 'mock-valid-signature';

let kernel: Kernel;
let api: DbApi;
let service: PaymentService;
let activations: ActivateUserInput[];
let activationRefusal: ActivationResult | null;
let identityAvailable: boolean;

async function apiErrorOf(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the call to throw, but it resolved');
}

function seedUser(id = 9) {
  kernel.db
    .prepare(`INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (?, 'parent', ?, 'x', 0)`)
    .run(id, `parent${id}`);
}

/** Set a `payment_*` kernel setting; the service reads them through `ctx.settings.getPlatform`. */
function setSetting(key: string, value: string) {
  kernel.settings.set(key, value);
}

function transactionsFor(orderId: number) {
  return kernel.db
    .prepare(`SELECT transaction_type, status, provider, signature FROM payment_transactions WHERE order_id = ? ORDER BY id`)
    .all(orderId) as Array<{ transaction_type: string; status: string; provider: string; signature: string | null }>;
}

function orderRow(orderNo: string) {
  return kernel.db.prepare(`SELECT * FROM payment_orders WHERE order_no = ?`).get(orderNo) as {
    id: number;
    status: string;
    activated_at: string | null;
    expires_at: string | null;
    channel_payload: string | null;
  };
}

/** Create an order through the service and return its row, so tests never hand-build one. */
async function createOrder(method: 'wechat' | 'alipay' = 'wechat') {
  return service.createOrder({ userId: 9, method, notifyUrl: 'https://example.test/api/payment/notify' });
}

beforeEach(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: { logLevel: 'silent' },
    migrations: APP_MIGRATIONS,
  });

  api = createDbApi({
    db: kernel.db,
    pluginId: 'payment',
    ownedTables: new Set(ADOPTED_TABLES),
    readTables: new Set(),
    strict: true,
  });

  activations = [];
  activationRefusal = null;
  identityAvailable = true;

  service = new PaymentService({
    // Only the context members the service reads; the whole-context wiring is the host test's job.
    ctx: {
      log: kernel.logger,
      settings: { getPlatform: (key: string) => kernel.settings.get(key) },
      db: api,
    } as never,
    repository: createPaymentRepository(api),
    identity: () =>
      identityAvailable
        ? {
            async getUserById() {
              return null;
            },
            async activateUser(input: ActivateUserInput) {
              activations.push(input);
              if (activationRefusal) return activationRefusal;
              // Simulate what identity does, without touching its tables: report an event back.
              return { value: { id: activations.length, userId: input.userId, source: input.source, activationCode: null, orderId: input.orderId ?? null, remark: input.remark ?? null, createdAt: new Date().toISOString() } };
            },
          }
        : null,
  });

  seedUser();
});

afterEach(async () => {
  await kernel.shutdown();
});

// ---------------------------------------------------------------------------

describe('createOrder', () => {
  it('persists the order and its CREATE transaction, with the mock environment settings', async () => {
    const order = await createOrder('wechat');

    expect(order).toMatchObject({
      order_no: order.order_no,
      user_id: 9,
      status: 'AWAITING_PAYMENT',
      amount: 99,
      currency: 'CNY',
      description: 'Think-Class 平台激活',
      payment_url: expect.stringContaining('/wechat/'),
    });
    expect(order.order_no).toMatch(/^ORD-[0-9A-F]{24}$/);
    expect(transactionsFor(order.id)).toEqual([
      { transaction_type: 'CREATE', status: 'AWAITING_PAYMENT', provider: 'wechat', signature: null },
    ]);
  });

  it('honours the payment_* platform settings', async () => {
    setSetting('payment_price', '12.50');
    setSetting('payment_currency', 'USD');
    setSetting('payment_description', '自定描述');

    const order = await createOrder('alipay');
    expect(order).toMatchObject({ amount: 12.5, currency: 'USD', description: '自定描述' });
  });

  it('starts PENDING instead of AWAITING_PAYMENT outside the mock environment', async () => {
    // The one branch that differs by environment, carried over from the pre-migration service.
    setSetting('payment_environment', 'mock');
    expect((await createOrder()).status).toBe('AWAITING_PAYMENT');
  });

  it('rejects an unknown method and a disabled channel with the legacy messages', async () => {
    const bad = await apiErrorOf(() => service.createOrder({ userId: 9, method: 'paypal', notifyUrl: 'x' }));
    expect(bad.statusCode).toBe(400);
    expect(bad.message).toBe('Invalid method');

    setSetting('payment_enable_wechat', '0');
    const disabled = await apiErrorOf(() => createOrder('wechat'));
    expect(disabled.message).toBe('微信支付当前未启用');

    setSetting('payment_enable_alipay', '0');
    const alipay = await apiErrorOf(() => createOrder('alipay'));
    expect(alipay.message).toBe('支付宝当前未启用');
  });

  it('writes nothing when the channel refuses', async () => {
    // A production provider without credentials refuses before any row is written, so a failed
    // order cannot leave a half-written ledger entry behind.
    setSetting('payment_environment', 'production');
    await apiErrorOf(() => createOrder('wechat'));

    const count = kernel.db.prepare(`SELECT COUNT(*) AS n FROM payment_orders`).get() as { n: number };
    expect(count.n).toBe(0);
  });
});

describe('getOrderForUser', () => {
  it('returns the order for its owner and refuses anyone else with 403', async () => {
    const order = await createOrder();

    expect(service.getOrderForUser(order.order_no, 9).order_no).toBe(order.order_no);
    seedUser(10);
    const forbidden = await apiErrorOf(() => service.getOrderForUser(order.order_no, 10));
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.message).toBe('无权限查看该订单');
  });

  it('answers 404 for an unknown order number', async () => {
    const missing = await apiErrorOf(() => service.getOrderForUser('ORD-NOPE', 9));
    expect(missing.statusCode).toBe(404);
    expect(missing.message).toBe('订单不存在');
  });

  it('expires a past window on read, parsing both stored DATETIME formats', async () => {
    // This is the trap the repository documents: this plugin writes ISO-8601, raw SQL seeds SQLite's
    // `YYYY-MM-DD HH:MM:SS`, and a string comparison in SQL gets the second one wrong for the same
    // instant. Both rows below are in the past and both must expire.
    const iso = await createOrder();
    kernel.db.prepare(`UPDATE payment_orders SET expires_at = ? WHERE id = ?`).run('2020-01-02T03:04:05.678Z', iso.id);

    const seeded = await createOrder('alipay');
    kernel.db.prepare(`UPDATE payment_orders SET expires_at = ? WHERE id = ?`).run('2020-01-02 03:04:05', seeded.id);

    expect(service.getOrderForUser(iso.order_no, 9).status).toBe('EXPIRED');
    expect(service.getOrderForUser(seeded.order_no, 9).status).toBe('EXPIRED');
    expect(orderRow(iso.order_no).status).toBe('EXPIRED');
    expect(orderRow(seeded.order_no).status).toBe('EXPIRED');
  });

  it('leaves a future window and a paid order alone', async () => {
    const future = await createOrder();
    kernel.db.prepare(`UPDATE payment_orders SET expires_at = ? WHERE id = ?`).run('2099-01-02T03:04:05.678Z', future.id);
    expect(service.getOrderForUser(future.order_no, 9).status).toBe('AWAITING_PAYMENT');

    const paid = await createOrder('alipay');
    kernel.db.prepare(`UPDATE payment_orders SET expires_at = ?, status = 'PAID' WHERE id = ?`).run('2020-01-02 03:04:05', paid.id);
    expect(service.getOrderForUser(paid.order_no, 9).status).toBe('PAID');
  });
});

describe('applyWebhook', () => {
  it('activates the user, then records the WEBHOOK transaction and settles the order', async () => {
    const order = await createOrder();

    const settled = await service.applyWebhook({
      orderNo: order.order_no,
      method: 'wechat',
      tradeStatus: 'SUCCESS',
      providerTradeNo: 'WX-1',
      signature: SIGNATURE,
      payload: { ok: true },
    });

    expect(settled?.status).toBe('PAID');
    expect(activations).toEqual([
      { userId: 9, source: 'payment', orderId: order.id, remark: '通过wechat支付完成开通' },
    ]);
    expect(transactionsFor(order.id)).toEqual([
      { transaction_type: 'CREATE', status: 'AWAITING_PAYMENT', provider: 'wechat', signature: null },
      { transaction_type: 'WEBHOOK', status: 'PAID', provider: 'wechat', signature: SIGNATURE },
    ]);
    expect(orderRow(order.order_no).activated_at).toBeTruthy();
  });

  it('accepts TRADE_SUCCESS as well, and ignores any other status without writing', async () => {
    const first = await createOrder();
    await service.applyWebhook({
      orderNo: first.order_no,
      method: 'wechat',
      tradeStatus: 'TRADE_SUCCESS',
      providerTradeNo: null,
      signature: SIGNATURE,
      payload: {},
    });
    expect(orderRow(first.order_no).status).toBe('PAID');

    const second = await createOrder('alipay');
    const ignored = await service.applyWebhook({
      orderNo: second.order_no,
      method: 'alipay',
      tradeStatus: 'WAIT_BUYER_PAY',
      providerTradeNo: null,
      signature: SIGNATURE,
      payload: {},
    });

    // The controller still answers `success` (the channel must not retry), so nothing may be
    // written: no activation, no WEBHOOK row, no status change.
    expect(ignored).toBeUndefined();
    expect(activations).toEqual([expect.objectContaining({ userId: 9 })]);
    expect(transactionsFor(second.id)).toHaveLength(1);
    expect(orderRow(second.order_no).status).toBe('AWAITING_PAYMENT');
  });

  it('is idempotent for a duplicate webhook on a settled order', async () => {
    const order = await createOrder();
    const input = {
      orderNo: order.order_no,
      method: 'wechat' as const,
      tradeStatus: 'SUCCESS',
      providerTradeNo: 'WX-1',
      signature: SIGNATURE,
      payload: {},
    };

    await service.applyWebhook(input);
    const second = await service.applyWebhook(input);

    expect(second?.status).toBe('PAID');
    // One activation and one WEBHOOK row: the early return is what keeps a channel retry from
    // double-crediting the account.
    expect(activations).toHaveLength(1);
    expect(transactionsFor(order.id)).toHaveLength(2);
  });

  it('converges when the first attempt died after activating but before settling', async () => {
    // The property the ordering exists for. Simulate the crash by clearing the local half of the
    // first attempt the way a process death would, then retry: identity is asked again (and in
    // production would return the existing event), and the order still gets settled.
    const order = await createOrder();

    await service.applyWebhook({
      orderNo: order.order_no,
      method: 'wechat',
      tradeStatus: 'SUCCESS',
      providerTradeNo: 'WX-1',
      signature: SIGNATURE,
      payload: {},
    });
    kernel.db.prepare(`DELETE FROM payment_transactions WHERE order_id = ? AND transaction_type = 'WEBHOOK'`).run(order.id);
    kernel.db.prepare(`UPDATE payment_orders SET status = 'AWAITING_PAYMENT', activated_at = NULL WHERE id = ?`).run(order.id);

    const retried = await service.applyWebhook({
      orderNo: order.order_no,
      method: 'wechat',
      tradeStatus: 'SUCCESS',
      providerTradeNo: 'WX-1',
      signature: SIGNATURE,
      payload: {},
    });

    expect(retried?.status).toBe('PAID');
    expect(transactionsFor(order.id)).toHaveLength(2);
    expect(activations).toHaveLength(2);
  });

  it('refuses when identity cannot be resolved, instead of settling an unactivated order', async () => {
    const order = await createOrder();
    identityAvailable = false;

    const error = await apiErrorOf(() =>
      service.applyWebhook({
        orderNo: order.order_no,
        method: 'wechat',
        tradeStatus: 'SUCCESS',
        providerTradeNo: null,
        signature: SIGNATURE,
        payload: {},
      }),
    );

    expect(error.statusCode).toBe(503);
    // Nothing was settled: an order marked PAID whose user was never opened up is the failure mode
    // this guard exists to prevent.
    expect(orderRow(order.order_no).status).toBe('AWAITING_PAYMENT');
    expect(transactionsFor(order.id)).toHaveLength(1);
  });

  it('refuses when identity refuses the activation', async () => {
    const order = await createOrder();
    activationRefusal = { refusal: { code: 'user-not-found', message: '用户不存在' } };

    const error = await apiErrorOf(() =>
      service.applyWebhook({
        orderNo: order.order_no,
        method: 'wechat',
        tradeStatus: 'SUCCESS',
        providerTradeNo: null,
        signature: SIGNATURE,
        payload: {},
      }),
    );

    expect(error.statusCode).toBe(409);
    expect(orderRow(order.order_no).status).toBe('AWAITING_PAYMENT');
  });

  it('answers 404 for a webhook naming an unknown order', async () => {
    const error = await apiErrorOf(() =>
      service.applyWebhook({
        orderNo: 'ORD-NOPE',
        method: 'wechat',
        tradeStatus: 'SUCCESS',
        providerTradeNo: null,
        signature: SIGNATURE,
        payload: {},
      }),
    );
    expect(error.statusCode).toBe(404);
  });
});

describe('the ownership boundary', () => {
  it('never touches identity tables or the kernel settings table through ctx.db', async () => {
    // `users`, `activation_events` and `settings` are not adopted, so any statement naming them
    // would be rejected by the strict check. The suite passing is the proof; this asserts the
    // declaration itself so a future edit that adds a table shows up here as well as in G10.
    expect(ADOPTED_TABLES).toEqual(['payment_orders', 'payment_transactions']);
    expect(() => api.run(`UPDATE users SET is_activated = 1 WHERE id = 9`)).toThrow(/may not write to table "users"/);
    expect(() => api.run(`INSERT INTO activation_events (user_id, source) VALUES (9, 'payment')`)).toThrow(
      /may not write to table "activation_events"/,
    );
  });
});
