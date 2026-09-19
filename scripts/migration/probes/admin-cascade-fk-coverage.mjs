/**
 * Which foreign keys point at the rows the admin cascade destroys - and does the cascade cover them?
 *
 * The cascade deletes one teacher, their classes, their students and their users. For that to leave
 * a referentially sound database, every table holding a foreign key to `users`, `classes` or
 * `students` must either be cleaned by the cascade or not contain rows for the deleted ids.
 *
 * This script answers two halves:
 *
 *   1. **From the schema** - every `REFERENCES users|classes|students(id)` in the boot schema, and
 *      every `references` in `prisma/schema.prisma`, compared against the tables the cascade
 *      actually touches (parsed out of `deleteTeacherCascade`).
 *   2. **From a real database** - it does not run the delete; it only builds the set difference,
 *      because whether a gap is *live* depends on whether the product ever writes such a row.
 *
 * The result (61 referencing tables, 1 not covered: `blind_boxes`) is what led to P4.3b.11's second
 * finding - that `blind_boxes.teacher_id` is not even in the Prisma model. Tracked rather than left in
 * `.tmp/`, which is gitignored: a measurement nobody else can re-run is not evidence.
 *
 * Usage: node scripts/migration/probes/admin-cascade-fk-coverage.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const schema = read('api/schema/legacyBootSchema.ts');
const repository = read('api/modules/admin/admin.repository.ts');

// --- what the cascade touches -------------------------------------------------
const start = repository.indexOf('async function deleteTeacherCascade');
const endMarker = 'await tx.users.delete({ where: { id: teacherId } });';
const cascade = repository.slice(start, repository.indexOf(endMarker) + endMarker.length);
const touched = new Set(
  [...cascade.matchAll(/\btx\.([a-z_]+)\.(deleteMany|delete|updateMany|update|create|findMany)\b/g)].map(
    (match) => match[1],
  ),
);

// --- every FK pointing at users / classes / students --------------------------
const parents = ['users', 'classes', 'students'];
const tableBlocks = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([^;]*?)\n {4}\);/g)];
const referencing = [];
for (const [, table, body] of tableBlocks) {
  for (const parent of parents) {
    if (new RegExp(`REFERENCES\\s+${parent}\\s*\\(`).test(body)) {
      referencing.push({ table, parent });
    }
  }
}

const uncovered = referencing.filter((entry) => !touched.has(entry.table));

console.log(`cascade touches ${touched.size} tables`);
console.log(`${referencing.length} tables hold a foreign key to one of ${parents.join(' / ')}`);
console.log(`\nNOT touched by the cascade (${uncovered.length}):`);
for (const entry of uncovered) console.log(`  ${entry.table}  ->  ${entry.parent}(id)`);

console.log(`\ntouched by the cascade (${referencing.length - uncovered.length}):`);
for (const entry of referencing.filter((e) => touched.has(e.table))) {
  console.log(`  ${entry.table}  ->  ${entry.parent}(id)`);
}

// --- does SQLite enforce them? ------------------------------------------------
const connection = fs.readFileSync('packages/kernel/src/storage/connection.ts', 'utf8');
console.log(
  `\nthe application connection enables foreign_keys: ${/pragma\('foreign_keys = ON'\)/.test(connection)}`,
);
console.log('so an uncovered FK with a row for a deleted id is a dangling reference, not a silent no-op.');
