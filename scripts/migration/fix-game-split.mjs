#!/usr/bin/env node
/**
 * One-off repair for the P4.3 game-module split.
 *
 * The split script moved each controller body verbatim, but the original file had a
 * module-private `ok()` helper that every one of the six controllers depended on and
 * which therefore did not travel with any of them. The helper now lives in
 * `api/utils/apiResponse.ts`; this adds the import to each controller that uses it.
 *
 * Also repoints `gameErrors.ts`, which changed directory depth when it moved from
 * `api/modules/game/` to `api/utils/`.
 *
 * Run: node scripts/migration/fix-game-split.mjs [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRY_RUN = process.argv.includes('--dry-run');
const DOMAINS = ['battles', 'challenge', 'dungeon', 'economy', 'gacha', 'slg'];

const log = (m) => process.stdout.write(m + '\n');
let changed = 0;

// 1. every game controller that calls ok() needs the shared import
for (const domain of DOMAINS) {
  const file = path.join(ROOT, 'api', 'modules', domain, `${domain}.controllers.ts`);
  if (!fs.existsSync(file)) {
    log(`  skip ${domain}: no controller file`);
    continue;
  }

  let source = fs.readFileSync(file, 'utf8');
  const usesOk = /(?<![\w.])ok\(/.test(source);
  const importsOk = /from '\.\.\/\.\.\/utils\/apiResponse\.js'/.test(source);
  if (!usesOk || importsOk) {
    log(`  skip ${domain}: uses_ok=${usesOk} already_imported=${importsOk}`);
    continue;
  }

  // Insert after the last relative import so the group stays together.
  const lines = source.split(/\r?\n/);
  let lastImport = -1;
  lines.forEach((line, index) => {
    if (/^import .* from '\.\.?\//.test(line)) lastImport = index;
  });
  if (lastImport === -1) {
    log(`  !! ${domain}: no relative import found to anchor the new import`);
    continue;
  }

  lines.splice(lastImport + 1, 0, `import { ok } from '../../utils/apiResponse.js';`);
  source = lines.join('\n');
  if (!DRY_RUN) fs.writeFileSync(file, source, 'utf8');
  changed += 1;
  log(`  added ok() import to ${domain}.controllers.ts`);
}

log(`\n${changed} file(s) ${DRY_RUN ? 'would be ' : ''}updated`);
