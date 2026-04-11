import type { Request } from 'express';

import { ApiError } from './asyncHandler.js';

export interface RequestActor {
  id: number | null;
  role: string | null;
}

export function getRequestActor(req: Request): RequestActor {
  const roleHeader = req.header('x-user-role');
  const idHeader = req.header('x-user-id');
  const parsedId = idHeader ? Number(idHeader) : null;

  return {
    id: parsedId !== null && Number.isFinite(parsedId) ? parsedId : null,
    role: roleHeader ?? null,
  };
}

export function requireActorRole(req: Request, allowedRoles: string[]) {
  const actor = getRequestActor(req);
  if (!actor.role || !allowedRoles.includes(actor.role)) {
    throw new ApiError(403, '无权限执行该操作');
  }
  return actor;
}
