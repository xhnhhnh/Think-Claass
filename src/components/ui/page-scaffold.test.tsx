/**
 * The page template and the actions portal.
 *
 * These are the two pieces every migrated page depends on, and both have a failure mode that
 * only shows up in a browser, so the assertions here are deliberately about the parts jsdom
 * *can* see - which is the contract rather than the geometry:
 *
 *   - `PageScaffold` renders its content for every variant, and an immersive page is not
 *     wrapped in padding or a measure;
 *   - a page's actions are rendered inline when no shell is above, and into the shell's outlet
 *     when there is one;
 *   - the inline fallback means a page test that mounts a page alone still finds its buttons,
 *     which is what keeps 76 tests from having to build a shell to press Save.
 *
 * The geometry - that the context bar is 56 pixels, that the dock is pinned, that a portalled
 * heading is not clipped - is `npm run shell:verify`'s job, because jsdom reports every box as
 * 0x0 and would pass any assertion about position.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PageActionsOutlet,
  PageActionsProvider,
  __setOutletStoreForTest,
} from '@/components/ui/page-actions';
import { PageScaffold } from '@/components/ui/page-scaffold';

/**
 * Each test gets its own outlet store.
 *
 * The store is module-level by design - one shell per document - so without this a test that
 * mounted a shell would leave its outlet installed for the next one, and the "inline when no
 * shell is above" case would pass or fail depending on which tests ran before it.
 */
afterEach(() => {
  __setOutletStoreForTest();
});

describe('PageScaffold', () => {
  it('renders its content for every variant', () => {
    const variants = ['dashboard', 'list', 'detail', 'form', 'immersive'] as const;

    for (const variant of variants) {
      const { unmount } = render(
        <PageScaffold variant={variant}>
          <p>内容 {variant}</p>
        </PageScaffold>,
      );
      expect(screen.getByText(`内容 ${variant}`)).toBeTruthy();
      unmount();
    }
  });

  it('marks the variant it was given', () => {
    const { container } = render(
      <PageScaffold variant="immersive">
        <canvas />
      </PageScaffold>,
    );
    expect(container.querySelector('[data-variant="immersive"]')).toBeTruthy();
  });

  it('renders a heading only when no shell owns one', () => {
    // Standalone (which is what a page test is) the scaffold supplies the heading...
    const { unmount } = render(
      <PageScaffold title="我的页面">
        <p>body</p>
      </PageScaffold>,
    );
    expect(screen.getByRole('heading', { level: 1, name: '我的页面' })).toBeTruthy();
    unmount();

    // ...and with a shell above it does not, because the context bar already renders the h1
    // from the route table. Two of them is the defect this refactor exists to remove.
    render(
      <PageActionsProvider>
        <PageActionsOutlet />
        <PageScaffold title="我的页面">
          <p>body</p>
        </PageScaffold>
      </PageActionsProvider>,
    );
    expect(screen.queryByRole('heading', { level: 1, name: '我的页面' })).toBeNull();
  });

  it('renders a form footer as an action bar', () => {
    render(
      <PageScaffold variant="form" footer={<button type="button">保存</button>}>
        <p>fields</p>
      </PageScaffold>,
    );
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy();
  });

  it('does not render a footer on a variant that has no action bar', () => {
    // The footer is the `form` variant's contract; rendering it on a dashboard would put a
    // stray sticky bar under a card grid.
    render(
      <PageScaffold variant="dashboard" footer={<button type="button">保存</button>}>
        <p>cards</p>
      </PageScaffold>,
    );
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
  });
});

describe('page actions', () => {
  it('renders inline when no shell is above, so a page test can still press Save', () => {
    render(
      <PageScaffold actions={<button type="button">新建</button>}>
        <p>body</p>
      </PageScaffold>,
    );

    const button = screen.getByRole('button', { name: '新建' });
    expect(button).toBeTruthy();
    // Inline means it is inside the scaffold's own subtree, not portalled out of it.
    expect(button.closest('[data-slot="page-scaffold"]')).toBeTruthy();
  });

  it('moves them into the shell outlet when one is present', () => {
    render(
      <PageActionsProvider>
        <div data-testid="bar">
          <PageActionsOutlet />
        </div>
        <PageScaffold actions={<button type="button">新建</button>}>
          <p>body</p>
        </PageScaffold>
      </PageActionsProvider>,
    );

    const button = screen.getByRole('button', { name: '新建' });
    const outlet = document.querySelector('[data-slot="page-actions"]');
    expect(outlet).toBeTruthy();
    // Portalled: the button lives under the outlet, not under the scaffold.
    expect(outlet?.contains(button)).toBe(true);
    expect(button.closest('[data-slot="page-scaffold"]')).toBeNull();
  });

  it('keeps an immersive page\'s actions reachable instead of dropping them', () => {
    /*
     * The bug this pins: the immersive branch of `PageScaffold` first rendered only its
     * children, and the immersive shell had no outlet, so a page that passed `actions` lost
     * its buttons with nothing failing anywhere. Found by the agent that migrated the twelve
     * student game pages, and it is exactly the class of defect that a screenshot of a
     * mostly-correct page does not reveal.
     */
    render(
      <PageActionsProvider>
        <div data-testid="immersive-chrome">
          <PageActionsOutlet />
        </div>
        <PageScaffold variant="immersive" actions={<button type="button">切换资源</button>}>
          <canvas />
        </PageScaffold>
      </PageActionsProvider>,
    );

    const outlet = document.querySelector('[data-slot="page-actions"]');
    const button = screen.getByRole('button', { name: '切换资源' });
    expect(outlet?.contains(button)).toBe(true);
  });

  it('renders an immersive page\'s actions inline with no shell at all', () => {
    render(
      <PageScaffold variant="immersive" actions={<button type="button">切换资源</button>}>
        <canvas />
      </PageScaffold>,
    );
    expect(screen.getByRole('button', { name: '切换资源' })).toBeTruthy();
  });
});
