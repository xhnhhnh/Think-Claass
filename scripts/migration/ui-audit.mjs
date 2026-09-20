#!/usr/bin/env node
/**
 * Design-system debt report for the UI refactor (see docs/design-system.md).
 *
 *   node scripts/migration/ui-audit.mjs          # human report
 *   node scripts/migration/ui-audit.mjs --json   # machine-readable
 *   node scripts/migration/ui-audit.mjs --check  # non-zero exit over the ratchet
 *
 * The measurements themselves live in `lib/ui-audit.mjs`, which the guardrail
 * suite (G20) also imports, so this tool and CI cannot drift apart.
 *
 * Why the ratchet lives in `tests/guardrails/lib/allowances.json` next to the
 * migration ratchets: the same rule applies to both. A number may only go down,
 * and a guardrail that is red today is worthless because red stops meaning
 * "you broke something".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { UI_METRICS, auditUi, ratchetFailures } from './lib/ui-audit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ALLOWANCES = path.join(ROOT, 'tests', 'guardrails', 'lib', 'allowances.json');

const report = await auditUi(ROOT);

const modes = ['--json', '--check'];
const mode = modes.find((m) => process.argv.includes(m)) ?? 'report';

if (mode === '--json') {
  process.stdout.write(JSON.stringify({ counts: report.counts, areas: report.areas, imports: report.imports }, null, 2) + '\n');
  process.exit(0);
}

const allowances = JSON.parse(fs.readFileSync(ALLOWANCES, 'utf8')).ui ?? {};

if (mode === '--check') {
  const failures = ratchetFailures(report.counts, allowances);
  if (failures.length === 0) {
    process.stdout.write(`UI debt within allowances (${UI_METRICS.length} metrics)\n`);
    process.exit(0);
  }
  process.stderr.write('UI debt exceeded its allowance:\n');
  for (const f of failures) {
    process.stderr.write(`  ${f.key}: ${f.actual} (allowance ${f.allowed})\n`);
    for (const offender of (report.offenders[f.key] ?? []).slice(0, 10)) {
      process.stderr.write(`      ${offender}\n`);
    }
  }
  process.exit(1);
}

// --- human report ----------------------------------------------------------

const pad = (value, width) => String(value).padEnd(width);

process.stdout.write('UI design-system debt\n\n');
process.stdout.write(`${pad('metric', 26)}${pad('now', 6)}${pad('allow', 7)}${pad('target', 8)}label\n`);
for (const { key, label, target } of UI_METRICS) {
  const allowed = allowances[key];
  process.stdout.write(
    `${pad(key, 26)}${pad(report.counts[key] ?? 0, 6)}${pad(allowed ?? '-', 7)}${pad(target, 8)}${label}\n`,
  );
}

process.stdout.write('\nBy area (files / lines / raw controls / hex / inline / native dialogs)\n');
for (const row of report.areas) {
  process.stdout.write(
    `  ${pad(row.area, 16)}${pad(row.files, 6)}${pad(row.lines, 8)}` +
      `${pad(Number(row.rawButtons) + Number(row.rawInputs) + Number(row.rawSelects) + Number(row.rawTables), 6)}` +
      `${pad(row.hexColors, 6)}${pad(row.inlineStyles, 8)}${row.nativeDialogs}\n`,
  );
}

const worst = UI_METRICS.map(({ key }) => ({ key, count: report.counts[key] ?? 0 }))
  .filter((row) => row.count > 0)
  .sort((a, b) => b.count - a.count)
  .slice(0, 3);

if (worst.length > 0) {
  process.stdout.write('\nTop offenders\n');
  for (const { key, count } of worst) {
    process.stdout.write(`  ${key} (${count})\n`);
    for (const offender of (report.offenders[key] ?? []).slice(0, 8)) process.stdout.write(`      ${offender}\n`);
  }
}

const failures = ratchetFailures(report.counts, allowances);
if (failures.length > 0) {
  process.stdout.write('\nOVER ALLOWANCE:\n');
  for (const f of failures) process.stdout.write(`  ${f.key}: ${f.actual} > ${f.allowed}\n`);
}
