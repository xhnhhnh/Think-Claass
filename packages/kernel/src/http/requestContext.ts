/**
 * Request context: correlation id, authenticated actor, and the scope the request
 * operates in.
 *
 * Actor resolution order:
 *   1. `Authorization: Bearer <token>` verified against the session store  (real)
 *   2. `x-user-role` / `x-user-id` headers, only while
 *      `config.allowLegacyHeaderAuth` is on                              (migration bridge)
 *
 * The legacy path exists so the frontend can be switched over without a flag day.
 * It is logged as deprecated on every use so the bridge cannot be forgotten, and
 * P7 removes it.
 */

import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import type { Actor, Role } from '@thinkclass/contracts';

import type { KernelConfig } from '../config/loadConfig.js';
import type { Logger } from '../logging/logger.js';
import type { SessionService } from '../auth/session.js';

export interface RequestContext {
  requestId: string;
  actor: Actor | null;
  /** How the actor was established; `none` for anonymous requests. */
  authSource: 'bearer' | 'legacy-headers' | 'none';
}

export interface RequestWithContext extends Request {
  context?: RequestContext;
  requestId?: string;
  actor?: Actor | null;
}

/**
 * Fill in an authenticated actor's scope (`studentId`, `classId`).
 *
 * A verified session carries only `userId` and `role` (`sessions.verify`), because only the
 * session store knows them - the student row behind a login belongs to a plugin. So the actor a
 * request is served with is *extended* after verification by a resolver the host supplies, which
 * reads the kernel context and reaches a plugin through its published port. The kernel never
 * learns which plugin that is (G2/G5).
 *
 * Returning `null` means "no scope to add"; the resolved actor is used instead.
 */
export type ScopeResolver = (req: Request, actor: Actor) => Promise<Actor | null>;

export interface RequestContextOptions {
  config: KernelConfig;
  sessions: SessionService;
  logger?: Logger;
  /**
   * Host-supplied scope resolution. Absent means the actor stays as the session store returned it,
   * which is the honest state of a host that has nothing to extend it with.
   */
  resolveScope?: ScopeResolver;
}

function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function createRequestContextMiddleware(options: RequestContextOptions) {
  const { config, sessions, logger, resolveScope } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId =
      (req.header('x-request-id') || '').trim() || crypto.randomBytes(8).toString('hex');

    let actor: Actor | null = null;
    let authSource: RequestContext['authSource'] = 'none';

    const token = parseBearer(req.header('authorization'));
    if (token) {
      // A credential was presented. If it does not verify, the request is
      // anonymous - it must NOT fall through to the weaker header bridge, or
      // presenting a revoked token alongside forged headers would still
      // authenticate. Falling back is only allowed when no token was sent at all.
      actor = sessions.verify(token);
      if (actor) authSource = 'bearer';
    } else if (config.allowLegacyHeaderAuth) {
      const role = req.header('x-user-role');
      const idHeader = req.header('x-user-id');
      const userId = idHeader ? Number(idHeader) : Number.NaN;
      if (role && Number.isFinite(userId)) {
        actor = { userId, role: role as Role };
        authSource = 'legacy-headers';
        logger?.debug('legacy header auth used', {
          requestId,
          path: req.originalUrl,
          role,
          // Surfaces the migration bridge in logs so it is visible, not silent.
        });
      }
    }

    /**
     * Extend the verified actor with its domain scope.
     *
     * Fail-open **on the scope only**, never on identity: if resolving the student behind a login
     * throws (a plugin is disabled, its port is unavailable, the lookup fails), the request keeps
     * the actor the session store verified. Swallowing the error into `actor = null` would turn a
     * transient plugin fault into a wave of 401s, and rethrowing would turn it into a 500 - neither
     * is honest about "we know who you are, we could not look up your class".
     */
    if (actor && resolveScope) {
      try {
        const resolved = await resolveScope(req, actor);
        if (resolved) actor = resolved;
      } catch (error) {
        logger?.warn('actor scope resolution failed; serving the unscoped actor', {
          requestId,
          path: req.originalUrl,
          role: actor.role,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const context: RequestContext = { requestId, actor, authSource };
    (req as RequestWithContext).context = context;
    (req as RequestWithContext).requestId = requestId;
    (req as RequestWithContext).actor = actor;

    res.setHeader('x-request-id', requestId);
    next();
  };
}

/**
 * Read the context, throwing when the middleware was not installed.
 */
export function getRequestContext(req: Request): RequestContext {
  const context = (req as RequestWithContext).context;
  if (!context) {
    throw new Error('request context middleware is not installed');
  }
  return context;
}
