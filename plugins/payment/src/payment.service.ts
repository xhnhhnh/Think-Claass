/**
 * Payment service - the three routes' behaviour, relocated from
 * `api/modules/platform/platform.service.ts` and `api/services/paymentService.ts`.
 *
 * ## Why this is `tier: "infrastructure"` rather than a feature plugin
 *
 * HANDOFF section 8.9 left the question open for three rounds: kernel side, or a non-feature
 * plugin? The kernel answer is out - `payment_environment`, `payment_orders` and the channel
 * providers are business vocabulary, and guardrail G5 exists precisely to keep them out of
 * `packages/kernel`. The feature answer is also wrong, because a `feature` plugin may be
 * disabled at will and this one must not be: it owns live orders. So the SDK grew a third tier,
 * whose contract is "not a domain, cannot be switched off, other plugins do not depend on its
 * port".
 *
 * The earlier rounds' worry - "moving `api/services/**` into a plugin drags infrastructure into
 * a feature plugin" - was right about the drag and wrong about the conclusion. What it actually
 * needed was a tier that says what this thing is.
 *
 * ## The settings it reads
 *
 * Six keys live in the kernel's `settings` table (`payment_price`, `payment_currency`,
 * `payment_description`, `payment_environment`, `payment_enable_wechat`, `payment_enable_alipay`).
 * The pre-migration code read them through Prisma's `settings` model; here they go through
 * `ctx.settings.getPlatform`, the read-only platform accessor added in P4.3b.7 - the same door
 * identity uses for `allow_teacher_registration`. The key names stay in this plugin, which is
 * what keeps G5 satisfied.
 *
 * ## The activation write, and the ordering that matters
 *
 * The user activation is `identity.public.activateUser` - identity owns `users.is_activated` and
 * `activation_events`. The pre-migration `markOrderPaid` wrote the WEBHOOK transaction and then
 * called the old `activationService`, whose single Prisma transaction also flipped this order to
 * `PAID`; a retry short-circuited on `status === 'PAID'` and returned early.
 *
 * That combination had a hole: if the process died between the event insert and the order update,
 * the retry found the existing event, returned it, and the order stayed unpaid forever. Since the
 * port cannot touch `payment_orders` (it is not identity's table), the ordering is inverted here:
 * **activate first, then mark the order paid in this plugin's own transaction.** A crash in
 * between leaves `status` unpaid, so the retry re-enters, the port dedupes the event, and the order
 * update completes. The two writes are still not atomic - nothing across a plugin boundary is -
 * but the retry now always finishes the job instead of silently giving up.
 */

import { randomUUID } from 'node:crypto';

import { ApiError } from '@thinkclass/kernel';
import type { IdentityPort } from '@thinkclass/contracts/domains/identity';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { PaymentOrderRow, PaymentRepository } from './payment.repository.js';
import {
  createPaymentProvider,
  type PaymentEnvironment,
  type PaymentMethod,
  type PaymentProvider,
} from './providers/index.js';

/** `paymentOrderPayload` from the pre-migration service, unchanged. */
export interface PaymentOrderPayload {
  orderNo: string;
  status: string;
  amount: number;
  currency: string;
  qrCodeUrl: string | null;
  paymentUrl: string | null;
  expiresAt: string | null;
  environment: string;
  providerMode: string;
}

export interface PaymentServiceDeps {
  ctx: KernelContext;
  repository: PaymentRepository;
  /** Resolved at call time: identity sorts first, but a lazy lookup keeps this honest. */
  identity: () => IdentityPort | null;
}

/** Settings reader with the pre-migration defaults, in one place. */
function setting(ctx: KernelContext, key: string, fallback: string): string {
  const value = ctx.settings.getPlatform<string>(key);
  return value === undefined || value === null ? fallback : String(value);
}

/**
 * Parse a `DATETIME` column value written by either of the two writers this schema has.
 *
 * This plugin writes ISO-8601 (`2026-01-02T03:04:05.678Z`) through `new Date().toISOString()`,
 * while rows seeded or written by raw SQL carry SQLite's own format (`2026-01-02 03:04:05`, which
 * JS engines parse as *local* time). Both shapes exist in real databases, so both are handled
 * explicitly: appending `Z` to the space form keeps it UTC, which is what SQLite's
 * `CURRENT_TIMESTAMP` means. Returns `null` for anything unparseable, and the caller treats that
 * as "no expiry" rather than guessing.
 */
function parseStoredDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function readOrderRuntime(channelPayload: string | null) {
  try {
    const payload = channelPayload ? (JSON.parse(channelPayload) as Record<string, unknown>) : {};
    return {
      environment: typeof payload.environment === 'string' ? payload.environment : 'mock',
      providerMode: typeof payload.providerMode === 'string' ? payload.providerMode : 'mock',
    };
  } catch {
    return { environment: 'mock', providerMode: 'mock' };
  }
}

export function paymentOrderPayload(order: PaymentOrderRow): PaymentOrderPayload {
  const runtime = readOrderRuntime(order.channel_payload);
  return {
    orderNo: order.order_no,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    qrCodeUrl: order.qr_code_url,
    paymentUrl: order.payment_url,
    expiresAt: order.expires_at,
    environment: runtime.environment,
    providerMode: runtime.providerMode,
  };
}

export class PaymentService {
  private readonly ctx: KernelContext;
  private readonly repository: PaymentRepository;
  private readonly identity: () => IdentityPort | null;

