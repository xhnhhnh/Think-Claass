/**
 * WeChat mini program plugin - the identity surface behind `wx.login`.
 *
 * ## What it owns
 *
 * Two tables (`p_wechat_accounts`, `p_wechat_login_tickets`), four routes under `/api/wechat`, and one
 * published method. It owns no `users` row and writes none: binding an openid to an account goes
 * through `identity.public`, which is where the credential check, the parent-login activity row and
 * the login-body composition already live.
 *
 * ## Why the two identity operations are ports rather than HTTP calls
 *
 * A plugin calling another plugin's route would be a far worse coupling than a port - the argument
 * `plugins/identity` records for its own login route. `loginWithCredentials` is used once, by `/bind`;
 * `getLoginPayload` is used by every silent login, because an openid that is already bound must not
 * need a password to obtain a session for the account it is bound to.
 *
 * ## Why the credentials are read per call
 *
 * `WECHAT_APPID` / `WECHAT_SECRET` are read inside the gateway factory, which is passed down as a
 * function and resolved on the first login attempt. A deployment that never uses the mini program
 * therefore boots exactly as before and answers 503 on the two login routes - instead of failing to
 * activate the plugin, which would take every other route with it.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { createWechatCleanupRule } from './wechat.cleanup.js';
import { WechatController } from './wechat.controllers.js';
import { createGatewayFromConfig } from './wechat.gateway.js';
import { createWechatRepository } from './wechat.repository.js';
import { WechatService } from './wechat.service.js';

const providers: Provider[] = [];

let service: WechatService | null = null;

export default definePlugin({
  controllers: [WechatController],
  providers,

  async setup(ctx: KernelContext) {
    const identity = ctx.use('identity.public');

    const instance = new WechatService({
      ctx,
      repository: createWechatRepository(ctx.db),
      identity,
      // A function, not the resolved gateway: see the header.
      gateway: () => createGatewayFromConfig(ctx),
    });

    service = instance;
    providers.push({ provide: WechatService, useValue: instance });

    /**
     * The published port: one method.
     *
     * The account-deletion path asks it so a binding cannot outlive the account it points at - the
     * cleanup rule below deletes the rows, and this is what a future admin view or migration script
     * would read them with.
     */
    ctx.provide('wechat.public', {
      async getBindingForUser(userId) {
        return instance.getBindingForUser(userId);
      },
    });

    ctx.log.info('wechat mini program bindings ready', { owns: ctx.plugin.slug });

    // Account deletion: this plugin removes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction; see
    // wechat.cleanup.ts.
    ctx.cleanup.register(createWechatCleanupRule());
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
