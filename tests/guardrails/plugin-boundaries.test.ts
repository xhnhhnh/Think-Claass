/**
 * Guardrail G1 + G2 - plugin and kernel boundaries.
 *
 * G1: a plugin may only reach another plugin through its `public.ts` surface.
 *     Reaching into `plugins/<other>/**` internals is the coupling that turns a
 *     "plugin system" back into a monolith.
 * G2: the kernel and the plugin runtime may never import plugins or the host apps.
 *
 * Both pass trivially at P0 because `plugins/` and `packages/` do not exist yet.
 * They become load-bearing from P1 (kernel) and P3 (first plugins).
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { collectFiles, extractImportSpecifiers, toRel } from '../../scripts/migration/lib/analysis.mjs';
import { ROOT, exists } from './lib/paths.mjs';

/** Repo-relative directories holding plugins. */
const PLUGIN_DIRS = ['plugins', 'plugins-ext'];

/** Paths that make up a plugin's public surface. */
function isPublicSurface(pluginRelDir, targetAbs) {
  const rel = toRel(ROOT, targetAbs);
  const within = rel.slice(pluginRelDir.length + 1); // strip "<pluginDir>"
  return /(^|\/)public\.tsx?$/.test(within) || /(^|\/)public\/index\.tsx?$/.test(within);
}

/**
 * Resolve a relative import to an absolute file if it exists.
 * @param {string} fromFile
 * @param {string} spec
 * @returns {string|null}
 */
function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec).replace(/\.(js|mjs|cjs)$/, '');
  for (const candidate of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** List the immediate plugin directories under a plugin root. */
function listPlugins(rootDir) {
  const abs = path.join(ROOT, rootDir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${rootDir}/${e.name}`);
}

describe('G1 plugin boundaries', () => {
  const violations = [];

  for (const pluginDir of PLUGIN_DIRS) {
    for (const self of listPlugins(pluginDir)) {
      const selfAbs = path.join(ROOT, self);
      for (const file of collectFiles(selfAbs, ['.ts', '.tsx'])) {
        if (/\.test\.tsx?$/.test(file)) continue;
        for (const spec of extractImportSpecifiers(file)) {
          const target = resolveRelative(file, spec);
          if (!target) continue;
          const targetRel = toRel(ROOT, target);
          const otherRoot = PLUGIN_DIRS.find(
            (d) => targetRel.startsWith(d + '/') && !targetRel.startsWith(self + '/'),
          );
          if (!otherRoot) continue;
          const targetPlugin = targetRel.split('/').slice(0, 2).join('/');
          if (!isPublicSurface(targetPlugin, target)) {
            violations.push(`${toRel(ROOT, file)}  ->  ${targetRel}`);
          }
        }
      }
    }
  }

  it('no plugin reaches into another plugin internal module', () => {
    expect(
      violations,
      violations.length === 0
        ? ''
        : `Cross-plugin internal imports must go through <plugin>/public.ts:\n  ${violations.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('G2 kernel boundaries', () => {
  const CORE_DIRS = ['packages/kernel', 'packages/plugin-runtime', 'packages/plugin-sdk'];
  const FORBIDDEN = ['plugins/', 'plugins-ext/', 'apps/'];
  const violations = [];

  for (const coreDir of CORE_DIRS) {
    const abs = path.join(ROOT, coreDir);
    if (!fs.existsSync(abs)) continue;
    for (const file of collectFiles(abs, ['.ts', '.tsx'])) {
      if (/\.test\.tsx?$/.test(file)) continue;
      for (const spec of extractImportSpecifiers(file)) {
        const target = resolveRelative(file, spec);
        const targetRel = target ? toRel(ROOT, target) : spec;
        if (FORBIDDEN.some((prefix) => targetRel.startsWith(prefix))) {
          violations.push(`${toRel(ROOT, file)}  ->  ${targetRel}`);
        }
      }
    }
  }

  it('kernel and plugin runtime never import plugins or host apps', () => {
    expect(violations, `Kernel must not depend on plugins/apps:\n  ${violations.join('\n  ')}`).toEqual([]);
  });

  it('reports which core packages exist yet (informational)', () => {
    const present = CORE_DIRS.filter((d) => exists(d));
    // Always true; surfaces progress in the test output during early phases.
    expect(Array.isArray(present)).toBe(true);
    if (present.length === 0) {
      console.info('[G2] no core packages yet - guard becomes load-bearing at P1');
    }
  });
});
