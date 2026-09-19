/**
 * Guardrail G5 - the kernel must not know any business domain.
 *
 * The kernel is allowed to know: bootstrap, config, logging, auth primitives, the
 * event bus, permissions, migrations, storage and the plugin runtime. It must NOT
 * know about classes, students, pets, points, or which feature flags exist.
 *
 * Concretely this forbids in `packages/kernel` / `packages/plugin-runtime`:
 *   - any `enable_*` feature flag identifier
 *   - SQL statements touching non-kernel-owned tables
 *   - importing legacy `api/**` or any `plugins/**`
 *
 * It also ratchets the two legacy surfaces that still hardcode the 19 feature keys
 * (`api/utils/classFeatures.ts`, `src/lib/classFeatures.ts`) down to zero.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  collectFiles,
  extractImportSpecifiers,
  readFeatureKeyTables,
  toRel,
} from '../../scripts/migration/lib/analysis.mjs';
import { ROOT, exists, formatRatchet, readAllowances } from './lib/paths.mjs';

const allowances = readAllowances();

const CORE_DIRS = ['packages/kernel', 'packages/plugin-runtime'];

/**
 * Tables the kernel legitimately owns (see plan section 8.3).
 * Anything else appearing in kernel SQL is a domain leak.
 */
const KERNEL_OWNED_TABLES = new Set([
  'sessions',
  'settings',
  'system_settings',
  'operation_logs',
  'capability_assignments',
  '__plugins',
  '__plugin_migrations',
  '__core_migrations',
  '_prisma_migrations',
  'sqlite_sequence',
]);

const SQL_TABLE_RE = /\b(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+[`"[]?([a-zA-Z_][a-zA-Z0-9_]*)/g;
const ENABLE_KEY_RE = /\benable_[a-z_]+\b/;
const IMPORT_RE_ILLEGAL = [/^api\//, /^plugins\//, /^plugins-ext\//, /^apps\//];

/**
 * Resolve a relative import specifier to a repo-relative path if it exists.
 * @param {string} fromFile
 * @param {string} spec
 */
function resolveToRel(fromFile, spec) {
  if (!spec.startsWith('.')) return spec;
  const base = path.resolve(path.dirname(fromFile), spec).replace(/\.(js|mjs|cjs)$/, '');
  for (const candidate of [base, base + '.ts', base + '.tsx']) {
    if (fs.existsSync(candidate)) return toRel(ROOT, candidate);
  }
  return spec;
}

describe('G5 kernel has no domain knowledge', () => {
  /** @type {string[]} */
  const violations = [];
  /** @type {string[]} */
  const scannedDirs = [];

  for (const dir of CORE_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    scannedDirs.push(dir);

    for (const file of collectFiles(abs, ['.ts', '.tsx'])) {
      if (/\.test\.tsx?$/.test(file)) continue;
      const rel = toRel(ROOT, file);
      const text = fs.readFileSync(file, 'utf8');

      // 5a - feature flag identifiers
      for (const [i, line] of text.split(/\r?\n/).entries()) {
        if (line.trimStart().startsWith('//')) continue;
        if (ENABLE_KEY_RE.test(line)) {
          violations.push(`${rel}:${i + 1} feature flag identifier: ${line.trim()}`);
        }
      }

      // 5b - SQL against domain tables
      for (const m of text.matchAll(SQL_TABLE_RE)) {
        const table = m[1];
        if (!KERNEL_OWNED_TABLES.has(table)) {
          violations.push(`${rel} SQL touches non-kernel table: ${table}`);
        }
      }

      // 5c - illegal imports
      for (const spec of extractImportSpecifiers(file)) {
        const target = resolveToRel(file, spec);
        if (IMPORT_RE_ILLEGAL.some((re) => re.test(target))) {
          violations.push(`${rel} imports ${target}`);
        }
      }
    }
  }

  it('no feature flag identifiers, domain SQL or illegal imports in the kernel', () => {
    if (scannedDirs.length === 0) {
      console.info('[G5] no core packages yet - guard becomes load-bearing at P1');
    }
    expect(
      violations,
      `Kernel must stay domain-free:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});

describe('G5 legacy feature-key surfaces ratchet', () => {
  const tables = readFeatureKeyTables(ROOT);

  it('hardcoded class-feature key tables do not grow (target: 0 by P4/P5)', () => {
    expect(
      tables.length,
      formatRatchet(
        'files hardcoding the 19 class feature keys',
        tables.length,
        allowances.legacyFeatureKeySurfaces,
        tables.map((t) => `${t.file} (${t.keys.length} keys)`),
      ),
    ).toBeLessThanOrEqual(allowances.legacyFeatureKeySurfaces);
  });

  it('reports the features that still need a plugin-owned permission key', () => {
    const all = new Set();
    for (const t of tables) for (const k of t.keys) all.add(k);
    console.info(`[G5] ${all.size} legacy feature flags awaiting capability migration`);
    expect(all.size).toBeGreaterThanOrEqual(0);
  });
});
