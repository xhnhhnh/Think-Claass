#!/usr/bin/env node
/**
 * Baseline metrics for the plugin-kernel migration.
 *
 *   node scripts/migration/measure.mjs           # human-readable report
 *   node scripts/migration/measure.mjs --json    # machine-readable JSON
 *   node scripts/migration/measure.mjs --write   # also write docs/migration/baseline.json
 *
 * Every number in docs/migration/00-baseline.md is produced by this script so the
 * baseline can be re-verified at any point in the migration.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectFiles,
  extractApiSurface,
  findDeadCode,
  findShimFiles,
  isTestFile,
  listSourceFiles,
  readClassEnableColumns,
  readFeatureKeyTables,
  readPrismaModels,
  readRawSqlTables,
  toRel,
} from './lib/analysis.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/** Entry points for application reachability. */
const APP_ENTRIES = ['src/main.tsx', 'api/server.ts', 'api/index.ts'];

/** Group a repo-relative path into a coarse area label. */
function areaOf(rel) {
  const parts = rel.split('/');
  if (parts[0] === 'api') return `api/${parts[1] ?? ''}`.replace(/\/$/, '');
  if (parts[0] === 'src') return `src/${parts[1] ?? ''}`.replace(/\/$/, '');
  return parts[0];
}

function countLines(files) {
  let total = 0;
  for (const f of files) {
    try {
      total += fs.readFileSync(f, 'utf8').split(/\r?\n/).length;
    } catch {
      /* ignore */
    }
  }
  return total;
}

function groupCounts(items, keyFn) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function countRoutesInFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return 0;
  const text = fs.readFileSync(abs, 'utf8');
  return [...text.matchAll(/<Route[\s>]/g)].length;
}

// ---------------------------------------------------------------------------

const allSource = listSourceFiles(ROOT);
const srcFiles = collectFiles(path.join(ROOT, 'src'), ['.ts', '.tsx']);
const apiFiles = collectFiles(path.join(ROOT, 'api'), ['.ts']);
const testFiles = allSource.filter(isTestFile);

const dead = findDeadCode(ROOT, APP_ENTRIES);
const shimDirs = ['src/features', 'plugins'];
const shims = findShimFiles(ROOT, shimDirs);

const apiSurface = extractApiSurface(ROOT);
const controllers = new Set(apiSurface.map((r) => `${r.file}`));
const controllerCount = (() => {
  let n = 0;
  for (const f of new Set(apiSurface.map((r) => path.join(ROOT, r.file)))) {
    const text = fs.readFileSync(f, 'utf8');
    n += [...text.matchAll(/@Controller\s*\(/g)].length;
  }
  return n;
})();

const prismaModels = readPrismaModels(ROOT);
const rawTables = readRawSqlTables(ROOT);
const prismaOnly = prismaModels.filter((m) => !rawTables.includes(m));
const rawOnly = rawTables.filter((t) => !prismaModels.includes(t));

const featureTables = readFeatureKeyTables(ROOT);
const enableColumns = readClassEnableColumns(ROOT);

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.BASELINE_COMMIT ?? null,
  scale: {
    trackedSourceFiles: allSource.length,
    srcFiles: srcFiles.length,
    srcLines: countLines(srcFiles),
    apiFiles: apiFiles.length,
    apiLines: countLines(apiFiles),
    testFiles: testFiles.length,
    controllers: controllerCount,
    httpHandlers: apiSurface.length,
    appRoutes: countRoutesInFile('src/app/routing/AppRoutes.tsx'),
    prismaModels: prismaModels.length,
    rawSqlTables: rawTables.length,
  },
  schemaDrift: {
    prismaOnly,
    rawOnly,
    inSync: prismaModels.filter((m) => rawTables.includes(m)).length,
  },
  deadCode: {
    total: dead.length,
    byArea: groupCounts(dead, areaOf),
    files: dead,
  },
  surfacePluginization: {
    shimCount: shims.length,
    scannedDirs: shimDirs,
    shims,
  },
  extensionPoints: {
    featureKeyTables: featureTables,
    classEnableColumns: enableColumns,
  },
  apiSurface,
};

// ---------------------------------------------------------------------------

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(0);
}

const L = (s = '') => process.stdout.write(s + '\n');
const pad = (label, value) => L(`  ${String(label).padEnd(28)} ${value}`);

L('=== ThinkClass baseline metrics ===');
L('');
L('-- scale --');
pad('source ts/tsx files', report.scale.trackedSourceFiles);
pad('src files / lines', `${report.scale.srcFiles} / ${report.scale.srcLines}`);
pad('api files / lines', `${report.scale.apiFiles} / ${report.scale.apiLines}`);
pad('test files', report.scale.testFiles);
pad('@Controller', report.scale.controllers);
pad('HTTP handlers', report.scale.httpHandlers);
pad('static <Route> in AppRoutes', report.scale.appRoutes);
pad('prisma models', report.scale.prismaModels);
pad('raw SQL CREATE TABLE', report.scale.rawSqlTables);
L('');
L('-- schema drift (prisma vs raw sqlite) --');
pad('in sync', report.schemaDrift.inSync);
pad('prisma-only', report.schemaDrift.prismaOnly.join(', ') || '(none)');
pad('raw-sql-only', report.schemaDrift.rawOnly.join(', ') || '(none)');
L('');
L(`-- dead code (app-unreachable, non-test): ${report.deadCode.total} --`);
for (const g of report.deadCode.byArea) pad(g.name, g.count);
L('');
L(`-- surface pluginization (one-line re-export shims): ${report.surfacePluginization.shimCount} --`);
for (const s of report.surfacePluginization.shims) L(`  ${s.file}  ->  ${s.target}`);
L('');
L('-- extension points that must disappear --');
for (const t of report.extensionPoints.featureKeyTables) {
  pad(t.file, `${t.keys.length} keys`);
}
pad('classes.enable_* columns', report.extensionPoints.classEnableColumns.length);
L('');

if (process.argv.includes('--write')) {
  const outDir = path.join(ROOT, 'docs', 'migration');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'baseline.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
  L(`wrote ${toRel(ROOT, outFile)}`);
}
