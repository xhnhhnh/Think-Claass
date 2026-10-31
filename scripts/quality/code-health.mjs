import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { defaultEntryPoints, findDeadCode } from '../migration/lib/analysis.mjs';

/**
 * Code-health audit for the P7 cleanup.
 *
 * This does not replace the guardrails. It answers three questions that no single
 * existing command answers together:
 *
 *   1. Which non-test source files can the application not reach?
 *   2. Which local declarations/imports/parameters does the TypeScript compiler see
 *      as unused? (`tsconfig` keeps `noUnusedLocals` off, so this has to be explicit.)
 *   3. Which `eslint-disable` directives no longer suppress anything?
 *
 * Unused exports are reported by the separate `unused-exports.mjs` pass because
 * deciding whether an export is dead needs the package public surface, while a
 * local variable is either read or not.
 *
 * Usage:
 *   node scripts/quality/code-health.mjs
 *   node scripts/quality/code-health.mjs --json
 *   node scripts/quality/code-health.mjs --check
 *   node scripts/quality/code-health.mjs --skip-eslint
 */

const ROOT = process.cwd();
const json = process.argv.includes('--json');
const check = process.argv.includes('--check');
const skipEslint = process.argv.includes('--skip-eslint');

function deadFiles() {
  // `src/setupTests.ts` is an entry point for the test project: it is how MSW is
  // installed. Without it the two `src/mocks` files look unreachable even though
  // every application test executes them.
  return findDeadCode(ROOT, [...defaultEntryPoints(ROOT), 'src/setupTests.ts']);
}

function unusedLocals() {
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  const run = spawnSync(
    process.execPath,
    [tsc, '-p', 'tsconfig.json', '--noEmit', '--noUnusedLocals', '--noUnusedParameters', '--pretty', 'false'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  const diagnostics = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+?)\((\d+),(\d+)\): error TS(6133|6196|6192): (.*)$/.exec(line);
    if (!match) continue;
    diagnostics.push({
      file: match[1].replace(/\\/g, '/'),
      line: Number(match[2]),
      column: Number(match[3]),
      code: `TS${match[4]}`,
      message: match[5],
    });
  }
  return diagnostics;
}

function unusedSuppressions() {
  const eslint = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const run = spawnSync(
    process.execPath,
    [eslint, '.', '--format', 'json', '--no-warn-ignored'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  let results;
  try {
    results = JSON.parse(run.stdout ?? '[]');
  } catch {
    return {
      diagnostics: [],
      note: `eslint output was not JSON (exit ${run.status}): ${(run.stderr ?? '').trim().slice(0, 500)}`,
    };
  }
  const diagnostics = [];
  for (const file of results) {
    for (const message of file.messages ?? []) {
      if (message.message.includes('Unused eslint-disable directive')) {
        diagnostics.push({
          file: path.relative(ROOT, file.filePath).replace(/\\/g, '/'),
          line: message.line,
          column: message.column,
          message: message.message,
        });
      }
    }
  }
  return { diagnostics, note: null };
}

const report = {
  deadFiles: deadFiles(),
  unusedLocals: unusedLocals(),
  unusedSuppressions: skipEslint ? { diagnostics: [], note: 'skipped by --skip-eslint' } : unusedSuppressions(),
};

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`dead files: ${report.deadFiles.length}\n`);
  for (const file of report.deadFiles) process.stdout.write(`  ${file}\n`);
  process.stdout.write(`unused locals/imports/parameters: ${report.unusedLocals.length}\n`);
  for (const item of report.unusedLocals.slice(0, 30)) {
    process.stdout.write(`  ${item.file}:${item.line}:${item.column} ${item.code} ${item.message}\n`);
  }
  if (report.unusedLocals.length > 30) {
    process.stdout.write(`  ... ${report.unusedLocals.length - 30} more\n`);
  }
  process.stdout.write(`unused eslint suppressions: ${report.unusedSuppressions.diagnostics.length}\n`);
  for (const item of report.unusedSuppressions.diagnostics) {
    process.stdout.write(`  ${item.file}:${item.line}:${item.column} ${item.message}\n`);
  }
  if (report.unusedSuppressions.note) process.stdout.write(`  note: ${report.unusedSuppressions.note}\n`);
}

if (check) {
  const failures = [
    ['dead files', report.deadFiles.length],
    ['unused locals/imports/parameters', report.unusedLocals.length],
    ['unused eslint suppressions', report.unusedSuppressions.diagnostics.length],
  ].filter(([, count]) => count > 0);
  if (failures.length > 0) {
    process.stderr.write(`\ncode-health is not clean:\n${failures.map(([name, n]) => `  ${name}: ${n}`).join('\n')}\n`);
    process.exitCode = 1;
  }
}
