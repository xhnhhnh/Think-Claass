/**
 * The multipart transport (`wx.uploadFile`) and the homework photo route built on it.
 *
 * `util/request.ts` had one transport for JSON and nothing for files, so the mini program could not
 * upload a homework photograph at all - the route existed (`POST /api/homework/submissions/:id/photos`,
 * `FileInterceptor('file')`), the web client used it, and the phone could not. The competition
 * checklist names this as the one flow that has to work on a real device.
 *
 * What these tests pin is exactly what is easy to get wrong in a second transport: the Bearer header
 * (the route is actor-gated), the multipart field name the server reads, the string body the platform
 * hands over, and the same 401 recovery the JSON path has.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeWx, type FakeWx } from './helpers/fake-wx';

function seedSession(wx: FakeWx, role = 'student') {
  wx.storage.set(
    'thinkclass-mp-auth',
    JSON.stringify({
      token: 'token-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      user: { id: 7, username: 'u7', role, studentId: 3, classId: 1 },
      classFeatures: {},
    }),
  );
}

/** A `wx.login` + `/api/wechat/login` pair that hands back a fresh token. */
function reloginResponder() {
  return (request: { url: string }) => {
    if (request.url.includes('/api/wechat/login')) {
      return {
        statusCode: 200,
        data: {
          bound: true,
          token: 'token-2',
          expiresAt: '2099-01-01T00:00:00.000Z',
          user: { id: 7, username: 'u7', role: 'student', studentId: 3, classId: 1 },
          classFeatures: {},
        },
      };
    }
    return { statusCode: 200, data: { success: true } };
  };
}

describe('multipart upload', () => {
  let wx: FakeWx;

  beforeEach(() => {
    vi.resetModules();
  });

  it('sends the file with the Bearer token and the field name the kernel reads', async () => {
    wx = installFakeWx({
      respond: () => ({ statusCode: 200, data: { success: true } }),
      upload: () => ({ statusCode: 200, data: { success: true, data: { id: 41 } } }),
    });
    seedSession(wx);

    const { upload } = await import('../../miniprogram/utils/request');
    const body = await upload<{ success: true; data: { id: number } }>({
      path: '/api/homework/submissions/21/photos',
      filePath: '/tmp/photo-1.jpg',
      name: 'file',
    });

    const [recorded] = wx.uploads;
    expect(recorded.url).toContain('/api/homework/submissions/21/photos');
    expect(recorded.filePath).toBe('/tmp/photo-1.jpg');
    expect(recorded.name).toBe('file');
    expect(recorded.header.Authorization).toBe('Bearer token-1');
    // The platform's string body is parsed, exactly as `callContainer`'s is.
    expect(body.data.id).toBe(41);
  });

  it('recovers a 401 with one silent re-login and retries the upload', async () => {
    let uploads = 0;
    wx = installFakeWx({
      respond: reloginResponder(),
      upload: () => {
        uploads += 1;
        return uploads === 1
          ? { statusCode: 401, data: { success: false, message: '登录已过期' } }
          : { statusCode: 200, data: { success: true, data: { id: 42 } } };
      },
    });
    seedSession(wx);

    const { upload } = await import('../../miniprogram/utils/request');
    const body = await upload<{ success: true; data: { id: number } }>({
      path: '/api/homework/submissions/21/photos',
      filePath: '/tmp/photo-1.jpg',
    });

    expect(body.data.id).toBe(42);
    expect(wx.uploads).toHaveLength(2);
    // The retry carried the *new* token, not the stale one.
    expect(wx.uploads[1].header.Authorization).toBe('Bearer token-2');
  });

  it('rejects with the server’s own message when the upload is refused', async () => {
    wx = installFakeWx({
      respond: () => ({ statusCode: 200, data: { success: true } }),
      upload: () => ({ statusCode: 413, data: { success: false, message: '照片太大' } }),
    });
    seedSession(wx);

    const { upload } = await import('../../miniprogram/utils/request');
    await expect(upload({ path: '/api/homework/submissions/21/photos', filePath: '/tmp/x.jpg' })).rejects.toThrow(
      '照片太大',
    );
  });

  it('reports a transport failure as a network error rather than a silent success', async () => {
    wx = installFakeWx({
      respond: () => ({ statusCode: 200, data: { success: true } }),
      upload: () => ({ fail: true }),
    });
    seedSession(wx);

    const { upload } = await import('../../miniprogram/utils/request');
    await expect(upload({ path: '/api/homework/submissions/21/photos', filePath: '/tmp/x.jpg' })).rejects.toThrow(
      /网络/,
    );
  });
});

describe('homework photo calls', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uploads through the submission’s photos route and returns the stored row', async () => {
    const wx = installFakeWx({
      respond: () => ({ statusCode: 200, data: { success: true } }),
      upload: () => ({
        statusCode: 200,
        data: {
          success: true,
          data: { id: 9, submission_id: 21, storage_path: '/uploads/homework/a.jpg', mime: 'image/jpeg', size: 2048, sha256: 'abc', created_at: '' },
        },
      }),
    });
    seedSession(wx);

    const homework = await import('../../miniprogram/services/homework');
    const photo = await homework.uploadPhoto(21, '/tmp/a.jpg');

    expect(photo.id).toBe(9);
    expect(wx.uploadsTo('/submissions/21/photos')).toHaveLength(1);
  });

  it('sends photo_ids with the submission, which is what makes a question-less paper acceptable', async () => {
    const wx = installFakeWx({
      respond: () => ({
        statusCode: 200,
        data: {
          success: true,
          data: {
            homework: { id: 5, class_id: 1, teacher_id: 2, title: 't', description: null, due_at: null, status: 'published', total_points: 0, reward_points: 0, created_at: '', updated_at: '', questions: [] },
            submission: { id: 21, assignment_id: 5, student_id: 3, status: 'submitted', submitted_at: '', score: null, total_points: 0, teacher_feedback: null, ai_feedback: null, ai_confidence: null, graded_by: null, created_at: '', updated_at: '' },
            answers: [],
            photos: [],
          },
        },
      }),
    });
    seedSession(wx);

    const homework = await import('../../miniprogram/services/homework');
    await homework.submitAttempt(21, [], [9, 10]);

    const [request] = wx.requestsTo('/submit');
    expect(request.method).toBe('POST');
    expect(request.data).toEqual({ answers: [], photo_ids: [9, 10] });
  });

  it('builds an absolute URL for a stored photo, and leaves one alone', async () => {
    const wx = installFakeWx({ respond: () => ({ statusCode: 200, data: { success: true } }) });
    seedSession(wx);

    const homework = await import('../../miniprogram/services/homework');

    // `<image src>` needs an absolute URL; the stored path is a site-relative one.
    expect(homework.photoUrl('/uploads/homework/a.jpg')).toMatch(/^http:\/\/[^/]+\/uploads\/homework\/a\.jpg$/);
    expect(homework.photoUrl('https://cdn.example.test/a.jpg')).toBe('https://cdn.example.test/a.jpg');
  });
});
