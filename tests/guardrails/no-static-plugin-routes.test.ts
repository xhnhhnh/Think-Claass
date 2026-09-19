/**
 * Guardrail G4 - plugin UI must be registered, never statically wired.
 *
 * Today `src/app/routing/AppRoutes.tsx` is a hardcoded JSX table with 80 <Route>
 * elements and 80 static `lazy(() => import(...))` calls, 76 of which point at
 * plugin-owned page modules. That is why a "plugin" cannot be added or removed
 * without editing core.
 *
 * After P5 the only static imports in the route layer are kernel routes; every
 * plugin route arrives through the plugin registry. This ratchet drives the
 * static plugin-owned import count to 0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { toRel } from '../../scripts/migration/lib/analysis.mjs';
import { ROOT, formatRatchet, readAllowances } from './lib/paths.mjs';

const allowances = readAllowances();

/** Route-table entry files, current and future. */
const ROUTE_ENTRY_FILES = ['src/app/routing/AppRoutes.tsx', 'apps/web/src/shell/PluginRouter.tsx'];

/** Import specifiers that belong to a plugin rather than the kernel. */
const PLUGIN_OWNED_PREFIXES = ['@/features/', '@/pages/', 'plugins/', '@/plugins/'];

const LAZY_IMPORT_RE = /lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;

describe('G4 no statically wired plugin routes', () => {
  /** @type {Array<{ file: string, spec: string }>} */
  const pluginOwned = [];

  for (const rel of ROUTE_ENTRY_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    for (const m of text.matchAll(LAZY_IMPORT_RE)) {
      if (PLUGIN_OWNED_PREFIXES.some((p) => m[1].startsWith(p))) {
        pluginOwned.push({ file: rel, spec: m[1] });
      }
    }
  }

  it('static plugin-owned route imports do not grow (target: 0 by P5)', () => {
    expect(
      pluginOwned.length,
      formatRatchet(
        'static plugin-owned route imports',
        pluginOwned.length,
        allowances.staticPluginRoutes,
        pluginOwned.map((p) => `${p.file}  ->  ${p.spec}`),
      ),
    ).toBeLessThanOrEqual(allowances.staticPluginRoutes);
  });

  it('the route entry file exists (informational)', () => {
    const present = ROUTE_ENTRY_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)));
    expect(present.length).toBeGreaterThan(0);
    console.info(
      `[G4] route entry files present: ${present.map((f) => toRel(ROOT, path.join(ROOT, f))).join(', ')}`,
    );
  });
});
