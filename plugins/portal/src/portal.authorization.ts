/**
 * Request-level authorization for the `api/website` surface.
 *
 * The portal splits in two, and the split is the product decision, not an accident:
 *
 *   - `GET /api/website/home`, `GET /api/website/articles`, `GET /api/website/articles/:id` and
 *     `POST /api/website/contact` are the public marketing site. `HomePage`, `NewsPage` and
 *     `ContactPage` call them before anyone logs in, so they must stay anonymous.
 *   - `PUT /api/website/home` and `POST|PUT|DELETE /api/website/articles*` are the admin console's
 *     article/homepage editor (`AdminWebsitePage`, `AdminArticlesPage`) - the only caller. They used
 *     to be anonymous, which let an unnamed visitor rewrite the whole site or delete every article.
 *     They are admin/superadmin now.
 *
 * 401 = "we do not know who you are" (`未登录或登录已过期`); 403 = "we know, and you may not"
 * (`无权限执行该操作`).
 *
 * The helper is defined here rather than imported from `plugins/system`: guardrail G1 forbids a
 * plugin reaching into another plugin's internals, so the semantics are replicated instead of the
 * code. The caller comes from the kernel's request context and nowhere else.
 */

import type { Request } from 'express';

import { ApiError, getRequestContext } from '@thinkclass/kernel';

export interface RequestActor {
  id: number | null;
  role: string | null;
  /** The student row this login owns; filled in by the host's scope resolver when it runs. */
  studentId?: number;
  classId?: number;
}

function actorOf(req: Request): RequestActor {
  const actor = getRequestContext(req).actor;
  return actor
    ? { id: actor.userId, role: actor.role, studentId: actor.studentId, classId: actor.classId }
    : { id: null, role: null };
}

/** The caller, or 401 when the request carries no verified actor. */
export function requireActor(req: Request): RequestActor {
  const actor = actorOf(req);
  if (!actor.role || actor.id === null) throw new ApiError(401, '未登录或登录已过期');
  return actor;
}

/** The legacy `requireActorRole`: 401 when unknown, 403 when known but not allowed. */
export function requireActorRole(req: Request, allowedRoles: string[]): RequestActor {
  const actor = requireActor(req);
  if (!allowedRoles.includes(actor.role)) throw new ApiError(403, '无权限执行该操作');
  return actor;
}
