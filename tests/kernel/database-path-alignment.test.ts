/**
 * The two data paths must open the same SQLite file.
 *
 * This repository reaches its database two ways, and until P4.3b.9 they were configured by two
 * independent settings:
 *
 *   - the kernel / `ctx.db` / `api/db.ts`   ->  `DATABASE_FILE`  (resolved against the repo root)
 *   - `@prisma/client` (admin, UserService) ->  `DATABASE_URL`   (a `file:` URL from `.env`)
 *
 * Measured with a real probe (`DATABASE_FILE=<tmp> npx tsx .tmp/prisma-override-check.mts`):
 *
 *   as shipped                app -> <root>/database.sqlite    prisma -> <root>/database.sqlite
 *   DATABASE_FILE overridden  app -> <tmp>/x.sqlite            prisma -> <root>/database.sqlite   <- DIVERGENT
 *
 * That divergence is not cosmetic. Prisma would insert a `users` row into the real database while
 * the request read it back through `better-sqlite3` from a temp copy, so the row exists and the
 * answer is still "not found". Tests and probes set `DATABASE_FILE` constantly, which is why this
 * only ever bit people who were isolating a database - the ones being careful.
 *
 * The fix in `api/prismaClient.ts` resolves the file with the same rule `loadConfig` uses and
 * passes it to `PrismaClient` as an explicit datasource URL, which takes precedence over `.env`.
 *
 * The three tests below are the three ways that can silently regress: the rule itself drifts, the
 * override stops reaching the engine, or the two source files stop agreeing.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '@thinkclass/kernel';

import { applicationDatabaseFile, applicationDatabaseUrl } from '../../api/prismaClient.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let scratch = '';

beforeAll(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-db-path-'));
});

afterAll(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

/** Run a function with `DATABASE_FILE` set to `value`, then restore whatever was there. */
function withDatabaseFile<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.DATABASE_FILE;
  if (value === undefined) delete process.env.DATABASE_FILE;
  else process.env.DATABASE_FILE = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.DATABASE_FILE;
    else process.env.DATABASE_FILE = previous;
  }
}

