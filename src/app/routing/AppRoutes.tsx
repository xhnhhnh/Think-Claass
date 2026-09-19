/**
 * The route renderer.
 *
 * Nothing here names a plugin: it walks `routeTable.ts` and resolves each page through the
 * page-module map. Adding a route is a table edit; adding a plugin's pages does not require
 * touching this file at all.
 */

import React, { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import PrivateRoute from '@/app/routing/PrivateRoute';
import { assertRoutesResolve, resolvePage } from '@/app/routing/pageModules';
import {
  flatRoutes,
  layoutRoutes,
  referencedPageModules,
  type LayoutRoute,
  type PageRoute,
} from '@/app/routing/routeTable';
import FeatureRouteGuard from '@/components/FeatureRouteGuard';

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

/** Wrap a page in its feature gate when the table declares one. */
function renderPage(route: PageRoute) {
  const page = <LazyPage modulePath={route.component} />;
  if (!route.feature) return page;

  return (
    <FeatureRouteGuard
      role={route.feature.role}
      requirement={route.feature.requirement}
      title={route.feature.title}
    >
      {page}
    </FeatureRouteGuard>
  );
}

/** A layout route: the layout itself is gated on roles, its children are not. */
function renderLayout(entry: LayoutRoute) {
  const Layout = lazyPage(entry.layout);

  const element = entry.allowedRoles ? (
    <PrivateRoute allowedRoles={entry.allowedRoles}>
      <Layout />
    </PrivateRoute>
  ) : (
    <Layout />
  );

  return (
    <Route key={entry.path} path={entry.path} element={element}>
      {entry.children.map((child) => (
        <Route
          key={child.path === '' ? `${entry.path}/(index)` : `${entry.path}/${child.path}`}
          index={child.path === ''}
          path={child.path === '' ? undefined : child.path}
          element={renderPage(child)}
        />
      ))}
    </Route>
  );
}

function RouteLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      正在加载...
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingState />}>
      <Routes>
        {flatRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={renderPage(route)} />
        ))}
        {layoutRoutes.map(renderLayout)}
      </Routes>
    </Suspense>
  );
}
