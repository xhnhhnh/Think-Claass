/**
 * Page-module lookup for the route layer.
 *
 * The map itself is generated from `routeTable.ts` (see `pageModules.generated.ts`), so the set
 * of modules the router can load is explicit rather than discovered by a glob. The header of
 * `scripts/migration/route-modules.mjs` records why a glob was the wrong tool; the short version
 * is that its key format and alias handling differ between vitest and the production build, and
 * it bundles every matched file - tests included - before any filter can drop them.
 *
 * What matters for guardrail G4 is that `AppRoutes.tsx` no longer *names* plugin modules: it
 * asks this module for one by path.
 */

import { pageModules } from '@/app/routing/pageModules.generated';

export { pageModules };

type PageModule = { default: React.ComponentType<Record<string, unknown>> };

/**
 * Resolve a module by its `@/...` path.
 *
 * Throws rather than returning undefined: a route whose page module is missing is a broken
 * route, and failing with the path in the message beats a blank screen.
 */
export function resolvePage(importPath: string): () => Promise<PageModule> {
  const factory = pageModules[importPath];
  if (typeof factory !== 'function') {
    throw new Error(
      `no page module found for "${importPath}". If the file exists, add the route and run ` +
        '`npm run route-modules` to regenerate the map.',
    );
  }
  return factory as () => Promise<PageModule>;
}

/**
 * Every route path must resolve, checked once at module load.
 *
 * A typo would otherwise surface as a runtime error the first time someone visits that page - in
 * production, a blank screen for one route and nothing useful in the logs.
 */
export function assertRoutesResolve(importPaths: Iterable<string>): void {
  const missing: string[] = [];
  for (const importPath of importPaths) {
    if (typeof pageModules[importPath] !== 'function') missing.push(importPath);
  }
  if (missing.length > 0) {
    throw new Error(
      `the route table references ${missing.length} page module(s) that do not exist:\n  ${missing.join('\n  ')}`,
    );
  }
}
