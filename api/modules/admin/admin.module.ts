import express, { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import os from 'os';

import { PrismaAdminRepository } from './admin.repository.js';
import { SqliteAdminMaintenanceService } from './admin.maintenance.js';
import { AdminService } from './admin.service.js';
import { createAdminAnnouncementsRouter } from './admin.announcements.routes.js';
import { createAdminCodesRouter } from './admin.codes.routes.js';
import { createAdminUsersRouter } from './admin.users.routes.js';
import { ApiError, asyncHandler } from '../../utils/asyncHandler.js';
import { requireActorRole } from '../../utils/requestAuth.js';
import type { ApiSuccessResponse } from '../../../src/shared/admin/contracts.js';

export interface CreateAdminModuleOptions {
  service?: AdminService;
  upload?: multer.Multer;
}

function ok<T>(res: Response, data: T, message?: string) {
  const body: ApiSuccessResponse<T> = message
    ? { success: true, data, message }
    : { success: true, data };
  res.json(body);
}

export function createAdminModule(options: CreateAdminModuleOptions = {}) {
  const router = Router();
  const service =
    options.service ??
    new AdminService(new PrismaAdminRepository(), new SqliteAdminMaintenanceService());
  const upload = options.upload ?? multer({ dest: os.tmpdir() });

  router.use(express.json({ limit: '10mb' }));
  router.use(express.urlencoded({ extended: true, limit: '10mb' }));

  router.post(
    '/session',
    asyncHandler(async (req: Request, res: Response) => {
      const { username = '', password = '' } = req.body ?? {};
      const session = await service.createSession(String(username), String(password));
      ok(res, session);
    }),
  );

  router.use((req: Request, _res: Response, next: NextFunction) => {
    try {
      requireActorRole(req, ['admin', 'superadmin']);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/system/stats',
    asyncHandler(async (_req: Request, res: Response) => {
      ok(res, await service.getSystemStats());
    }),
  );

  router.get(
    '/system/settings',
    asyncHandler(async (_req: Request, res: Response) => {
      ok(res, await service.getSystemSettings());
    }),
  );

  router.put(
    '/system/settings',
    asyncHandler(async (req: Request, res: Response) => {
      const settings = await service.updateSystemSettings(req.body ?? {});
      ok(res, settings, '系统设置已更新');
    }),
  );

  router.get(
    '/system/database/export',
    asyncHandler(async (_req: Request, res: Response) => {
      const exportPayload = await service.exportDatabase();
      res.download(exportPayload.filePath, exportPayload.fileName);
    }),
  );

  router.post(
    '/system/database/import',
    upload.single('file'),
    asyncHandler(async (req: Request, res: Response) => {
      const file = req.file;
      if (!file) {
        throw new ApiError(400, '未提供文件');
      }

      const result = await service.importDatabase(file.path);
      ok(res, result, result.message);
    }),
  );

  router.post(
    '/system/database/reset',
    asyncHandler(async (_req: Request, res: Response) => {
      const result = await service.resetDatabase();
      ok(res, result, result.message);
    }),
  );

  router.use('/users', createAdminUsersRouter(service));
  router.use('/codes', createAdminCodesRouter(service));
  router.use('/announcements', createAdminAnnouncementsRouter(service));

  return router;
}

export default createAdminModule;
