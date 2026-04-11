import { randomUUID } from 'crypto';

import { prisma } from '../prismaClient.js';
import { ApiError } from '../utils/asyncHandler.js';
import { activateUser } from './activationService.js';
import { createPaymentProvider, type PaymentEnvironment, type PaymentMethod } from './paymentProviders/index.js';

async function getSettingValue(key: string, fallback: string) {
  const item = await prisma.settings.findUnique({ where: { key } });
  return item?.value ?? fallback;
}

export async function createPaymentOrder(options: {
  userId: number;
  method: PaymentMethod;
  notifyUrl: string;
}) {
  const price = Number(await getSettingValue('payment_price', '99.00'));
  const currency = await getSettingValue('payment_currency', 'CNY');
  const description = await getSettingValue('payment_description', 'Think-Class 平台激活');
  const paymentEnvironment = await getSettingValue('payment_environment', 'mock');
  const enableWechat = await getSettingValue('payment_enable_wechat', '1');
  const enableAlipay = await getSettingValue('payment_enable_alipay', '1');

  if (options.method === 'wechat' && enableWechat !== '1') {
    throw new ApiError(400, '微信支付当前未启用');
  }
  if (options.method === 'alipay' && enableAlipay !== '1') {
    throw new ApiError(400, '支付宝当前未启用');
  }

  const orderNo = `ORD-${randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase()}`;
  const provider = createPaymentProvider(options.method, paymentEnvironment as PaymentEnvironment);
  const providerOrder = await provider.createOrder({
    orderNo,
    amount: price,
    description,
    method: options.method,
    notifyUrl: options.notifyUrl,
  });

  const order = await prisma.payment_orders.create({
    data: {
      order_no: orderNo,
      user_id: options.userId,
      source: 'direct_payment',
      payment_method: options.method,
      amount: price,
      currency,
      status: paymentEnvironment === 'mock' ? 'AWAITING_PAYMENT' : 'PENDING',
      description,
      channel_order_id: providerOrder.channelOrderId,
      qr_code_url: providerOrder.qrCodeUrl,
      payment_url: providerOrder.paymentUrl,
      channel_payload: JSON.stringify(providerOrder.payload),
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  await prisma.payment_transactions.create({
    data: {
      order_id: order.id,
      transaction_type: 'CREATE',
      status: order.status,
      provider: options.method,
      provider_trade_no: providerOrder.channelOrderId,
      payload: JSON.stringify(providerOrder.payload),
    },
  });

  return order;
}

export async function getOrderForUser(orderNo: string, userId: number) {
  let order = await prisma.payment_orders.findUnique({
    where: { order_no: orderNo },
  });

  if (!order) {
    throw new ApiError(404, '订单不存在');
  }

  if (order.user_id !== userId) {
    throw new ApiError(403, '无权限查看该订单');
  }

  if (order.status !== 'PAID' && order.expires_at && order.expires_at.getTime() < Date.now()) {
    order = await prisma.payment_orders.update({
      where: { id: order.id },
      data: { status: 'EXPIRED' },
    });
  }

  return order;
}

export async function markOrderPaid(options: {
  orderNo: string;
  provider: PaymentMethod;
  providerTradeNo?: string | null;
  payload: Record<string, unknown>;
  signature?: string | null;
}) {
  const order = await prisma.payment_orders.findUnique({
    where: { order_no: options.orderNo },
  });

  if (!order) {
    throw new ApiError(404, '订单不存在');
  }

  if (order.status === 'PAID') {
    return order;
  }

  await prisma.payment_transactions.create({
    data: {
      order_id: order.id,
      transaction_type: 'WEBHOOK',
      status: 'PAID',
      provider: options.provider,
      provider_trade_no: options.providerTradeNo ?? null,
      signature: options.signature ?? null,
      payload: JSON.stringify(options.payload),
    },
  });

  await activateUser({
    userId: order.user_id,
    source: 'payment',
    orderId: order.id,
    remark: `通过${options.provider}支付完成开通`,
  });

  return prisma.payment_orders.findUnique({
    where: { id: order.id },
  });
}
