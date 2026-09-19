/**
 * Guardrail G6 - `packages/contracts` stays type-only.
 *
 * The contracts package is the single shared vocabulary between kernel, plugins,
 * frontend and backend. The moment it gains runtime code it becomes a hidden
 * implementation layer that every plugin transitively depends on -- exactly the
 * coupling the plugin architecture exists to remove.
 *
 * Allowed:  `export interface`, `export type`, `export type { ... } from`, `export * from` of types
 * Forbidden: any runtime export (const/let/var/function/class/enum/default) and
 *            any value import (`import { x }` instead of `import type { x }`).
 *
 * Passes trivially until `packages/contracts` is created in P1/P2.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { collectFiles, toRel } from '../../scripts/migration/lib/analysis.mjs';
import { ROOT, exists } from './lib/paths.mjs';

const CONTRACTS_DIR = 'packages/contracts';

const RUNTIME_EXPORT_RE = /^\s*export\s+(?:declare\s+)?(?:const|let|var|function|async\s+function|class|enum|default)\b/;
const VALUE_IMPORT_RE = /^\s*import\s+(?!type\b)[^'"]*from\s*['"][^'"]+['"]/;

describe('G6 contracts is type-only', () => {
  const abs = path.join(ROOT, CONTRACTS_DIR);

  it('contains no runtime exports or value imports', () => {
    if (!exists(CONTRACTS_DIR)) {
      console.info('[G6] packages/contracts does not exist yet - guard becomes load-bearing at P1/P2');
      expect(true).toBe(true);
      return;
    }

    const violations = [];
    for (const file of collectFiles(abs, ['.ts', '.tsx'])) {
      const rel = toRel(ROOT, file);
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (line.trimStart().startsWith('//')) return;
        if (RUNTIME_EXPORT_RE.test(line)) {
          violations.push(`${rel}:${i + 1} runtime export: ${line.trim()}`);
        } else if (VALUE_IMPORT_RE.test(line)) {
          violations.push(`${rel}:${i + 1} value import: ${line.trim()}`);
        }
      });
    }

    expect(
      violations,
      `packages/contracts must contain types only:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
