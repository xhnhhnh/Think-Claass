import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Page-level actions, lifted into the context bar.
 *
 * ## The problem this solves
 *
 * The previous shell rendered a page title in its header, and each of the ~76 pages rendered
 * its *own* page header with the same title again and its buttons beside it. Two consequences,
 * both visible on every screen: the title was printed twice, and the primary action ("新建班级",
 * "导出", "保存") sat in the middle of the page instead of where an application puts it.
 *
 * ## Why a portal rather than lifted state
 *
 * A page is rendered by `<Outlet />` from the route table, so the shell cannot hand it props.
 * Passing the actions *up* through callbacks was possible, but it renders them in the shell's
 * React tree: a page's own state that produced them (selected rows, a Save disabled while a
 * mutation is in flight) would then be read from wherever the shell mounted, not from the page.
 * The portal keeps the actions in the page's tree and gives the shell only a destination - the
 * same mechanism the mobile dock and every dialog already use.
 *
 * ## How the destination is published, and why not a ref
 *
 * The first version put the outlet element in a `useRef` and had the page read
 * `ref.current` during render. That works in the browser - the outlet is earlier in the tree,
 * so its ref callback has already run when the page renders - but it is relying on commit
 * ordering that React does not promise, and it failed under React 18's development
 * behaviour in tests: the page read `null`, took the inline fallback, and the actions never
 * appeared in the bar.
 *
 * `useSyncExternalStore` is the mechanism that matches the requirement. It gives a consumer
 * the current value during render *and* re-renders it when the value changes, without the
 * provider re-rendering every page in between. The module-level store below is deliberately
 * overridable (`__setOutletStoreForTest`): with a module-level store, two providers in one
 * process share one outlet, and the alternative - a store created per provider and passed
 * through context - is what a test cannot easily install before the component tree is built.
 *
 * ## The fallback matters as much as the portal
 *
 * `PageActions` renders inline when no shell is above it. That is not a nicety: every page
 * test mounts a page *without* the shell, and an actions slot that vanished without a context
 * bar would make the primary action of 76 pages untestable - and the tests would still pass,
 * because a missing button is not a failure unless somebody asserted it.
 */

interface OutletStore {
  get: () => HTMLElement | null;
  set: (node: HTMLElement | null) => void;
  subscribe: (listener: () => void) => () => void;
}

function createOutletStore(): OutletStore {
  let node: HTMLElement | null = null;
  const listeners = new Set<() => void>();

  return {
    get: () => node,
    set: (next) => {
      if (node === next) return;
      node = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let outletStore: OutletStore = createOutletStore();

/**
 * Install a fresh outlet store. Intended for tests.
 *
 * The shell does not need this - one provider per document is the real topology - but a test
 * file that renders two shells in sequence would otherwise share the first one's outlet.
 * Returning the previous store lets a test restore it.
 */
export function __setOutletStoreForTest(store?: OutletStore): OutletStore {
  const previous = outletStore;
  outletStore = store ?? createOutletStore();
  return previous;
}

const PageActionsContext = createContext<{ present: boolean }>({ present: false });

/**
 * Marks the subtree as having a shell, so a component can suppress a duplicate heading.
 *
 * The provider does not carry the element itself: that lives in the store, and consumers read
 * it through `useSyncExternalStore` so they re-render when it attaches.
 */
export function PageActionsProvider({ children }: { children: ReactNode }) {
  const value = useState(() => ({ present: true }))[0];
  return <PageActionsContext.Provider value={value}>{children}</PageActionsContext.Provider>;
}

/**
 * Where the context bar receives page actions.
 *
 * Rendered by the shell. It stays an empty, sized element when a page contributes nothing, so
 * the bar does not reflow the first time a page does - a context bar that jumps on navigation
 * is worse than an empty slot.
 */
export function PageActionsOutlet({ className }: { className?: string }) {
  const attach = useCallback((node: HTMLDivElement | null) => {
    outletStore.set(node);
  }, []);

  // A ref callback, not an effect: it runs during the commit that mounts the outlet, which is
  // before any page effect, and the store notifies its subscribers itself.
  useEffect(() => () => outletStore.set(null), []);

  return <div data-slot="page-actions" className={className} ref={attach} />;
}

/** The outlet element, or `null` when no shell is above. Re-renders on attach/detach. */
function useOutletElement(): HTMLElement | null {
  const context = useContext(PageActionsContext);
  return useSyncExternalStore(
    outletStore.subscribe,
    () => (context.present ? outletStore.get() : null),
    () => null,
  );
}

/**
 * Render `children` into the context bar, or inline when there is no shell.
 *
 * ## Why the portalled wrapper needs its own layout
 *
 * The browser positions a portal's DOM node wherever the DOM puts it, not wherever the
 * component sits in the JSX tree, so anything a portal renders has to arrange itself. Without
 * the flex row below, a portalled `PageHeader` landed at its *source* x-position inside the
 * context bar and was clipped by the bar's height: measured in a real browser at 1440x900, an
 * `h2` with an icon and a description came out 60 pixels tall in a 53-pixel bar, sitting at
 * x=803 rather than beside the title. That is the kind of defect only a real renderer shows -
 * jsdom reports every box as 0x0, so no unit test can see it.
 */
export function PageActions({
  children,
  /**
   * `slot` is a page's heading, `actions` is its buttons.
   *
   * The two need different layouts once portalled - a heading sits in the reading order, buttons
   * are pushed to the trailing edge - and the distinction is made here rather than by each
   * caller so the bar cannot end up with two different alignments.
   */
  kind = 'slot',
}: {
  children: ReactNode;
  kind?: 'slot' | 'actions';
}) {
  const target = useOutletElement();
  const inlineClass =
    kind === 'actions' ? 'flex min-w-0 flex-wrap items-center gap-2' : 'flex min-w-0 items-center gap-2';

  if (target) {
    return createPortal(
      <div
        className={
          kind === 'actions' ? 'ml-auto flex shrink-0 items-center gap-2' : 'flex min-w-0 items-center gap-2'
        }
        data-slot={kind === 'actions' ? 'page-actions-portal' : 'page-heading-portal'}
      >
        {children}
      </div>,
      target,
    );
  }

  return (
    <div className={inlineClass} data-slot={`page-actions-inline-${kind}`}>
      {children}
    </div>
  );
}

/**
 * Whether a context bar is above this page.
 *
 * Used to suppress a duplicate heading, never to hide actions: they have somewhere to go
 * either way.
 */
export function useHasPageActionsOutlet(): boolean {
  return useContext(PageActionsContext).present;
}
