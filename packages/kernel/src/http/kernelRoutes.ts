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
 */

import { Router, type Request, type Response } from 'express';

import type { HealthStatus, PublicPluginDescriptor } from '@thinkclass/contracts';

import { KERNEL_API_VERSION, type KernelConfig } from '../config/loadConfig.js';
import type { EventBus } from '../events/eventBus.js';
import type { PermissionEngine } from '../permissions/permissionEngine.js';
import type { SessionService } from '../auth/session.js';
import { asyncHandler, unauthorized } from './errorEnvelope.js';
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
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function createKernelRouter(options: KernelRoutesOptions): Router {
  const router = Router();

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
