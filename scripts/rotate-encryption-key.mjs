#!/usr/bin/env node
/**
 * Re-encrypt the at-rest values that use `ENCRYPTION_KEY`.
 *
 * ## Why this exists
 *
 * `api/db.ts` used to fall back to a 32-character default when `ENCRYPTION_KEY` was unset, and that
 * default lived in the source - so a deployment that never set the variable encrypted children's
 * names with a published key. P4.3b.15 removed the fallback: the key is now required, and missing it
 * throws instead of quietly using a known value.
 *
 * Removing the fallback does not by itself fix an existing database: its rows were written with the
 * old key. This script moves them to a new one, in a single transaction, and reports exactly what it
 * did. Run it **before** deploying the build that requires the key, or the first read of an
 * encrypted name will throw.
 *
 * ## Usage
 *
 *   node scripts/rotate-encryption-key.mjs \
 *     --db database.sqlite \
 *     --old-key '<the key the rows were encrypted with>' \
 *     --new-key '<a new 32-byte key>' \
 *     --yes
 *
 *   # report only, change nothing
 *   node scripts/rotate-encryption-key.mjs --db database.sqlite --old-key '<key>' --dry-run
 *
 * Both keys must be exactly 32 bytes (`aes-256-cbc`); anything else is refused. Generate a new one
 * with:  node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
 *
 * ## What it touches
 *
 * `students.name` only - the one column this application encrypts (`api/db.ts`'s `encrypt`, mirrored
 * by `plugins/classroom/src/classroom.support.ts`). Rows that are NOT in the `ivHex:cipherHex` form
 * (legacy plaintext, written before encryption existed) are reported and left alone, exactly as
 * `decrypt()` leaves them.
 *
 * Keep the old key out of the repository: pass it as an argument or through `OLD_ENCRYPTION_KEY`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import Database from 'better-sqlite3';

const IV_LENGTH = 16;
const ENCRYPTED_SHAPE = /^[0-9a-f]{32}:[0-9a-f]+$/i;

function parseArgs(argv) {
  const options = { db: 'database.sqlite', oldKey: process.env.OLD_ENCRYPTION_KEY, newKey: process.env.NEW_ENCRYPTION_KEY, dryRun: false, yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--db') options.db = argv[++index];
    else if (arg === '--old-key') options.oldKey = argv[++index];
    else if (arg === '--new-key') options.newKey = argv[++index];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--yes') options.yes = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function assertKey(name, value) {
  if (!value) throw new Error(`${name} is required (32 bytes). See this script's header for usage.`);
  const key = Buffer.from(value);
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes for aes-256-cbc; got ${key.length}`);
  return key;
}

function decryptWith(key, value) {
  const parts = value.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(Buffer.from(parts.join(':'), 'hex')), decipher.final()]).toString();
}

function encryptWith(key, text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return `${iv.toString('hex')}:${Buffer.concat([cipher.update(text), cipher.final()]).toString('hex')}`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('see the header of scripts/rotate-encryption-key.mjs for usage');
    return;
  }

  const file = path.resolve(options.db);
  if (!fs.existsSync(file)) throw new Error(`database not found: ${file}`);
  if (!options.dryRun && !options.yes) {
    throw new Error('refusing to write without --yes (back the database up first; --dry-run reports only)');
  }

  const oldKey = assertKey('--old-key', options.oldKey);
  const newKey = assertKey('--new-key', options.newKey);
  if (oldKey.equals(newKey)) throw new Error('--new-key equals --old-key: nothing to do');

  const db = new Database(file);
  try {
    const hasStudents = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='students'")
      .get().n;
    if (!hasStudents) {
      console.log('no students table: nothing to re-encrypt');
      return;
    }

    const rows = db.prepare('SELECT id, name FROM students').all();
    const rotate = db.transaction(() => {
      const summary = { rotated: 0, plaintext: 0, undecryptable: 0, empty: 0 };
      const update = db.prepare('UPDATE students SET name = ? WHERE id = ?');

      for (const row of rows) {
        const value = row.name == null ? '' : String(row.name);
        if (!value) {
          summary.empty += 1;
          continue;
        }
        if (!ENCRYPTED_SHAPE.test(value)) {
          // Legacy plaintext row, or a value written by a different scheme. `decrypt()` returns it
          // unchanged, so this script must not touch it either.
          summary.plaintext += 1;
          continue;
        }

        let plain;
        try {
          plain = decryptWith(oldKey, value);
        } catch {
          summary.undecryptable += 1;
          continue;
        }

        const reencrypted = encryptWith(newKey, plain);
        if (!options.dryRun) update.run(reencrypted, row.id);
        summary.rotated += 1;
      }

      return summary;
    });

    const summary = rotate();
    console.log(
      `${options.dryRun ? 'DRY RUN - ' : ''}students=${rows.length} rotated=${summary.rotated} ` +
        `plaintext-skipped=${summary.plaintext} undecryptable=${summary.undecryptable} empty=${summary.empty}`,
    );

    if (summary.undecryptable > 0) {
      console.log('WARNING: rows that the old key cannot decrypt were left untouched; check the old key.');
    }

    if (!options.dryRun) {
      // Prove the write: every row must now decrypt with the new key (or be a skipped plaintext row).
      const verify = db.prepare('SELECT name FROM students').all();
      let readable = 0;
      let unreadable = 0;
      for (const row of verify) {
        const value = row.name == null ? '' : String(row.name);
        if (!value || !ENCRYPTED_SHAPE.test(value)) continue;
        try {
          decryptWith(newKey, value);
          readable += 1;
        } catch {
          unreadable += 1;
        }
      }
      console.log(`verify with the new key: readable=${readable} unreadable=${unreadable}`);
      if (unreadable > 0) throw new Error('verification failed: some rows do not decrypt with the new key');
    }
  } finally {
    db.close();
  }
}

main();
