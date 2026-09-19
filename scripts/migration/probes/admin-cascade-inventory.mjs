/**
 * Inventory the admin cascade: which tables it deletes from, and in how many calls.
 *
 * The point is to size the debt HANDOFF section 8.3.1 has carried since P4.3b - `admin.repository.ts`
 * deletes across every other domain through Prisma `$transaction`, which bypasses `DbApi` and
 * therefore the ownership check - and to answer the question that decides how it can ever be fixed:
 * is the cascade one atomic unit?
 *
 * Tracked rather than left in `.tmp/`: `.tmp/` is gitignored, and a measurement that only exists on
 * the machine that took it is not reproducible. P4.3b.11 hit that twice - a test fixture under
 * `.tmp/` and this set of scripts - so the scripts live here and the fixture lives under `tests/`.
 *
 * Usage: node scripts/migration/probes/admin-cascade-inventory.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const source = read('api/modules/admin/admin.repository.ts');

const start = source.indexOf('async function deleteTeacherCascade');
const endMarker = 'await tx.users.delete({ where: { id: teacherId } });';
const end = source.indexOf(endMarker) + endMarker.length;
const cascade = source.slice(start, end);

const tables = new Set();
let calls = 0;
for (const match of cascade.matchAll(/\btx\.([a-z_]+)\.(deleteMany|delete|findMany|updateMany|update|create)\b/g)) {
  tables.add(match[1]);
  calls += 1;
}

const reads = [];
const writes = [];
for (const match of cascade.matchAll(/\btx\.([a-z_]+)\.(deleteMany|delete|findMany|updateMany|update|create)\b/g)) {
  (match[2] === 'findMany' ? reads : writes).push(`${match[1]}.${match[2]}`);
}

console.log(`cascade spans ${tables.size} tables in ${calls} statements`);
console.log(`  reads : ${reads.length}`);
console.log(`  writes: ${writes.length}`);
console.log('\ntables touched (alphabetical):');
for (const table of [...tables].sort()) console.log(`  ${table}`);

const transactions = [...source.matchAll(/prisma\.\$transaction\(/g)].length;
console.log(`\n${transactions} \`prisma.$transaction\` sites in admin.repository.ts`);
console.log('one of them is the cascade itself (line ~794), so the whole set of deletes above is');
console.log('one atomic unit - which is the property any port-based rewrite has to give up.');