describe('one database file, two access paths', () => {
  it('resolves DATABASE_FILE the same way the kernel config does', () => {
    const isolated = path.join(scratch, 'isolated.sqlite');

    // The property that matters: whatever `DATABASE_FILE` says, BOTH resolve to it - not to two
    // different things that happen to agree in the default deployment.
    withDatabaseFile(isolated, () => {
      expect(applicationDatabaseFile()).toBe(isolated);
      expect(loadConfig({ rootDir: ROOT }).databaseFile).toBe(path.resolve(ROOT, isolated));
    });

    // And the default, when nothing is set: <cwd>/database.sqlite on both sides.
    withDatabaseFile(undefined, () => {
      expect(applicationDatabaseFile()).toBe(path.resolve(process.cwd(), 'database.sqlite'));
      expect(loadConfig({ rootDir: process.cwd() }).databaseFile).toBe(
        path.resolve(process.cwd(), 'database.sqlite'),
      );
    });
  });

  it('hands Prisma a file: URL for that exact path', () => {
    const isolated = path.join(scratch, 'isolated.sqlite');
    withDatabaseFile(isolated, () => {
      expect(applicationDatabaseUrl()).toBe(`file:${isolated}`);
    });
  });

  /**
   * The end-to-end half, and the one that would have caught the original bug.
   *
   * It runs a child process because the Prisma client is constructed at module load: an in-process
   * test would either reuse a client built by an earlier import (measuring nothing) or import the
   * module twice with different environments (impossible). The child sets `DATABASE_FILE`, imports
   * `api/prismaClient.ts`, and reports the file Prisma actually has open - ground truth from
   * SQLite itself, not from the configuration.
   *
   * It also asserts the child really opened the isolated file, so a broken child cannot pass by
   * printing the same value twice.
   */
  it('makes a freshly constructed Prisma client open the isolated file', () => {
    const isolated = path.join(scratch, 'child.sqlite');
    // A tracked fixture, not a `.tmp/` probe: the first version of this test pointed into `.tmp/`,
    // which is gitignored, so it would have failed on a fresh clone.
    const script = path.join(ROOT, 'tests', 'kernel', 'fixtures', 'database-path-probe.mts');
    expect(fs.existsSync(script), `probe fixture missing: ${script}`).toBe(true);

    const child = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), script], {
      cwd: ROOT,
      env: {
        ...process.env,
        DATABASE_FILE: isolated,
        // Deliberately pointed elsewhere: the explicit datasource must win over this, otherwise the
        // fix only works in deployments where `.env` happens to agree.
        DATABASE_URL: 'file:./prisma/database.sqlite',
      },
      encoding: 'utf8',
    });

    expect(child.status, `child failed:\n${child.stdout}\n${child.stderr}`).toBe(0);
    expect(child.stdout).toContain('VERDICT                : override honoured');
    expect(child.stdout).toContain(isolated);
    // The isolated file is created by opening it, which is the proof it was really used.
    expect(fs.existsSync(isolated)).toBe(true);
  }, 60_000);

  it('keeps the resolution rule in exactly three places, all of them known', () => {
    // The rule cannot be shared as code: `api/prismaClient.ts` is loaded by the Vercel serverless
    // entry and importing the kernel would drag `better-sqlite3` in, while the kernel must not
    // import the application. So it is duplicated - deliberately, and enumerated here.
    //
    // Three writers exist, and the third is real debt rather than a design:
    //
    //   1. packages/kernel/src/config/loadConfig.ts   the kernel's own connection
    //   2. api/prismaClient.ts                        the Prisma client
    //   3. api/db.ts                                  a SECOND better-sqlite3 connection, opened
    //                                                 directly rather than through the kernel
    //
    // (3) exists because `api/db.ts` is still the legacy composition's `db` handle, reachable from
    // `api/**` and the un-migrated modules. It resolves the same file with its own copy of the rule,
    // which is why it is on this list instead of being invisible: the moment a fourth reader
    // appears, the two data paths can disagree again with nothing to catch it.
    const KNOWN_PATH_READERS = [
      'packages/kernel/src/config/loadConfig.ts',
      'api/prismaClient.ts',
      'api/db.ts',
    ];

    for (const rel of KNOWN_PATH_READERS) {
      expect(fs.readFileSync(path.join(ROOT, rel), 'utf8'), `${rel} should read DATABASE_FILE`).toMatch(
        /DATABASE_FILE/,
      );
    }

    const prismaClient = fs.readFileSync(path.join(ROOT, 'api', 'prismaClient.ts'), 'utf8');
    expect(prismaClient).toContain("path.resolve(process.cwd(), process.env.DATABASE_FILE ?? 'database.sqlite')");

    const loader = fs.readFileSync(path.join(ROOT, 'packages', 'kernel', 'src', 'config', 'loadConfig.ts'), 'utf8');
    expect(loader).toContain("path.resolve(rootDir, env.DATABASE_FILE ?? 'database.sqlite')");

    const legacyDb = fs.readFileSync(path.join(ROOT, 'api', 'db.ts'), 'utf8');
    expect(legacyDb).toContain('path.resolve(process.cwd(), process.env.DATABASE_FILE)');

    // No fourth reader. Comments are stripped first: `plugins/payment` explains this trap in prose,
    // and a substring scan over raw source would flag documentation as a violation - the same
    // mistake the api-surface scanner made with decorators in comments (P4.3b.6b).
    const stripComments = (source: string) =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix: string) => prefix);

    const offenders: string[] = [];
    for (const rel of ['api', 'packages', 'plugins', 'scripts', 'src']) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) continue;
      const stack = [abs];
      while (stack.length > 0) {
        const dir = stack.pop() as string;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            stack.push(full);
            continue;
          }
          if (!/\.(ts|mts|mjs)$/.test(entry.name)) continue;
          const relPath = path.relative(ROOT, full).replace(/\\/g, '/');
          if (KNOWN_PATH_READERS.includes(relPath)) continue;
          if (/\.test\.(ts|mts)$/.test(entry.name)) continue;
          if (/(^|[^A-Za-z_])DATABASE_FILE/.test(stripComments(fs.readFileSync(full, 'utf8')))) {
            offenders.push(relPath);
          }
        }
      }
    }

    expect(
      offenders,
      `These files read DATABASE_FILE outside the three known owners; a fourth reader is how the two data paths drift apart again:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
