/**
 * Payment plugin - the last piece of `api/modules/platform`, and the last non-domain module.
 *
 * `tier: "infrastructure"`, added to the SDK for this plugin: it is not a domain anyone can switch
 * off (it owns live orders) and it is not kernel material either (`payment_environment`,
 * `payment_orders` and the WeChat/Alipay providers are business vocabulary that guardrail G5 keeps
 * out of `packages/kernel`). See the tier's definition in `packages/contracts/src/plugin.ts`.
 *
 * `dependsOn: identity` is hard, because the activation write is the whole point of a successful
 * payment - but it is also resolved lazily at call time (`() => ctx.tryUse('identity.public')`)
 * so that a composition without identity answers 503 on the webhook instead of failing to boot.
 * The difference from an optional port: a missing identity means a webhook *cannot* complete, so
 * `applyWebhook` throws rather than skipping the step.
 *
 * No `activationService.ts` any more: that file's body is `identity.public.activateUser`, and the
 * cross-domain ordering it used to hide is now explicit in `payment.service.ts`.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { PaymentController } from './payment.controllers.js';
import { createPaymentRepository } from './payment.repository.js';
import { PaymentService } from './payment.service.js';

const providers: Provider[] = [];

let service: PaymentService | null = null;

export default definePlugin({
  controllers: [PaymentController],
  providers,

  async setup(ctx: KernelContext) {
    const instance = new PaymentService({
      ctx,
      repository: createPaymentRepository(ctx.db),
      // Lazy, not captured: identity is a hard dependency in the manifest, but resolving it here
      // would freeze whatever the registry held during setup - the trap P4.3b.6a documented.
      identity: () => ctx.tryUse('identity.public'),
    });

    service = instance;
    providers.push({ provide: PaymentService, useValue: instance });

    ctx.log.info('payment service ready', {
      owns: ctx.plugin.slug,
      environment: ctx.settings.getPlatform<string>('payment_environment') ?? 'mock',
    });
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
