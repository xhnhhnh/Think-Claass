#!/usr/bin/env node
/**
 * HTTP surface snapshot tool for the plugin-kernel migration.
 *
 * The migration moves every controller out of `api/modules/**` and into plugins.
 * Throughout that work the *observable* HTTP surface must not change, or every
 * existing client breaks silently.
 *
 *   node scripts/migration/api-surface.mjs            # print the surface
 *   node scripts/migration/api-surface.mjs --check    # non-zero exit on drift
 *   node scripts/migration/api-surface.mjs --update   # rewrite the snapshot
 *
 * The snapshot compares METHOD + PATH only, deliberately not the owning file, so
 * relocating a controller into a plugin does not count as drift while adding,
 * removing or renaming an endpoint does.
 *
 * Response *shapes* cannot be verified statically; that contract is covered by
 * the runtime endpoint tests introduced in P2.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractApiSurface } from './lib/analysis.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SNAPSHOT = path.join(ROOT, 'tests', 'guardrails', 'snapshots', 'api-surface.json');

const routes = extractApiSurface(ROOT);
/**
 * The unit of this snapshot is the distinct reachable METHOD+PATH pair.
 *
 * `extractApiSurface` returns *declarations*, and one pair can be declared twice - the
 * kernel router and a Nest controller can both register `GET /api/health`. Counting
 * declarations here made `count` and `endpoints.length` disagree, and made two
 * different things look like drift. Duplicate declarations are G11's ratchet
 * (`routeCollisions`); this snapshot only answers "which endpoints are reachable".
 */
const surface = [...new Set(routes.map((r) => `${r.method} ${r.path}`))].sort();

/** @type {{ generatedAt: string, count: number, endpoints: string[] }} */
const snapshot = {
  generatedAt: new Date().toISOString(),
  count: surface.length,
  endpoints: surface,
};

const mode = process.argv.includes('--update')
  ? 'update'
  : process.argv.includes('--check')
    ? 'check'
    : 'print';

if (mode === 'print') {
  for (const e of surface) process.stdout.write(e + '\n');
  process.stdout.write(`\n${surface.length} endpoints\n`);
  process.exit(0);
}

if (mode === 'update') {
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  process.stdout.write(`wrote ${path.relative(ROOT, SNAPSHOT).replace(/\\/g, '/')} (${surface.length} endpoints)\n`);
  process.exit(0);
}

// --check
if (!fs.existsSync(SNAPSHOT)) {
  process.stderr.write(`snapshot missing: ${SNAPSHOT}\nrun with --update to create it\n`);
  process.exit(1);
}
const previous = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const before = new Set(previous.endpoints);
const after = new Set(surface);
const removed = [...before].filter((e) => !after.has(e));
const added = [...after].filter((e) => !before.has(e));

if (removed.length === 0 && added.length === 0) {
  process.stdout.write(`API surface unchanged (${surface.length} endpoints)\n`);
  process.exit(0);
}
if (removed.length > 0) {
  process.stderr.write(`REMOVED/RENAMED endpoints (${removed.length}):\n`);
  for (const e of removed) process.stderr.write(`  - ${e}\n`);
}
if (added.length > 0) {
  process.stdout.write(`ADDED endpoints (${added.length}):\n`);
  for (const e of added) process.stdout.write(`  + ${e}\n`);
}
process.exit(1);
