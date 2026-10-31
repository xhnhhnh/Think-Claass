/**
 * One SQLite file, a small known set of readers.
 *
 * The application used to open its database through two independent clients: the kernel's
 * `better-sqlite3` handle and `@prisma/client`. They were configured by different environment
 * variables, so setting `DATABASE_FILE` to a temp copy moved the request path while Prisma kept
 * writing the real file. The Prisma client was the last runtime consumer of a second path; P7
 * removed `api/prismaClient.ts`, leaving:
 *
 *   1. packages/kernel/src/config/loadConfig.ts   the kernel connection
 *   2. api/db.ts                                  the legacy composition's connection
 *   3. scripts/dev/demo-instance.mjs               a tool that *sets* DATABASE_FILE for its children
 *
 * The rule is still duplicated between (1) and (2), deliberately: the kernel must not import the
 * application and the legacy composition must not drag the kernel's config in. This test keeps the
 * duplication honest, and fails if a fourth reader appears.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '@thinkclass/kernel';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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

describe('one database file, known readers', () => {
  it('resolves DATABASE_FILE against the kernel root', () => {
    const isolated = path.join(ROOT, 'tmp', 'isolated.sqlite');

    withDatabaseFile(isolated, () => {
      expect(loadConfig({ rootDir: ROOT }).databaseFile).toBe(path.resolve(ROOT, isolated));
    });

    withDatabaseFile(undefined, () => {
      expect(loadConfig({ rootDir: process.cwd() }).databaseFile).toBe(
        path.resolve(process.cwd(), 'database.sqlite'),
      );
    });
  });

  it('keeps the resolution rule in the two known implementations', () => {
    const loader = fs.readFileSync(path.join(ROOT, 'packages', 'kernel', 'src', 'config', 'loadConfig.ts'), 'utf8');
    expect(loader).toContain("path.resolve(rootDir, env.DATABASE_FILE ?? 'database.sqlite')");

    const legacyDb = fs.readFileSync(path.join(ROOT, 'api', 'db.ts'), 'utf8');
    expect(legacyDb).toContain('path.resolve(process.cwd(), process.env.DATABASE_FILE)');
  });

  it('has no unknown DATABASE_FILE reader', () => {
    // The demo tool does not resolve the path; it copies the database and sets DATABASE_FILE for
    // its two child processes. It is known here because it is the only tool allowed to point the
    // application at a different file.
    const KNOWN_READERS = [
      'packages/kernel/src/config/loadConfig.ts',
      'api/db.ts',
      'scripts/dev/demo-instance.mjs',
    ];

    for (const rel of KNOWN_READERS) {
      expect(fs.readFileSync(path.join(ROOT, rel), 'utf8'), `${rel} should mention DATABASE_FILE`).toMatch(
        /DATABASE_FILE/,
      );
    }

    // Comments are stripped first: plugins explain this trap in prose, and a substring scan over
    // raw source would flag documentation as a violation.
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
          if (KNOWN_READERS.includes(relPath)) continue;
          if (/\.test\.(ts|mts)$/.test(entry.name)) continue;
          if (/(^|[^A-Za-z_])DATABASE_FILE/.test(stripComments(fs.readFileSync(full, 'utf8')))) {
            offenders.push(relPath);
          }
        }
      }
    }

    expect(
      offenders,
      `These files read DATABASE_FILE outside the known owners; a new reader is how the two data paths drift apart again:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
