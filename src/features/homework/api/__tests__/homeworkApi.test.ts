import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
  apiDelete: mocks.apiDelete,
}));

import { homeworkApi } from '../homeworkApi';

/**
 * The client is a route table, so the test is a route table: every assertion below is one line
 * of `plugins/homework/plugin.json`, spelled the same way. A typo in a path or a wrong verb is
 * invisible to the type checker (`apiGet<T>` accepts any string) and only shows up as a 404 in
 * production, which is exactly why each of the sixteen routes is named here.
 *
 * The envelope assertions are the second half. `src/lib/api` returns the *whole*
 * `{ success, data }` body, and the manifest's `_envelope_note` says there are no flattened
 * duplicate keys on these new routes - so the client must not flatten either, and every caller
 * unwraps `.data` itself. `unwrap` below is the one place that shape is asserted.
 */
describe('homeworkApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiDelete.mockReset();
    mocks.apiGet.mockResolvedValue({ success: true, data: [] });
    mocks.apiPost.mockResolvedValue({ success: true, data: {} });
    mocks.apiPut.mockResolvedValue({ success: true, data: {} });
    mocks.apiDelete.mockResolvedValue({ success: true, data: { deleted: true } });
  });

  describe('routes', () => {
    it('lists the teacher’s homework', async () => {
      await homeworkApi.list();
      expect(mocks.apiGet).toHaveBeenCalledWith('/api/homework');
    });

    it('lists the signed-in student’s homework', async () => {
      await homeworkApi.listMine();
      expect(mocks.apiGet).toHaveBeenCalledWith('/api/homework/my');
    });

    it('reads one homework with its questions', async () => {
      await homeworkApi.detail(7);
      expect(mocks.apiGet).toHaveBeenCalledWith('/api/homework/7');
    });

    it('publishes a homework', async () => {
      const payload = { class_id: 3, title: '第三章练习', status: 'published' as const };
      await homeworkApi.create(payload);
      expect(mocks.apiPost).toHaveBeenCalledWith('/api/homework', payload);
    });

    it('edits a homework', async () => {
      const payload = { title: '改过的标题', questions: [] };
      await homeworkApi.update(7, payload);
      expect(mocks.apiPut).toHaveBeenCalledWith('/api/homework/7', payload);
    });

    it('deletes a homework', async () => {
      await homeworkApi.remove(7);
      expect(mocks.apiDelete).toHaveBeenCalledWith('/api/homework/7');
    });

    it('reads the grade sheet', async () => {
      await homeworkApi.listSubmissions(7);
      expect(mocks.apiGet).toHaveBeenCalledWith('/api/homework/7/submissions');
    });

    it('asks for AI grading, scoped to one submission by the caller', async () => {
      const payload = { submission_ids: [11], overwrite_teacher: false };
      await homeworkApi.aiGrade(7, payload);
      expect(mocks.apiPost).toHaveBeenCalledWith('/api/homework/7/ai-grade', payload);
    });

    it('asks for 出题 on the one route with no homework id', async () => {
      const payload = { topic: '分数的加减法', count: 5, hint: '每题 5 分' };
      await homeworkApi.generateQuestions(payload);

      // No `:id` in the path, because generation persists nothing: it serves the publish dialog
      // (where no homework exists yet) and the edit dialog alike, and the id would only be context.
      expect(mocks.apiPost).toHaveBeenCalledWith('/api/homework/ai/questions', payload);
    });

    it('reads the AI question thread', async () => {
      await homeworkApi.listQa(7);
      expect(mocks.apiGet).toHaveBeenCalledWith('/api/homework/7/qa');
    });

    it('names the pupil when staff read a thread, and omits the query for a student', async () => {
      // The route is the same one; who is asking decides whether `student_id` is required (staff must
      // name a pupil), forbidden (a student naming someone else is refused) or pointless (a parent is
      // pinned to their own child). Sending the query only when a pupil is named is what keeps those
      // three cases from collapsing into one another on the wire.
      await homeworkApi.listQa(7, 10);
      expect(mocks.apiGet).toHaveBeenLastCalledWith('/api/homework/7/qa?student_id=10');

      await homeworkApi.listQa(7);
      expect(mocks.apiGet).toHaveBeenLastCalledWith('/api/homework/7/qa');
    });

    it('asks the assistant a question', async () => {
      const payload = { content: '第三题怎么做？', question_id: 42 };
      await homeworkApi.askQa(7, payload);
      expect(mocks.apiPost).toHaveBeenCalledWith('/api/homework/7/qa', payload);
    });

    it('starts or resumes an attempt', async () => {
      await homeworkApi.startAttempt(7);
      expect(mocks.apiPost).toHaveBeenCalledTimes(1);
      // Asserted through `mock.calls` rather than `toHaveBeenCalledWith`: the route takes no
      // body, so the call has one argument and an expectation listing two would not match.
      expect(mocks.apiPost.mock.calls[0][0]).toBe('/api/homework/7/attempt');
    });

    it('reads one submission', async () => {
      await homeworkApi.getSubmission(11);
      expect(mocks.apiGet).toHaveBeenCalledWith('/api/homework/submissions/11');
    });

    it('grades a submission', async () => {
      const payload = {
        status: 'graded' as const,
        teacher_feedback: '写得不错',
        answers: [{ answer_id: 5, teacher_score: 8, teacher_comment: '步骤清楚' }],
      };
      await homeworkApi.gradeSubmission(11, payload);
      expect(mocks.apiPut).toHaveBeenCalledWith('/api/homework/submissions/11', payload);
    });

    it('auto-saves answers', async () => {
      const payload = { answers: [{ question_id: 42, value: { text: '光合作用' } }] };
      await homeworkApi.saveAnswers(11, payload);
      expect(mocks.apiPut).toHaveBeenCalledWith('/api/homework/submissions/11/answers', payload);
    });

    it('uploads a photo as multipart FormData', async () => {
      const formData = new FormData();
      formData.append('file', new File(['x'], 'paper.png', { type: 'image/png' }));
      await homeworkApi.uploadPhoto(11, formData);
      expect(mocks.apiPost).toHaveBeenCalledWith('/api/homework/submissions/11/photos', formData);
    });

    it('submits the attempt with whole-paper photo ids', async () => {
      const payload = { answers: [], photo_ids: [3, 4] };
      await homeworkApi.submitAttempt(11, payload);
      expect(mocks.apiPost).toHaveBeenCalledWith('/api/homework/submissions/11/submit', payload);
    });
  });

  describe('envelopes', () => {
    /** The one unwrap every caller performs: `(await api.x()).data`. */
    const unwrap = <T>(response: { success: true; data: T }): T => response.data;

    it('returns the whole envelope, leaving `.data` to the caller', async () => {
      const entry = { id: 7, title: '第三章练习' } as never;
      mocks.apiGet.mockResolvedValue({ success: true, data: [entry] });

      const response = await homeworkApi.list();
      expect(response).toEqual({ success: true, data: [entry] });
      expect(unwrap(response)).toEqual([entry]);
    });

    it('adds no keys of its own to the envelope', async () => {
      // The claim is about what THIS client does, so the fixture must be a plain envelope: giving
      // the mock extra keys and then asserting they are gone would be testing the mock, not the
      // client. What matters is that `homeworkApi` passes the envelope through untouched - the
      // legacy `assignments` plugin spread its payload into the envelope server-side, and nothing
      // here reproduces that.
      mocks.apiGet.mockResolvedValue({ success: true, data: [] });

      const response = await homeworkApi.list();
      expect(Object.keys(response).sort()).toEqual(['data', 'success']);
      expect(Object.keys(response.data as object)).toEqual([]);
    });

    it('propagates a failure instead of inventing an empty list', async () => {
      mocks.apiGet.mockRejectedValue(new Error('请求失败'));

      await expect(homeworkApi.list()).rejects.toThrow('请求失败');
    });

    it('carries the AI outcome inside a successful body', async () => {
      const ai = { source: 'mock', available: false, confidence: null, message: '当前为模拟判分' };
      mocks.apiPost.mockResolvedValue({ success: true, data: { submission: { id: 11 }, answers: [], ai } });

      const response = await homeworkApi.aiGrade(7, { submission_ids: [11] });
      expect(response.data.ai.available).toBe(false);
      expect(response.data.ai.message).toBe('当前为模拟判分');
    });
  });
});
