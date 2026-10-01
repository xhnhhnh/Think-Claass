/**
 * The class a teacher's session works on.
 *
 * A student's login payload carries `classId`; a teacher's cannot (one teacher owns several
 * classes). Every teacher-side screen that needs one - 发布作业, 智学看板, the roster - therefore
 * depended on this module, and the two that used a hard-coded fallback hid the gap: publishing
 * refused with 「当前账号还没有班级」, and the AI board's tab never appeared because the live
 * `GET /api/classes/:id/features` call was skipped for want of a class id.
 *
 * These tests pin the resolution order, the remembered choice, and the one production symptom that
 * matters most: a teacher's tab bar contains 智学看板 once the flags can be resolved.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeWx, type FakeWx } from './helpers/fake-wx';

interface SessionOverrides {
  role?: string;
  classId?: number | null;
  classFeatures?: Record<string, boolean>;
}

/** Write a session into the fake storage, exactly as `writeSession` would. */
function seedSession(wx: FakeWx, overrides: SessionOverrides = {}) {
  const role = overrides.role ?? 'teacher';
  wx.storage.set(
    'thinkclass-mp-auth',
    JSON.stringify({
      token: 'token-1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      user: {
        id: 5,
        username: role === 'teacher' ? 'teacher1' : 'student1',
        role,
        ...(overrides.classId === undefined ? {} : { classId: overrides.classId }),
      },
      classFeatures: overrides.classFeatures ?? {},
    }),
  );
}

describe('class context', () => {
  let wx: FakeWx;

  beforeEach(() => {
    vi.resetModules();
  });

  it('takes a student’s own class from the session, without a request', async () => {
    wx = installFakeWx({ respond: () => ({ statusCode: 200, data: { success: true } }) });
    seedSession(wx, { role: 'student', classId: 7 });

    const { ensureClassId } = await import('../../miniprogram/utils/classContext');
    expect(await ensureClassId()).toBe(7);
    expect(wx.requestsTo('/api/classes')).toHaveLength(0);
  });

  it('asks for the teacher’s classes once, and remembers the first', async () => {
    wx = installFakeWx({
      respond: (request) =>
        request.url.includes('/api/classes')
          ? { statusCode: 200, data: { success: true, classes: [{ id: 3, name: '三班' }, { id: 4, name: '四班' }] } }
          : { statusCode: 200, data: { success: true } },
    });
    seedSession(wx);

    const { ensureClassId, currentClassId } = await import('../../miniprogram/utils/classContext');
    expect(await ensureClassId()).toBe(3);
    expect(currentClassId()).toBe(3);
    // Remembered: the second call is answered from memory, not from the network.
    expect(await ensureClassId()).toBe(3);
    expect(wx.requestsTo('/api/classes')).toHaveLength(1);
    // ...and persisted, so the next launch does not have to ask either. Stored as a number: the
    // reader accepts both shapes, and `wx.setStorageSync` keeps the type it is given.
    expect(Number(wx.storage.get('thinkclass-mp-class'))).toBe(3);
  });

  it('keeps an explicitly chosen class, and replaces it when it no longer exists', async () => {
    wx = installFakeWx({
      respond: (request) =>
        request.url.includes('/api/classes')
          ? { statusCode: 200, data: { success: true, classes: [{ id: 9, name: '九班' }] } }
          : { statusCode: 200, data: { success: true } },
    });
    seedSession(wx);
    wx.storage.set('thinkclass-mp-class', '3');

    const { ensureClassId, selectClassId } = await import('../../miniprogram/utils/classContext');
    // A stored choice is trusted without a round trip...
    expect(await ensureClassId()).toBe(3);
    // ...until it is re-validated: class 3 is gone, so the teacher's only class wins.
    expect(await ensureClassId({ force: true })).toBe(9);

    // A deliberate switch sticks.
    selectClassId(9);
    expect(await ensureClassId()).toBe(9);
  });

  it('survives an unreachable class list by keeping the remembered class', async () => {
    wx = installFakeWx({ respond: () => ({ fail: true }) });
    seedSession(wx);
    wx.storage.set('thinkclass-mp-class', '6');

    const { ensureClassId } = await import('../../miniprogram/utils/classContext');
    expect(await ensureClassId({ force: true })).toBe(6);
  });

  it('answers null for a teacher who owns no class', async () => {
    wx = installFakeWx({
      respond: () => ({ statusCode: 200, data: { success: true, classes: [] } }),
    });
    seedSession(wx);

    const { ensureClassId } = await import('../../miniprogram/utils/classContext');
    expect(await ensureClassId({ force: true })).toBeNull();
  });

  it('drops the remembered class with the session', async () => {
    wx = installFakeWx({ respond: () => ({ statusCode: 200, data: { success: true } }) });
    seedSession(wx);
    wx.storage.set('thinkclass-mp-class', '3');

    const { clearSession } = await import('../../miniprogram/utils/storage');
    clearSession();

    // The next account on this device must not inherit another teacher's class.
    expect(wx.storage.get('thinkclass-mp-class')).toBeUndefined();
  });
});

