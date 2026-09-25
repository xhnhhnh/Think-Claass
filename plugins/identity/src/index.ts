/**
 * Identity plugin - the `auth` domain.
 *
 * Relocated from `api/modules/auth/**` and `api/services/activationService.ts`. It is the last
 * domain that reached into `api/**` from a domain module, which is why it closes three debts at
 * once:
 *
 *  1. **`users`, `activation_codes` and `activation_events` have an owner.** They were
 *     unowned tables before (the kernel's boot schema creates them, and `api/modules/admin`
 *     is still a Prisma-level writer), so the ownership check could not see anything. Now the
 *     write paths go through `ctx.db`.
 *  2. **`getActiveKernel()` loses a consumer.** The legacy login route reached the session
 *     service through that service locator; a plugin gets `ctx.sessions` instead. Debt item 1 in
 *     HANDOFF section 10.
 *  3. **`activateUser` becomes a port.** The activation-code route here and the payment webhook
 *     (still in `api/modules/platform`) both end in that one call, so it is the boundary the
 *     payment migration will consume next.
 *
 * `dependsOn: classroom` is hard: every login resolves a student or a parent link through it, and
 * a login route without classroom data would silently answer a different body.
 *
 * `parent-buff` is deliberately NOT a dependency. It is a `feature` plugin that may be disabled,
 * and the only thing identity needs from it is a best-effort activity record on parent login.
 * Resolving it lazily, at call time, is the shape HANDOFF section 9 prescribes for an optional
 * port: capturing `ctx.tryUse()` in `setup()` would freeze it as `null`, because plugins are set
 * up in slug order and `identity` sorts before `parent-buff`.
 */

import type { Provider } from '@nestjs/common';

import { definePlugin, type KernelContext } from '@thinkclass/plugin-sdk';

import { createIdentityCleanupRule } from './identity.cleanup.js';
import { IdentityController } from './identity.controllers.js';
import { createIdentityRepository } from './identity.repository.js';
import { IdentityService } from './identity.service.js';

const providers: Provider[] = [];

let service: IdentityService | null = null;

export default definePlugin({
  controllers: [IdentityController],
  providers,

  async setup(ctx: KernelContext) {
    const classroom = ctx.use('classroom.public');

    const instance = new IdentityService({
      ctx,
      repository: createIdentityRepository(ctx.db),
      classroom,
      // A function, not the resolved port: see the header.
      parentBuff: () => ctx.tryUse('parent_buff.public'),
    });

    service = instance;
    providers.push({ provide: IdentityService, useValue: instance });

    /**
     * The published port: activation, plus the admin console's view of this domain.
     *
     * Activation is the operation *another domain* needs to perform. The nine admin operations were
     * added when `api/modules/admin` migrated (P4.3b.14): its repository reached `users`,
     * `activation_codes` and `activation_events` through Prisma, and those are this plugin's
     * adopted tables, so the console consumes them here instead of being a second writer.
     * Login and profile stay HTTP routes, not imports - a plugin calling another plugin's login
     * route would be a much worse coupling than a port.
     */
    ctx.provide('identity.public', {
      async getUserById(userId) {
        return instance.getUserById(userId);
      },
      async getFirstUserIdByRole(role) {
        return instance.getFirstUserIdByRole(role);
      },
      async activateUser(input) {
        return instance.activateUser(input);
      },
      /**
       * The two credential-facing operations `plugins/wechat` consumes.
       *
       * Both keep the composition of a login body in this plugin - `loginWithCredentials` after
       * verifying a password, `getLoginPayload` for an openid this deployment has already bound to
       * an account. Neither mints a session: the WeChat plugin issues its own through
       * `ctx.sessions`, the same store this plugin's login route uses.
       */
      async loginWithCredentials(credentials) {
        const result = await instance.login(credentials);
        return { user: result.user, classFeatures: result.classFeatures ?? null };
      },
      async getLoginPayload(userId) {
        return instance.getLoginPayload(userId);
      },
      async verifyAdminCredentials(username, password) {
        return instance.verifyAdminCredentials(username, password);
      },
      async listTeachers() {
        return instance.listTeachers();
      },
      async createTeacher(input, audit) {
        return instance.createTeacher(input, audit);
      },
      async updateTeacher(id, input, audit) {
        return instance.updateTeacher(id, input, audit);
      },
      async findTeacher(id) {
        return instance.findTeacher(id);
      },
      async listActivationCodes() {
        return instance.listActivationCodes();
      },
      async generateActivationCodes(input, audit) {
        return instance.generateActivationCodes(input, audit);
      },
      async listSuperadmins() {
        return instance.listSuperadmins();
      },
      async restoreSuperadmins(superadmins) {
        return instance.restoreSuperadmins(superadmins);
      },
    });

    /**
     * The kernel's own login route (`POST /api/kernel/auth/login`) needs a credential verifier, and
     * the kernel may not import a plugin. This registration is what replaces
     * `api/modules/auth/legacyAuthProvider.ts`, which existed only to bridge that gap.
     *
     * No `dependsOn` and no port lookup here: verifying credentials touches `users` alone, so the
     * kernel's login keeps working even when every other plugin in the composition is disabled.
     */
    ctx.auth.registerProvider({
      async authenticate(credentials) {
        const identity = instance.authenticate(credentials.username, credentials.password, credentials.role);
        if (!identity) return null;

        const profile = await instance.login({
          username: credentials.username,
          password: credentials.password,
          role: credentials.role,
        });

        return {
          actor: { userId: identity.userId, role: identity.role as never },
          profile: {
            user: (profile as { user?: unknown }).user,
            classFeatures: (profile as { classFeatures?: unknown }).classFeatures ?? null,
          },
        };
      },
    });

    ctx.log.info('identity service ready', { owns: ctx.plugin.slug });

    // Account deletion: this plugin deletes its own rows when a teacher account is erased
    // (`DELETE /api/admin/users/:id`). The runtime runs every plugin's rule in one transaction and
    // orders them from the schema's foreign keys; see identity.cleanup.ts.
    ctx.cleanup.register(createIdentityCleanupRule());
  },

  async onStop() {
    service = null;
    providers.length = 0;
  },
});
