import { http, HttpResponse } from 'msw';

export const handlers = [
  // Auth
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as any;
    if (body.username === 'admin' && body.password === '123456') {
      return HttpResponse.json({ success: true, user: { id: 1, username: 'admin', role: 'superadmin' } });
    }
    return HttpResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
  }),

  http.post('/api/admin/session', async ({ request }) => {
    const body = await request.json() as any;
    if (body.username === 'admin' && body.password === '123456') {
      return HttpResponse.json({
        success: true,
        data: {
          user: { id: 1, username: 'admin', role: 'superadmin' },
        },
      });
    }
    return HttpResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
  }),
  
  http.post('/api/auth/register', async ({ request }) => {
    return HttpResponse.json({ success: true, message: 'Registered' });
  }),

  http.get('/api/settings', () => {
    return HttpResponse.json({
      success: true,
      data: {
        site_title: 'Think-Class',
        site_favicon: '',
        revenue_enabled: '0',
        revenue_mode: 'activation_code',
      },
    });
  }),

  // Teacher Classes
  http.get('/api/classes', () => {
    return HttpResponse.json({
      success: true,
      classes: [
        { id: 1, name: 'Class 1', invite_code: 'CODE1' },
      ]
    });
  }),
  
  // Students
  http.get('/api/students', ({ request }) => {
    const url = new URL(request.url);
    const classId = url.searchParams.get('classId');
    if (classId === '1') {
      return HttpResponse.json({
        success: true,
        students: [
          { id: 1, name: 'Student A', total_points: 100 },
        ]
      });
    }
    return HttpResponse.json({ success: true, students: [] });
  }),

  http.post('/api/students/:id/points', async ({ request, params }) => {
    const { id } = params;
    const body = await request.json() as any;
    return HttpResponse.json({
      success: true,
      message: `Added ${body.amount} points to student ${id}`
    });
  }),

  // Admin
  http.get('/api/admin/system/stats', () => {
    return HttpResponse.json({
      success: true,
      data: {
        server: {
          cpuUsage: 10,
          cpuCount: 8,
          totalMem: 16000000000,
          usedMem: 8000000000,
          freeMem: 8000000000,
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
      }
    });
  }),

  http.get('/api/admin/system/settings', () => {
    return HttpResponse.json({
      success: true,
      data: {
        site_title: 'Think-Class',
        site_favicon: '/favicon.svg',
        allow_teacher_registration: '1',
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
      },
    });
  }),

  http.put('/api/admin/system/settings', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      success: true,
      data: body,
      message: '系统设置已更新',
    });
  }),

  http.post('/api/admin/system/database/reset', () => {
    return HttpResponse.json({
      success: true,
      data: {
        message: '所有数据已重置，并已恢复超级管理员账户',
        preservedSuperadmins: 1,
      },
    });
  }),

  http.post('/api/admin/system/database/import', () => {
    return HttpResponse.json({
      success: true,
      data: {
        message: '导入成功，数据结构已自动升级并热加载完成！',
        reloaded: true,
        backupRestored: false,
      },
    });
  }),

  http.get('/api/admin/system/database/export', () => {
    return new HttpResponse('mock sqlite payload', {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="backup.sqlite"',
      },
    });
  }),
];
