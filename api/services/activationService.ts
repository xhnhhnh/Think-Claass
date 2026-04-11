import { prisma } from '../prismaClient.js';

export async function activateUser(options: {
  userId: number;
  source: 'activation_code' | 'payment';
  activationCode?: string | null;
  orderId?: number | null;
  remark?: string | null;
}) {
  const existing = await prisma.activation_events.findFirst({
    where: {
      user_id: options.userId,
      source: options.source,
      activation_code: options.activationCode ?? null,
      order_id: options.orderId ?? null,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { id: options.userId },
      data: {
        is_activated: 1,
      },
    });

    const event = await tx.activation_events.create({
      data: {
        user_id: options.userId,
        source: options.source,
        activation_code: options.activationCode ?? null,
        order_id: options.orderId ?? null,
        remark: options.remark ?? null,
      },
    });

    if (options.orderId) {
      await tx.payment_orders.update({
        where: { id: options.orderId },
        data: {
          status: 'PAID',
          activated_at: new Date(),
        },
      });
    }

    return event;
  });
}
