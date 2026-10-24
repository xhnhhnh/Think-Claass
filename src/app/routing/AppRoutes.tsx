/**
 * The route renderer.
 *
 * Nothing here names a plugin: it walks `routeTable.ts` and resolves each page through the
 * page-module map. Adding a route is a table edit; adding a plugin's pages does not require
 * touching this file at all.
 *
 * ## Why the Suspense boundaries are per element
 *
 * There used to be one boundary *above* `<Routes>`. Every page is lazy, so the first visit to any
 * route suspended the whole tree: the rail and the context bar disappeared and a full-page
 * 「正在加载...」 took over, on every new page. The boundary now sits inside the routed element, so
 * the console shell stays mounted and only the content area shows a skeleton. The boundary around
 * the layout itself covers the one case where there is no shell to keep yet.
 */

import React, { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import PrivateRoute from '@/app/routing/PrivateRoute';
import { assertRoutesResolve, resolvePage } from '@/app/routing/pageModules';
import {
  flatRoutesWithAdmin,
  layoutRoutes,
  referencedPageModules,
  type LayoutRoute,
  type PageRoute,
} from '@/app/routing/routeTable';
import FeatureRouteGuard from '@/components/FeatureRouteGuard';

import { AppSplash, PageLoadingState } from './AppSplash';
import NotFoundPage from './NotFoundPage';
import { PageErrorBoundary } from './ErrorBoundary';

// Fail fast: a route path that does not resolve is a broken route, and catching it here beats
// a blank page the first time somebody navigates to it in production.
assertRoutesResolve(referencedPageModules());

/**
 * A lazily loaded page, keyed by module path.
 *
 * The cache is load-bearing: `lazy()` must be called once per module, not once per render.
 * Creating a fresh lazy component on every render would unmount and remount the page, losing
 * its state on every parent update.
 */
const lazyPages = new Map<string, React.LazyExoticComponent<React.ComponentType>>();

function lazyPage(modulePath: string): React.LazyExoticComponent<React.ComponentType> {
  const existing = lazyPages.get(modulePath);
  if (existing) return existing;

  const created = lazy(resolvePage(modulePath) as () => Promise<{ default: React.ComponentType }>);
  lazyPages.set(modulePath, created);
  return created;
}

function LazyPage({ modulePath }: { modulePath: string }) {
  const Component = lazyPage(modulePath);
  return <Component />;
}

/**
 * Wrap a page in its feature gate (when the table declares one), a content-only Suspense boundary
 * and an error boundary. The pathname is the reset key: navigating away from a crashed page should
 * try the next one instead of showing the same error.
 */
function renderPage(route: PageRoute, pathname: string) {
  const page = <LazyPage modulePath={route.component} />;
  const gated = route.feature ? (
    <FeatureRouteGuard
      role={route.feature.role}
      requirement={route.feature.requirement}
      title={route.feature.title}
    >
      {page}
    </FeatureRouteGuard>
  ) : (
    page
  );

  return (
    <PageErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoadingState />}>{gated}</Suspense>
    </PageErrorBoundary>
  );
}

/** A layout route: the layout itself is gated on roles, its children are not. */
function renderLayout(entry: LayoutRoute, pathname: string) {
  const Layout = lazyPage(entry.layout);
  const layout = (
    <Suspense fallback={<AppSplash label="正在打开控制台…" />}>
      <Layout />
    </Suspense>
  );

  const element = entry.allowedRoles ? (
    <PrivateRoute allowedRoles={entry.allowedRoles}>{layout}</PrivateRoute>
  ) : (
    layout
  );

  return (
    <Route key={entry.path} path={entry.path} element={element}>
      {entry.children.map((child) => (
        <Route
          key={child.path === '' ? `${entry.path}/(index)` : `${entry.path}/${child.path}`}
          index={child.path === ''}
          path={child.path === '' ? undefined : child.path}
          element={renderPage(child, pathname)}
        />
      ))}
    </Route>
  );
}

export default function AppRoutes() {
  // The admin path comes from the server (`window.__TC_CONFIG__.adminPath`), so the route table
  // is built per render rather than at module load. It is cheap - a handful of object literals -
  // and the alternative was freezing a per-deployment value into the bundle.
  const { pathname } = useLocation();

  return (
    <Suspense fallback={<AppSplash label="正在打开页面…" />}>
      <Routes>
        {flatRoutesWithAdmin().map((route) => (
          <Route key={route.path} path={route.path} element={renderPage(route, pathname)} />
        ))}
        {layoutRoutes().map((entry) => renderLayout(entry, pathname))}
        {/* A mistyped address used to render nothing at all. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
