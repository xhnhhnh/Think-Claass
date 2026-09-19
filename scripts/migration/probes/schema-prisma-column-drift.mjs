/**
 * Which columns does the boot schema have that `prisma/schema.prisma` does not model?
 *
 * The two are meant to describe the same tables. G13 checks one direction - every Prisma model has a
 * table in the migration chain - and nothing checked the other until P4.3b.11. A column that exists in
 * SQLite but not in Prisma is invisible to every Prisma query (`SELECT *` through the client will not
 * surface it, and `create` cannot set it), while raw SQL through `ctx.db` can read and write it. That
 * is how `blind_boxes.teacher_id` came to be declared as `REFERENCES users(id)` in the boot schema and
 * never written by anything.
 *
 * The result feeds the assertion in `tests/guardrails/boot-schema-completeness.test.ts`, which pins
 * the drift set to exactly the two known columns. Tracked rather than left in `.tmp/`, which is
 * gitignored: a measurement nobody else can re-run is not evidence.
 *
 * Usage: node scripts/migration/probes/schema-prisma-column-drift.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const prismaSchema = read('prisma/schema.prisma');
const bootSchema = read('api/schema/legacyBootSchema.ts');

// --- Prisma models -> columns -------------------------------------------------
const models = new Map();
for (const match of prismaSchema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const [, name, body] = match;
  const columns = new Set();
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
    const column = /^(\w+)\s+\w/.exec(trimmed);
    if (column) columns.add(column[1]);
  }
  models.set(name, columns);
}

// --- boot schema -> columns ---------------------------------------------------
const bootTables = new Map();
for (const match of bootSchema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n {4}\);/g)) {
  const [, name, body] = match;
  const columns = new Set();
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // Column lines start with an identifier and are not table-level constraints.
    const column = /^(\w+)\s+(INTEGER|TEXT|REAL|BLOB|NUMERIC|DATETIME|DATE|BOOLEAN|VARCHAR)/i.exec(trimmed);
    if (column) columns.add(column[1]);
    else {
      const bare = /^(\w+)\s*(,)?$/.exec(trimmed);
      if (bare && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i.test(bare[1])) columns.add(bare[1]);
    }
  }
  bootTables.set(name, columns);
}

const drift = [];
for (const [table, bootColumns] of bootTables) {
  const prismaColumns = models.get(table);
  if (!prismaColumns) continue;
  for (const column of bootColumns) {
    if (!prismaColumns.has(column)) drift.push({ table, column });
  }
}

console.log(`boot schema tables: ${bootTables.size}, prisma models: ${models.size}`);
console.log(`columns in the boot schema but not in the matching prisma model: ${drift.length}`);
for (const entry of drift) console.log(`  ${entry.table}.${entry.column}`);

// The same in reverse, which is the direction G13 covers at table granularity only.
const reverse = [];
for (const [table, prismaColumns] of models) {
  const bootColumns = bootTables.get(table);
  if (!bootColumns) continue;
  for (const column of prismaColumns) {
    if (!bootColumns.has(column) && column !== 'id') reverse.push({ table, column });
  }
}
console.log(`\ncolumns in prisma but not in the boot schema: ${reverse.length}`);
for (const entry of reverse.slice(0, 20)) console.log(`  ${entry.table}.${entry.column}`);
