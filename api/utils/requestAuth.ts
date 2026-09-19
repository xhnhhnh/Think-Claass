/**
 * Request identity resolution.
 *
 * Two sources, in strict precedence order:
 *
 *   1. the kernel's verified request context (`req.context.actor`), populated from
 *      a session token by `createRequestContextMiddleware`
 *   2. the legacy `x-user-role` / `x-user-id` headers, which the kernel only
 *      accepts while `ALLOW_LEGACY_HEADER_AUTH` is on
 *
 * The fallback in step 2 exists for routes mounted without the kernel middleware.
 * When the middleware IS installed its verdict is final: if it says the caller is
 * anonymous, the headers are not consulted. Otherwise a forged header would still
 * work on exactly the routes the bridge was switched off for.
 */

import type { Request } from 'express';

import type { RequestContext } from '@thinkclass/kernel';

import { ApiError } from './apiError.js';

export interface RequestActor {
  id: number | null;
  role: string | null;
}

interface KernelContextCarrier {
  context?: RequestContext;
}

export function getRequestActor(req: Request): RequestActor {
  const carrier = req as Request & KernelContextCarrier;

  // The kernel middleware ran: trust its verdict, including "anonymous".
  if (carrier.context) {
    const actor = carrier.context.actor;
    return actor ? { id: actor.userId, role: actor.role } : { id: null, role: null };
  }

  // No kernel middleware on this route - legacy behaviour.
  const roleHeader = req.header('x-user-role');
  const idHeader = req.header('x-user-id');
  const parsedId = idHeader ? Number(idHeader) : null;

  return {
    id: parsedId !== null && Number.isFinite(parsedId) ? parsedId : null,
    role: roleHeader ?? null,
  };
}

/**
 * Require an authenticated actor holding one of `allowedRoles`.
 *
 * 401 means "we do not know who you are"; 403 means "we know, and you may not".
 * Collapsing both into 403 (the baseline behaviour) makes an expired session look
 * like a permissions problem and gives the client nothing to act on.
 */
export function requireActorRole(req: Request, allowedRoles: string[]) {
  const actor = getRequestActor(req);
  if (!actor.role || actor.id === null) {
    throw new ApiError(401, '未登录或登录已过期');
  }
  if (!allowedRoles.includes(actor.role)) {
    throw new ApiError(403, '无权限执行该操作');
  }
  return actor;
}
