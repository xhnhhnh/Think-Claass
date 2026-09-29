/**
 * Request-level authorization for the `wechat` HTTP surface.
 *
 * Two of the four routes are anonymous by necessity (`/login` carries a wx.login code and there is
 * no session yet; `/bind` carries a one-time ticket plus the account password), and two are not:
 * `/me` and `/unbind` act on the caller's own binding.
 *
 * The helper is defined here rather than imported from another plugin - guardrail G1 forbids a plugin
 * reaching into another plugin's internals, so the semantics are replicated instead of the code:
 *
 *   401 - "we do not know who you are"   (未登录或登录已过期)
 *   403 - "we know, and you may not"     (无权限执行该操作)
 *
 * The caller comes from the kernel's request context and from nowhere else. The pre-migration
 * `getRequestActor()` fell back to the raw `x-user-role` / `x-user-id` headers, which would let a
 * forged header outrank the middleware's verdict - and a mini program client must never be the
 * reason that bridge gets switched on.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

export interface RequestActor {
  id: number | null;
  role: string | null;
}

/** The same actor, after the 401 gate - so a caller never has to re-assert `id !== null`. */
export interface AuthenticatedActor {
  id: number;
  role: string;
}

function actorOf(req: Request): RequestActor {
  const actor = getRequestContext(req).actor;
  return actor ? { id: actor.userId, role: actor.role } : { id: null, role: null };
}

/**
 * Any signed-in account.
 *
 * Deliberately not a role list: a student, a teacher and a parent may each hold their own WeChat
 * binding, and "which roles exist" is not this plugin's vocabulary to re-declare.
 */
export function requireActor(req: Request): AuthenticatedActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  return { id: actor.id, role: actor.role };
}