describe('the teacher tab bar once a class is known', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('hides the student-only tabs from a parent, whatever the flags say', async () => {
    const wx = installFakeWx({ respond: () => ({ statusCode: 200, data: { success: true } }) });
    wx.storage.set(
      'thinkclass-mp-auth',
      JSON.stringify({
        token: 'token-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: { id: 8, username: 'parent1', role: 'parent', studentId: 7, classId: 1 },
        classFeatures: { enable_shop: true, enable_ai_study: true },
      }),
    );

    const feature = await import('../../miniprogram/utils/feature');
    feature.applyLoginSnapshot({ enable_shop: true }, 1);

    // The shop is student-only on the server: a parent tapping it got a 403.
    expect(feature.visibleTabs('parent').map((tab) => tab.key)).toEqual(['home', 'homework', 'me']);
    expect(feature.visibleTabs('student').map((tab) => tab.key)).toEqual(['home', 'homework', 'shop', 'me']);
  });

  it('resolves the flags through the class context, so 智学看板 is reachable', async () => {
    const wx = installFakeWx({
      respond: (request) => {
        if (request.url.includes('/features')) {
          return { statusCode: 200, data: { success: true, classId: 3, features: { enable_ai_study: true } } };
        }
        if (request.url.includes('/api/classes')) {
          return { statusCode: 200, data: { success: true, classes: [{ id: 3, name: '三班' }] } };
        }
        return { statusCode: 200, data: { success: true } };
      },
    });
    // A teacher's session: no classId, no login-time feature snapshot - the state that used to
    // leave `enable_ai_study` permanently unresolved.
    wx.storage.set(
      'thinkclass-mp-auth',
      JSON.stringify({
        token: 'token-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: { id: 5, username: 'teacher1', role: 'teacher' },
        classFeatures: {},
      }),
    );

    const feature = await import('../../miniprogram/utils/feature');
    const resolution = await feature.resolveFeatures({ force: true });

    expect(resolution.source).toBe('class');
    expect(resolution.classId).toBe(3);
    expect(feature.visibleTabs('teacher').map((tab) => tab.key)).toEqual(['class', 'homework', 'insight', 'me']);
    expect(feature.visibleTabs('teacher').map((tab) => tab.pagePath)).toContain('pages/teacher/ai-insight');
  });

  it('never serves another class’s cached flags to a class-less session', async () => {
    const wx = installFakeWx({
      respond: (request) =>
        request.url.includes('/api/classes')
          ? { statusCode: 200, data: { success: true, classes: [] } }
          : { statusCode: 200, data: { success: true } },
    });
    // A cache left behind by whoever used this device before.
    wx.storage.set(
      'thinkclass-mp-features',
      JSON.stringify({ classId: 1, features: { enable_ai_study: true, enable_shop: true }, fetchedAt: Date.now() }),
    );
    wx.storage.set(
      'thinkclass-mp-auth',
      JSON.stringify({
        token: 'token-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: { id: 5, username: 'teacher1', role: 'teacher' },
        classFeatures: {},
      }),
    );

    const feature = await import('../../miniprogram/utils/feature');
    const resolution = await feature.resolveFeatures({ force: true });

    // `classId === null` used to accept any cached answer, which is how a teacher's bar showed the
    // previous account's tabs.
    expect(resolution.source).toBe('unknown');
    expect(feature.visibleTabs('teacher').map((tab) => tab.key)).toEqual(['class', 'homework', 'me']);
  });
});
