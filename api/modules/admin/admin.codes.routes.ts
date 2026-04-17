import { Router, type Request, type Response } from 'express';

import type { ApiSuccessResponse } from '../../../src/shared/admin/contracts.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getRequestActor } from '../../utils/requestAuth.js';
import type { AdminService } from './admin.service.js';

function ok<T>(res: Response, data: T, message?: string) {
  const body: ApiSuccessResponse<T> = message
    ? { success: true, data, message }
    : { success: true, data };
  res.json(body);
}

export function createAdminCodesRouter(service: AdminService) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req: Request, res: Response) => {
      const codes = await service.listActivationCodes();
      ok(res, { items: codes, total: codes.length });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const actor = getRequestActor(req);
      const result = await service.generateActivationCodes(req.body ?? {}, actor, req.ip);
      ok(res, result, result.message);
    }),
  );

  return router;
}
