import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installFakeWx } from './helpers/fake-wx';

/**
 * Which navigation call a mini program page uses is a platform rule, not a style choice:
 * `wx.switchTab` refuses every url outside `app.json`'s `tabBar.list`, and `wx.redirectTo` refuses
 * the four pages that are in it. Both mistakes shipped and both are invisible in a screenshot - the
 * tap simply did nothing.
 *
 * The fake `wx` reproduces those refusals, so these tests fail on the old calls the same way the
 * device did.
 */
interface CapturedPage {
  data: Record<string, any>;
  [method: string]: any;
}

function capturePage(): CapturedPage[] {
  const pages: CapturedPage[] = [];
  (globalThis as unknown as { Page: (config: CapturedPage) => void }).Page = (config) => {
    pages.push(config);
  };
  return pages;
}

function lastPage(pages: CapturedPage[]): CapturedPage {
  const page = pages[pages.length - 1];
  expect(page).toBeDefined();
  return page;
}

describe('mini program page navigation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('opens 我的作业 from the parent dashboard with switchTab (it is a tabBar page)', async () => {
    const fake = installFakeWx({ respond: () => ({ statusCode: 200, data: { success: true } }) });
    const pages = capturePage();

    await import('../../miniprogram/pages/parent/dashboard');
    const page = lastPage(pages);
    page.onGoHomework();

    expect(fake.switchTabs).toEqual(['/pages/student/homework']);
    expect(fake.redirects).toEqual([]);
  });

  it('opens 班级 from the teacher homework page with redirectTo (it is not a tabBar page)', async () => {
    const fake = installFakeWx({ respond: () => ({ statusCode: 200, data: { success: true } }) });
    const pages = capturePage();

    await import('../../miniprogram/pages/teacher/homework');
    const page = lastPage(pages);
    // The branch this exercises: no class chosen yet, so 去选择班级 is offered.
    const context: CapturedPage = { ...page, data: { ...page.data, classId: null, title: '作业一' } };
    await context.onCreate.call(context);

    expect(fake.redirects).toEqual(['/pages/teacher/class']);
    expect(fake.switchTabs).toEqual([]);
  });
});