  constructor(deps: PaymentServiceDeps) {
    this.ctx = deps.ctx;
    this.repository = deps.repository;
    this.identity = deps.identity;
  }

  /** `payment_environment`, defaulting to `mock` exactly as the pre-migration service did. */
  private environment(): PaymentEnvironment {
    return setting(this.ctx, 'payment_environment', 'mock') as PaymentEnvironment;
  }

  /** The provider for a method, built through the same factory the old code used. */
  provider(method: PaymentMethod, environment: PaymentEnvironment = this.environment()): PaymentProvider {
    return createPaymentProvider(method, environment);
  }

  /**
   * Create an order: validate the method, ask the channel for a code, then persist order +
   * CREATE transaction in one local transaction.
   *
   * The channel call happens *before* the transaction, as before: it is a network operation and
   * holding a SQLite write transaction across it would block every other writer.
   */
  async createOrder(input: { userId: number; method: unknown; notifyUrl: string }) {
    const method = input.method;
    if (method !== 'wechat' && method !== 'alipay') throw new ApiError(400, 'Invalid method');

    const enableKey = method === 'wechat' ? 'payment_enable_wechat' : 'payment_enable_alipay';
    if (setting(this.ctx, enableKey, '1') !== '1') {
      throw new ApiError(400, method === 'wechat' ? '微信支付当前未启用' : '支付宝当前未启用');
    }

    const amount = Number(setting(this.ctx, 'payment_price', '99.00'));
    const currency = setting(this.ctx, 'payment_currency', 'CNY');
    const description = setting(this.ctx, 'payment_description', 'Think-Class 平台激活');
    const environment = this.environment();

    const orderNo = `ORD-${randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase()}`;
    const providerOrder = await this.provider(method, environment).createOrder({
      orderNo,
      amount,
      description,
      method,
      notifyUrl: input.notifyUrl,
    });

    // `mock` awaits payment; anything real starts PENDING. That branch is the pre-migration one.
    const status = environment === 'mock' ? 'AWAITING_PAYMENT' : 'PENDING';
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const payload = JSON.stringify(providerOrder.payload);

    const orderId = this.ctx.db.tx(() => {
      const id = this.repository.insertOrder({
        orderNo,
        userId: input.userId,
        method,
        amount,
        currency,
        status,
        description,
        channelOrderId: providerOrder.channelOrderId,
        qrCodeUrl: providerOrder.qrCodeUrl,
        paymentUrl: providerOrder.paymentUrl,
        channelPayload: payload,
        expiresAt,
      });

      this.repository.insertTransaction({
        orderId: id,
        type: 'CREATE',
        status,
        provider: method,
        providerTradeNo: providerOrder.channelOrderId,
        payload,
      });

      return id;
    });

    return this.repository.findOrderById(orderId) as PaymentOrderRow;
  }

  /** An order, if it belongs to the caller; expired windows are closed on read. */
  getOrderForUser(orderNo: string, userId: number): PaymentOrderRow {
    const order = this.repository.findOrderByNo(orderNo);
    if (!order) throw new ApiError(404, '订单不存在');
    if (order.user_id !== userId) throw new ApiError(403, '无权限查看该订单');

    if (order.status !== 'PAID') {
      const expiresAt = parseStoredDate(order.expires_at);
      if (expiresAt !== null && expiresAt < Date.now()) {
        this.repository.expire(order.id);
        return this.repository.findOrderByNo(orderNo) as PaymentOrderRow;
      }
    }

    return order;
  }

  /**
   * Mark an order paid and open the user up.
   *
   * `trade_status` arrives from the channel; only the two success spellings continue. The
   * signature check is the provider's job and happens in the controller, before this is called.
   *
   * Write order is the point (see the file header): identity first, then this plugin's own two
   * writes in one transaction. A retry after a crash in between is safe because the port dedupes
   * on `(userId, source, activationCode, orderId)`.
   */
  async applyWebhook(input: {
    orderNo: string;
    method: PaymentMethod;
    tradeStatus: unknown;
    providerTradeNo: string | null;
    signature: string | null;
    payload: Record<string, unknown>;
  }) {
    const isPaid = input.tradeStatus === 'SUCCESS' || input.tradeStatus === 'TRADE_SUCCESS';
    if (!isPaid) return;

    const order = this.repository.findOrderByNo(input.orderNo);
    if (!order) throw new ApiError(404, '订单不存在');

    // Already settled: a duplicate webhook is a no-op rather than a second event.
    if (order.status === 'PAID') return order;

    const identity = this.identity();
    if (!identity) {
      throw new ApiError(503, '身份服务不可用，无法完成开通', { code: 'IDENTITY_UNAVAILABLE' });
    }

    const activation = await identity.activateUser({
      userId: order.user_id,
      source: 'payment',
      orderId: order.id,
      remark: `通过${input.method}支付完成开通`,
    });
    if (activation.refusal) {
      throw new ApiError(409, activation.refusal.message);
    }

    this.ctx.db.tx(() => {
      this.repository.insertTransaction({
        orderId: order.id,
        type: 'WEBHOOK',
        status: 'PAID',
        provider: input.method,
        providerTradeNo: input.providerTradeNo,
        signature: input.signature,
        payload: JSON.stringify(input.payload),
      });
      this.repository.markPaid(order.id, new Date().toISOString());
    });

    return this.repository.findOrderById(order.id) as PaymentOrderRow;
  }
}
