/**
 * Kernel-owned HTTP surface.
 *
 * These are infrastructure endpoints, not business endpoints, so the kernel mounts
 * them directly on the express app rather than routing them through Nest. Plugin
 * routes are mounted separately by the plugin host.
 *
 *   GET  /api/health                  liveness + plugin summary
 *   GET  /api/kernel/info             version and API version
 *   GET  /api/kernel/plugins          enabled plugins projected for the frontend
 *   GET  /api/kernel/permissions      every permission declared by any plugin
 *   GET  /api/kernel/auth/me          the resolved actor
 *   POST /api/kernel/auth/logout      revoke the presented session
 *   GET  /api/settings                every setting as a flat key/value map
 *
 * `/api/settings` is the one non-`/api/kernel` path here, and it belongs to the
 * kernel because the `settings` table is kernel-owned storage (see
 * `storage/settingsStore.ts`): plugins write namespaced `plugin.<slug>.<key>`
 * entries into it, so the kernel can serve the map without knowing any domain.
 * It was previously a Nest module whose whole body was a `SELECT key, value`.
 */

import { Router, type Request, type Response } from 'express';

import type { HealthStatus, PublicPluginDescriptor } from '@thinkclass/contracts';

import { KERNEL_API_VERSION, type KernelConfig } from '../config/loadConfig.js';
import type { EventBus } from '../events/eventBus.js';
import type { PermissionEngine } from '../permissions/permissionEngine.js';
import type { SessionService } from '../auth/session.js';
import type { AuthProvider } from '../auth/authProvider.js';
import type { SettingsStore } from '../storage/settingsStore.js';
import { ApiError, asyncHandler, badRequest, unauthorized } from './errorEnvelope.js';
import { getRequestContext } from './requestContext.js';

export interface PluginHostView {
  /** Plugins that are active, projected to what the browser needs. */
  publicDescriptors(): PublicPluginDescriptor[];
  summary(): { total: number; active: number; degraded: number };
}

/** A host with no plugins; the P1 default and the P3 extension point. */
export function createEmptyPluginHost(): PluginHostView {
  return {
    publicDescriptors: () => [],
    summary: () => ({ total: 0, active: 0, degraded: 0 }),
  };
}

export interface KernelRoutesOptions {
  config: KernelConfig;
  startedAt: number;
  plugins: PluginHostView;
  events: EventBus;
  permissions: PermissionEngine;
  sessions: SessionService;
  /** Kernel-owned key/value storage, backing `GET /api/settings`. */
  settings: SettingsStore;
  /**
   * Where the credential verifier comes from.
   *
   * A holder rather than a value: this router is built before plugins are mounted, and the identity
   * plugin registers its verifier during `setup`. Reading `current` per request is what makes the
   * route work after boot - and what makes it degrade to 503 again if that plugin is stopped.
   */
  authProvider?: { current: AuthProvider | null };
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function createKernelRouter(options: KernelRoutesOptions): Router {
  const router = Router();

  /**
   * Issue a real session.
   *
   * The response carries the opaque token; only its SHA-256 digest is stored. This
   * replaces the baseline model where the client asserted its own identity with
   * `x-user-role` / `x-user-id` headers that the server trusted verbatim.
   */
  router.post(
    '/api/kernel/auth/login',
    asyncHandler(async (req: Request, res: Response) => {
      const { username, password, role } = (req.body ?? {}) as Record<string, unknown>;
      if (!username || !password) throw badRequest('用户名和密码不能为空');

      const provider = options.authProvider?.current;
      if (!provider) {
        throw new ApiError(503, '认证提供者尚未配置', { code: 'AUTH_PROVIDER_MISSING' });
      }

      const identity = await provider.authenticate({
        username: String(username),
        password: String(password),
        role: role === undefined ? undefined : String(role),
      });
      if (!identity) throw unauthorized('账号或密码错误，请重试');

      const session = options.sessions.issue({
        userId: identity.actor.userId,
        role: identity.actor.role,
        ttlMs: options.config.sessionTtlMs,
        userAgent: req.header('user-agent') ?? null,
        ip: req.ip ?? null,
      });

      res.json({
        success: true,
        data: {
          token: session.token,
          expiresAt: session.expiresAt,
          actor: identity.actor,
          profile: identity.profile ?? null,
        },
      });
    }),
  );

  /**
   * Every setting as a flat map. Public on purpose: this is the endpoint the SPA
   * reads before it knows who the user is (site title, payment switches, class
   * feature defaults), and it has always been unauthenticated.
   */
  router.get('/api/settings', (_req: Request, res: Response) => {
    res.json({ success: true, data: options.settings.all() });
  });

  router.get('/api/health', (_req: Request, res: Response) => {
    const body: HealthStatus = {
      success: true,
      message: 'ok',
      kernel: {
        version: '1.0.0',
        apiVersion: KERNEL_API_VERSION,
        uptimeMs: Date.now() - options.startedAt,
        plugins: options.plugins.summary(),
      },
    };
    res.json(body);
  });

  router.get('/api/kernel/info', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        kernelVersion: '1.0.0',
        apiVersion: KERNEL_API_VERSION,
        env: options.config.env,
        pluginDirs: options.config.pluginDirs,
        pluginsEnabled: options.config.pluginsEnabled,
        uptimeMs: Date.now() - options.startedAt,
      },
    });
  });

  router.get('/api/kernel/plugins', (_req: Request, res: Response) => {
    res.json({ success: true, data: options.plugins.publicDescriptors() });
  });

  router.get('/api/kernel/permissions', (_req: Request, res: Response) => {
    res.json({ success: true, data: options.permissions.list() });
  });

  router.get(
    '/api/kernel/auth/me',
    asyncHandler((req: Request, res: Response) => {
      const { actor, authSource, requestId } = getRequestContext(req);
      if (!actor) throw unauthorized();
      res.json({ success: true, data: { actor, authSource, requestId } });
    }),
  );

  router.post(
    '/api/kernel/auth/logout',
    asyncHandler((req: Request, res: Response) => {
      const token = bearerToken(req);
      const revoked = token ? options.sessions.revoke(token) : false;
      res.json({ success: true, data: { revoked } });
    }),
  );

  return router;
}
