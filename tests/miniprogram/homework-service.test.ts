/**
 * The homework calls, at the URL level.
 *
 * Two of these decide who can read what, and the pair is easy to get wrong:
 *
 *   - `POST /api/homework/:id/attempt` opens or resumes *my* attempt and is **student-only**
 *     (`plugins/homework/src/homework.authorization.ts` STUDENT_ONLY);
 *   - `GET /api/homework/submissions/:id` reads one attempt and admits the pupil **and their
 *     parent**, scoped to their own child (RECORD_READERS).
 *
 * A parent tapping a row in 我的作业 used to take the first path - which their session cannot use -
 * and landed on an error card. The page now chooses by role, and this file pins the two shapes so a
 * later "simplification" cannot quietly point both at the same route again.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_REQUEST_TIMEOUT } from '../../miniprogram/config/index';
import { installFakeWx, type FakeWx } from './helpers/fake-wx';

/** Seed the session the request layer reads for its Bearer token. */
function seedSession(wx: FakeWx, role: string) {
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

const OK_ATTEMPT = {
  success: true,
  data: {
    homework: { id: 5, class_id: 1, teacher_id: 2, title: '作业', description: null, due_at: null, status: 'published', total_points: 0, reward_points: 0, created_at: '', updated_at: '', questions: [] },
    submission: { id: 21, assignment_id: 5, student_id: 3, status: 'draft', submitted_at: null, score: null, total_points: 0, teacher_feedback: null, ai_feedback: null, ai_confidence: null, graded_by: null, created_at: '', updated_at: '' },
    answers: [],
    photos: [],
  },
};

describe('homework service calls', () => {
  let wx: FakeWx;

  beforeEach(() => {
    vi.resetModules();
    wx = installFakeWx({ respond: () => ({ statusCode: 200, data: OK_ATTEMPT }) });
    seedSession(wx, 'student');
  });

  it('opens an attempt with POST /api/homework/:id/attempt', async () => {
    const homework = await import('../../miniprogram/services/homework');
    await homework.startAttempt(5);

    const [request] = wx.requestsTo('/attempt');
    expect(request.method).toBe('POST');
    expect(request.url).toContain('/api/homework/5/attempt');
    expect(request.header.Authorization).toBe('Bearer token-1');
  });

  it('reads an attempt with GET /api/homework/submissions/:id, the parent-safe route', async () => {
    const homework = await import('../../miniprogram/services/homework');
    const detail = await homework.submissionDetail(21);

    const [request] = wx.requestsTo('/submissions/21');
    expect(request.method).toBe('GET');
    expect(request.url).toContain('/api/homework/submissions/21');
    // The attempt is the response body's `data`, unwrapped - the page renders it directly.
    expect(detail.submission.id).toBe(21);
    // And the student-only route was not touched.
    expect(wx.requestsTo('/attempt')).toHaveLength(0);
  });

  it('lists my homework from GET /api/homework/my', async () => {
    const homework = await import('../../miniprogram/services/homework');
    await homework.myHomework().catch(() => undefined);

    const [request] = wx.requestsTo('/api/homework/my');
    expect(request.method).toBe('GET');
  });

  it('reads and writes the AI thread on /api/homework/:id/qa', async () => {
    wx = installFakeWx({
      respond: (request) => {
        if (request.method === 'GET') {
          return { statusCode: 200, data: { success: true, data: { messages: [], ai: null } } };
        }
        return {
          statusCode: 200,
          data: {
            success: true,
            data: {
              messages: [{ id: 1, role: 'student', content: '为什么' }],
              ai: { source: 'mock', available: false, confidence: null, message: '未接入模型' },
            },
          },
        };
      },
    });
    seedSession(wx, 'student');

    const homework = await import('../../miniprogram/services/homework');
    const listed = await homework.listQa(5);
    expect(listed.messages).toEqual([]);
    expect(listed.ai).toBeNull();

    const asked = await homework.askQa(5, { content: '为什么', question_id: 9 });
    expect(asked.ai?.available).toBe(false);

    const [read, write] = wx.requestsTo('/api/homework/5/qa');
    expect(read.method).toBe('GET');
    expect(write.method).toBe('POST');
    expect(write.data).toEqual({ content: '为什么', question_id: 9 });
    expect(write.timeout).toBe(AI_REQUEST_TIMEOUT);
  });

  it('grades a paper with POST /api/homework/:id/ai-grade and does not overwrite teacher marks', async () => {
    wx = installFakeWx({
      respond: () => ({
        statusCode: 200,
        data: { success: true, data: [{ ai: { source: 'mock', available: false, message: '客观题已判' } }] },
      }),
    });
    seedSession(wx, 'teacher');

    const teacher = await import('../../miniprogram/services/teacher');
    const outcomes = await teacher.aiGradeHomework(5);
    expect(outcomes).toEqual([{ source: 'mock', available: false, message: '客观题已判' }]);

    const [request] = wx.requestsTo('/api/homework/5/ai-grade');
    expect(request.method).toBe('POST');
    // Empty body: grade the whole sheet, and leave teacher_score columns alone.
    expect(request.data).toEqual({});
    expect(request.timeout).toBe(AI_REQUEST_TIMEOUT);
  });

  it('surfaces a refusal instead of inventing an empty attempt', async () => {
    wx = installFakeWx({
      respond: () => ({ statusCode: 403, data: { success: false, message: '无权限查看该提交' } }),
    });
    seedSession(wx, 'parent');

    const homework = await import('../../miniprogram/services/homework');

    await expect(homework.submissionDetail(21)).rejects.toThrow(/无权限查看该提交/);
  });
});
