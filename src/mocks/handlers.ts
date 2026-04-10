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
  
  http.post('/api/auth/register', async ({ request }) => {
    return HttpResponse.json({ success: true, message: 'Registered' });
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
  http.get('/api/admin/stats', () => {
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
  http.post('/api/admin/reset-database', () => {
    return HttpResponse.json({
      success: true,
      message: '所有数据已重置',
    });
  }),
];
