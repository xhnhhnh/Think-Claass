/**
 * Feature flags and the tab bar's visibility rule.
 *
 * The mini program's tab bar is custom (`custom-tab-bar/`) precisely because which entries exist
 * depends on the class's flags, which only the server knows. That makes this file the difference
 * between "a student sees 积分商城" and "a student taps 积分商城 and gets a 403" - and the failure
 * is invisible in a screenshot of a class that has everything switched on.
 *
 * The rule the tests pin: a flag is on only in the shapes the server actually answers
 * (`true` / `1` / `'1'` / `'true'`), an unresolved map hides every *gated* tab, and the tabs with
 * no flag behind them stay visible in every state - because hiding 我的作业 offline would be a
 * worse bug than showing it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeWx } from './helpers/fake-wx';

async function loadFeature() {
  installFakeWx({ respond: () => ({ statusCode: 200, data: { success: true } }) });
  vi.resetModules();
  return import('../../miniprogram/utils/feature');
}

async function loadStorage() {
  vi.resetModules();
  return import('../../miniprogram/utils/storage');
}

beforeEach(() => {
  vi.resetModules();
});

describe('flagOn', () => {
  it('accepts the three shapes the server answers and nothing else', async () => {
    const { flagOn } = await loadFeature();

    expect(flagOn(true)).toBe(true);
    expect(flagOn(1)).toBe(true);
    expect(flagOn('1')).toBe(true);
    expect(flagOn('true')).toBe(true);

    expect(flagOn(false)).toBe(false);
    expect(flagOn(0)).toBe(false);
    expect(flagOn('0')).toBe(false);
    expect(flagOn('')).toBe(false);
    expect(flagOn(null)).toBe(false);
    expect(flagOn(undefined)).toBe(false);
  });
});

describe('visible tabs', () => {
  it('hides every gated tab while the flags are unresolved', async () => {
    const feature = await loadFeature();
    feature.applyLoginSnapshot({}, null);

    expect(feature.visibleTabs('student').map((tab) => tab.key)).toEqual(['home', 'homework', 'me']);
    expect(feature.visibleTabs('teacher').map((tab) => tab.key)).toEqual(['class', 'homework', 'me']);
  });

  it('shows 积分商城 for a student whose class has it on', async () => {
    const feature = await loadFeature();
    feature.applyLoginSnapshot({ enable_shop: true }, 1);

    expect(feature.visibleTabs('student').map((tab) => tab.key)).toEqual([
      'home',
      'homework',
      'shop',
      'me',
    ]);
  });

  it('gates the teacher 智学看板 on enable_ai_study, in the string shape too', async () => {
    const feature = await loadFeature();

    feature.applyLoginSnapshot({ enable_ai_study: '1' }, 1);
    expect(feature.visibleTabs('teacher').map((tab) => tab.key)).toContain('insight');

    feature.applyLoginSnapshot({ enable_ai_study: false }, 1);
    expect(feature.visibleTabs('teacher').map((tab) => tab.key)).not.toContain('insight');
  });

  it('gives a parent the student tab set', async () => {
    const feature = await loadFeature();
    feature.applyLoginSnapshot({ enable_shop: true }, 1);

    expect(feature.visibleTabs('parent').map((tab) => tab.key)).toEqual([
      'home',
      'homework',
      'shop',
      'me',
    ]);
    // Staff roles are the only ones that get the teacher set.
    expect(feature.isTeacherRole('admin')).toBe(true);
    expect(feature.isTeacherRole('parent')).toBe(false);
  });

  it('lands a role on its first visible tab, and never on a hidden one', async () => {
    const feature = await loadFeature();

    feature.applyLoginSnapshot({}, null);
    expect(feature.homePathForRole('student')).toBe('/pages/student/home');
    expect(feature.homePathForRole('teacher')).toBe('/pages/teacher/class');
  });

  it('declares exactly the four tab pages app.json can switch to', async () => {
    const feature = await loadFeature();

    expect(feature.DECLARED_TAB_PAGES).toEqual([
      'pages/student/home',
      'pages/student/homework',
      'pages/student/shop',
      'pages/student/me',
    ]);

    // Every declared tab page is one of the student tabs ...
    const declared = new Set(feature.DECLARED_TAB_PAGES);
    for (const page of feature.DECLARED_TAB_PAGES) {
      expect(feature.STUDENT_TABS.some((tab) => tab.pagePath === page)).toBe(true);
    }

    // ... and a teacher-only page is never one, because the teacher set is reached with
    // `redirectTo` rather than `switchTab`. The account page is the one shared destination, which
    // is why it is excluded by name instead of by role.
    for (const tab of feature.TEACHER_TABS) {
      if (tab.pagePath === 'pages/student/me') continue;
      expect(declared.has(tab.pagePath)).toBe(false);
    }
    expect(feature.TEACHER_TABS.find((tab) => tab.key === 'me')?.pagePath).toBe('pages/student/me');
  });
});

describe('the session helpers the tabs depend on', () => {
  it('reads the class id from either spelling', async () => {
    const storage = await loadStorage();

    expect(storage.classIdOf({ id: 1, role: 'student', username: 's', classId: 7 })).toBe(7);
    expect(storage.classIdOf({ id: 1, role: 'student', username: 's', class_id: 8 })).toBe(8);
    expect(storage.classIdOf({ id: 1, role: 'student', username: 's' })).toBeNull();
    expect(storage.classIdOf(null)).toBeNull();
  });

  it('reads the linked student, and only as a number', async () => {
    const storage = await loadStorage();

    expect(storage.studentIdOf({ id: 1, role: 'student', username: 's', studentId: 10 })).toBe(10);
    expect(storage.studentIdOf({ id: 1, role: 'teacher', username: 't' })).toBeNull();
    expect(storage.studentIdOf(undefined)).toBeNull();
  });

  it('drops a corrupt session blob instead of throwing', async () => {
    const storage = await loadStorage();
    const fake = installFakeWx({ respond: () => ({ statusCode: 200, data: {} }) });
    fake.storage.set('thinkclass-mp-auth', '{not json');

    expect(storage.readSession()).toBeNull();
    expect(fake.storage.get('thinkclass-mp-auth')).toBeUndefined();
  });

  it('rejects a session without a token or a role', async () => {
    const storage = await loadStorage();
    const fake = installFakeWx({ respond: () => ({ statusCode: 200, data: {} }) });

    fake.storage.set('thinkclass-mp-auth', JSON.stringify({ token: '', user: { role: 'student' } }));
    expect(storage.readSession()).toBeNull();

    fake.storage.set('thinkclass-mp-auth', JSON.stringify({ token: 't', user: {} }));
    expect(storage.readSession()).toBeNull();
  });
});
