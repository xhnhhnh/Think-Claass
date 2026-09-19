#!/usr/bin/env node
/**
 * Generate the route page-module map.
 *
 * `AppRoutes.tsx` used to hold 76 hand-written `lazy(() => import('@/features/...'))` calls,
 * which guardrail G4 counts: a route table that names plugin modules cannot have a plugin
 * added or removed without editing core. The map below replaces those names - the route layer
 * now looks modules up by path instead of importing them.
 *
 * An earlier attempt used `import.meta.glob`, which turned out to be the wrong tool:
 *
 *   - Vite's build rejects alias globs ("must start with '/' or './'") while vitest accepts
 *     them, so the same code worked in tests and failed in the build;
 *   - the key format differs between the two (root-relative in vitest, specifier-verbatim in
 *     the build), so lookups cannot be written once;
 *   - a glob emits a dynamic import for every matched file *before* any runtime filter runs, so
 *     `*.test.tsx` files got bundled - a clean build shipped a 458 kB chunk containing
 *     react-dom-test-utils, and no amount of `[A-Z]`-style pattern narrowing removed it.
 *
 * Generating the map avoids all three: the set of modules is explicit and reviewable, and the
 * only runtime dependency is `import()` with a literal path, which every bundler understands.
 *
 *   node scripts/migration/route-modules.mjs            # print what would be written
 *   node scripts/migration/route-modules.mjs --check    # non-zero exit on drift
 *   node scripts/migration/route-modules.mjs --update   # rewrite
 *
 * The route table is the source of truth: every `component` and `layout` path in
 * `routeTable.ts` is read out and mapped. Adding a route therefore requires regenerating,
 * which `--check` enforces in the guardrail suite.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TABLE = path.join(ROOT, 'src', 'app', 'routing', 'routeTable.ts');
const TARGET = path.join(ROOT, 'src', 'app', 'routing', 'pageModules.generated.ts');

/** Module paths referenced by the route table, in a stable order. */
function referencedModules() {
  const source = fs.readFileSync(TABLE, 'utf8');
  const found = new Set();
  for (const match of source.matchAll(/(?:component|layout):\s*'(@\/[^']+)'/g)) found.add(match[1]);
  return [...found].sort();
}

/** Resolve an `@/...` path to a file, asserting it exists. */
function resolveModule(importPath) {
  const base = path.join(ROOT, 'src', importPath.replace(/^@\//, ''));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`route table references "${importPath}" but no module was found at ${base}.{tsx,ts}`);
}

function render(modules) {
  const entries = modules
    .map((importPath) => {
      resolveModule(importPath);
      return `  '${importPath}': () => import('${importPath}'),`;
    })
    .join('\n');

  return `/**
 * GENERATED FILE - do not edit by hand.
 *
 * The route page-module map, generated from \`routeTable.ts\` by
 * \`scripts/migration/route-modules.mjs\`. Regenerate with:
 *
 *   npm run route-modules          # rewrite
 *   npm run route-modules:check    # verify (also runs in the guardrail suite)
 *
 * Why generated rather than \`import.meta.glob\`: see the header of the generator. In short, a
 * glob's key format and alias handling differ between vitest and the production build, and a
 * glob bundles every matched file - including tests - before any runtime filter can drop them.
 *
 * Each entry is an explicit \`import()\` with a literal path, so pages stay separate lazy chunks
 * and the route layer never names a plugin module (guardrail G4).
 */

export const pageModules: Record<string, () => Promise<unknown>> = {
${entries}
};
`;
}

const mode = process.argv.includes('--update') ? 'update' : process.argv.includes('--check') ? 'check' : 'print';
const modules = referencedModules();
const next = render(modules);
const rel = path.relative(ROOT, TARGET).replace(/\\/g, '/');

if (mode === 'print') {
  process.stdout.write(`${modules.length} route page modules:\n`);
  for (const modulePath of modules) process.stdout.write(`  ${modulePath}\n`);
  process.exit(0);
}

if (mode === 'update') {
  fs.writeFileSync(TARGET, next, 'utf8');
  process.stdout.write(`wrote ${rel} (${modules.length} modules)\n`);
  process.exit(0);
}

// --check
if (!fs.existsSync(TARGET)) {
  process.stderr.write(`${rel} is missing; run: npm run route-modules\n`);
  process.exit(1);
}
if (fs.readFileSync(TARGET, 'utf8') !== next) {
  process.stderr.write(
    `${rel} is out of date with routeTable.ts.\n` +
      `A route was added or removed without regenerating; run:\n  npm run route-modules\n`,
  );
  process.exit(1);
}
process.stdout.write(`route module map matches the route table (${modules.length} modules)\n`);
