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

export function createAdminAnnouncementsRouter(service: AdminService) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req: Request, res: Response) => {
      const announcements = await service.listAnnouncements();
      ok(res, { items: announcements, total: announcements.length });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const actor = getRequestActor(req);
      const announcement = await service.createAnnouncement(req.body ?? {}, actor, req.ip);
      ok(res, announcement, '公告创建成功');
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const actor = getRequestActor(req);
      const announcement = await service.updateAnnouncement(Number(req.params.id), req.body ?? {}, actor, req.ip);
      ok(res, announcement, '公告更新成功');
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const actor = getRequestActor(req);
      const result = await service.deleteAnnouncement(Number(req.params.id), actor, req.ip);
      ok(res, result, result.message);
    }),
  );

  return router;
}
