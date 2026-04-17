import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, passthrough } from 'msw';
import { server as mswServer } from '../../../src/mocks/server';

import { createAdminModule } from './admin.module';
import { ApiError } from '../../utils/asyncHandler';

describe('createAdminModule', () => {
  const servers: Array<ReturnType<express.Application['listen']>> = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (!server) continue;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('serves the new admin contracts', async () => {
    const service = {
      createSession: vi.fn().mockResolvedValue({
        user: { id: 1, role: 'superadmin', username: 'root' },
      }),
      getSystemStats: vi.fn().mockResolvedValue({
        server: {
          cpuUsage: 10,
          cpuCount: 8,
          totalMem: 16,
          usedMem: 8,
          freeMem: 8,
          memUsage: 50,
          uptime: 3600,
          platform: 'win32',
        },
        database: {
          totalUsers: 10,
          teachers: 2,
          students: 8,
          classes: 1,
          totalActivity: 20,
          totalAssignments: 3,
          totalLeaves: 1,
          totalTeamQuests: 2,
          totalPoints: 1000,
        },
      }),
      getSystemSettings: vi.fn().mockResolvedValue({
        site_title: 'Think-Class',
        site_favicon: '',
        allow_teacher_registration: '0',
        revenue_enabled: '0',
        revenue_mode: 'activation_code',
        enable_teacher_analytics: '1',
        enable_parent_report: '1',
        payment_price: '99.00',
        payment_currency: 'CNY',
        payment_description: 'Think-Class 平台激活',
        payment_environment: 'mock',
        payment_enable_wechat: '1',
        payment_enable_alipay: '1',
      }),
      updateSystemSettings: vi.fn().mockResolvedValue({
        site_title: 'Think-Class',
        site_favicon: '',
        allow_teacher_registration: '0',
        revenue_enabled: '0',
        revenue_mode: 'activation_code',
        enable_teacher_analytics: '1',
        enable_parent_report: '1',
        payment_price: '99.00',
        payment_currency: 'CNY',
        payment_description: 'Think-Class 平台激活',
        payment_environment: 'mock',
        payment_enable_wechat: '1',
        payment_enable_alipay: '1',
      }),
      exportDatabase: vi.fn().mockResolvedValue({
        filePath: __filename,
        fileName: 'backup.sqlite',
      }),
      importDatabase: vi.fn().mockResolvedValue({
        message: 'ok',
        reloaded: true,
        backupRestored: false,
      }),
      resetDatabase: vi.fn().mockResolvedValue({
        message: 'reset',
        preservedSuperadmins: 1,
      }),
    };

    const app = express();
    app.use(createAdminModule({ service: service as any }));
    app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }

      res.status(500).json({ success: false, message: error.message });
    });

    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;
    mswServer.use(
      http.all(/http:\/\/127\.0\.0\.1:\d+\/.*/, () => passthrough()),
    );

    const sessionResponse = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root', password: 'secret' }),
    });
    const sessionBody = await sessionResponse.json();

    expect(sessionResponse.status).toBe(200);
    expect(sessionBody.data.user.username).toBe('root');

    const settingsResponse = await fetch(`${baseUrl}/system/settings`, {
      headers: {
        'x-user-role': 'superadmin',
        'x-user-id': '1',
      },
    });
    const settingsBody = await settingsResponse.json();

    expect(settingsResponse.status).toBe(200);
    expect(settingsBody.data.site_title).toBe('Think-Class');
  });
});
