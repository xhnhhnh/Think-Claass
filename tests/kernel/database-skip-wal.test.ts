/**
 * `DATABASE_SKIP_WAL` - the journal mode a deployment actually got.
 *
 * WAL is right for a local disk and wrong for a database file on a mounted network filesystem, which
 * is where the WeChat mini program's container runs. The switch is worth a test rather than a line in
 * a document because `journal_mode` is a **persistent property of the file**: a database created by an
 * earlier version keeps WAL unless the mode is set explicitly, so "we set the flag" and "the file is
 * not in WAL" are different claims. This asserts the second one.
 *
 * `loadConfig` is covered directly too, because the flag is only useful if it survives parsing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { createKernel, loadConfig, type Kernel } from '@thinkclass/kernel';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let kernel: Kernel | null = null;
const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-mode-'));
  directories.push(directory);
  return directory;
}

async function openWith(overrides: Record<string, unknown>, directory: string): Promise<string> {
  kernel = await createKernel({
    rootDir: ROOT,
    overrides: {
      logLevel: 'silent',
      pluginsEnabled: false,
      databaseFile: path.join(directory, 'app.sqlite'),
      ...overrides,
    },
    migrations: [],
  });

  return String(kernel.db.pragma('journal_mode', { simple: true })).toLowerCase();
}

afterEach(async () => {
  await kernel?.shutdown();
  kernel = null;
  for (const directory of directories.splice(0)) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // Windows keeps the file handle briefly.
    }
  }
});

describe('DATABASE_SKIP_WAL', () => {
  it('parses the flag from the environment, defaulting to off', () => {
    expect(loadConfig({ env: {} as NodeJS.ProcessEnv }).databaseSkipWal).toBe(false);
    expect(loadConfig({ env: { DATABASE_SKIP_WAL: '1' } as NodeJS.ProcessEnv }).databaseSkipWal).toBe(true);
    // `envFlag` accepts `1|true|yes|on` and nothing else turns the switch on. The deployment docs say
    // `1`; `api/db.ts` reads the same parsed value rather than a second, stricter check of its own, so
    // the kernel connection and the legacy one cannot end up on different journals.
    expect(loadConfig({ env: { DATABASE_SKIP_WAL: 'true' } as NodeJS.ProcessEnv }).databaseSkipWal).toBe(true);
    expect(loadConfig({ env: { DATABASE_SKIP_WAL: '0' } as NodeJS.ProcessEnv }).databaseSkipWal).toBe(false);
  });

  it('leaves a fresh database in WAL by default', async () => {
    await expect(openWith({}, temporaryDirectory())).resolves.toBe('wal');
  });

  it('moves a fresh database off WAL when the switch is on', async () => {
    await expect(openWith({ databaseSkipWal: true }, temporaryDirectory())).resolves.toBe('delete');
  });

  it('converts a database that was already in WAL, rather than trusting the flag', async () => {
    const directory = temporaryDirectory();

    // First boot: WAL, as every deployment before this switch did.
    await expect(openWith({}, directory)).resolves.toBe('wal');
    await kernel?.shutdown();
    kernel = null;

    // Second boot with the flag: the mode must actually change. Without this, a deployment that
    // turned the switch on after the fact would keep WAL and only *believe* it had moved.
    await expect(openWith({ databaseSkipWal: true }, directory)).resolves.toBe('delete');
  });
});
