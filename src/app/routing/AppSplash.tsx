import BrandMark from '@/components/BrandMark';
import { Skeleton, SkeletonList } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

/**
 * Full-page brand loading state, used while a console layout (or the session settings it needs) is
 * being resolved.
 *
 * The old route fallback was a bare 「正在加载...」 div and `PrivateRoute` was an unstyled
 * `Loading...`; both threw away the shell and the product's identity for the first paint after a
 * refresh. This keeps the page recognisably Think-Class while it waits.
 */
export function AppSplash({ label = '正在准备页面…' }: { label?: string }) {
  return (
    <div
      data-slot="app-splash"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface-1 text-fg-3"
      aria-busy="true"
    >
      <span className="flex size-14 items-center justify-center rounded-panel bg-role-soft text-role shadow-card">
        <BrandMark variant="glyph" className="size-8" />
      </span>
      <Spinner size="lg" label={label} />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

/**
 * Content-area skeleton for a lazily loaded page.
 *
 * It is rendered *inside* the console shell (see `AppRoutes.renderPage`), so a first visit to a
 * page replaces the content only - the rail, the context bar and the page's actions stay put.
 */
export function PageLoadingState() {
  return (
    <div
      data-slot="page-loading"
      className="mx-auto w-full max-w-page space-y-4 py-2"
      aria-busy="true"
      aria-label="页面加载中"
    >
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <SkeletonList count={4} itemClassName="h-12" />
    </div>
  );
}

export default AppSplash;
