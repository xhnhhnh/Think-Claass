/**
 * Real-startup probe for the legacy composition.
 *
 * P4.3b moves whole domains out of `api/modules/**` and into `plugins/**`. That is
 * only safe if a plugin's routes stay reachable in the *legacy* composition too,
 * because legacy is the default (`KERNEL_ENABLED` unset) and the rollback target.
 *
 * Static tests cannot prove this. The failure mode is a middleware / Nest-instance
 * ordering problem: the plugin host used to create its own Nest instance, and a
 * second instance installs a second catch-all not-found handler, so whichever
 * registered first swallowed the other's routes. The only way to see it is to boot
 * the real server and issue real requests.
 *
 * So this test starts `api/server.ts` in a child process with `PLUGINS_ENABLED=1`
 * and no `KERNEL_ENABLED`, then asserts:
 *
 *   1. a plugin-only route answers 200 (served by the plugin, in the legacy app);
 *   2. a route owned by a not-yet-migrated module still answers (403 - the real
 *      business rule - rather than 404 from a catch-all);
 *   3. a registered route and an unregistered route both answer 404 but with
 *      *different* bodies, which distinguishes "handled, resource missing" from
 *      "route not mounted at all". This is the assertion that actually detects
 *      route shadowing.
 *
 * The database is redirected with `DATABASE_FILE` so the probe never touches the
 * developer's `database.sqlite`.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A free port, so a parallel test run cannot collide with this one. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      server.close(() => resolve(address.port));
    });
  });
}

interface ProbeResponse {
  status: number;
  body: string;
}

let child: ChildProcess | null = null;
let base = '';
let tempDir = '';
let startupLog = '';

async function probe(pathname: string): Promise<ProbeResponse> {
  const response = await fetch(base + pathname, { redirect: 'manual' });
  return { status: response.status, body: await response.text() };
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-legacy-probe-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;

  child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'api/server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PLUGINS_ENABLED: '1',
      KERNEL_ENABLED: '0',
      PORT: String(port),
      LOG_LEVEL: 'warn',
      DATABASE_FILE: path.join(tempDir, 'probe.sqlite'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk: Buffer) => (startupLog += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (startupLog += chunk.toString()));

  // The legacy composition replays the historical boot DDL, so boot is not instant.
  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  expect(ready, `legacy server never became ready on ${base}\n--- output ---\n${startupLog}`).toBe(true);
}, 120_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('legacy composition serves plugin routes', () => {
  it('activates the in-repo plugins', async () => {
    const response = await probe('/api/kernel/plugins');
    expect(response.status).toBe(200);

    const payload = JSON.parse(response.body) as { data: Array<{ id: string }> };
    const ids = payload.data.map((plugin) => plugin.id).sort();
    expect(ids).toEqual([
      'battles',
      'challenge',
      'classroom',
      'collaboration',
      'dungeon',
      'economy',
      'gacha',
      'marketplace',
      'pet',
      'slg',
    ]);
  });

  it('serves a plugin-only route (the route does not exist in api/modules)', async () => {
    const response = await probe('/api/pet/health');
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ success: true, data: { plugin: 'pet' } });
  });

  it('serves a migrated domain from the plugin, not from api/modules', async () => {
    // `api/modules/economy` no longer exists - these 20 routes are served by
    // plugins/economy through the legacy root module. 403 is the class feature gate
    // ("该功能当前已关闭") firing through the port, which proves the whole path ran:
    // plugin controller -> service -> classroom.public -> capability/column fallback.
    // A route that was not mounted would be 404.
    const response = await probe('/api/economy/classes/1/stocks');
    expect(response.status).toBe(403);
    expect(response.body).toContain('该功能当前已关闭');
  });

  it('serves a route owned by a not-yet-migrated module', async () => {
    // dungeon is still an api/modules Nest module, so this asserts the legacy modules
    // did not regress when plugin modules joined the root. The route answers 404 for a
    // student that does not exist, so status alone proves nothing - the *body* is what
    // distinguishes "controller ran" ("学生未找到") from "route not mounted"
    // (Nest's catch-all "Cannot GET ...").
    const response = await probe('/api/dungeon/students/1/run');

    expect(response.body).toContain('学生未找到');
    expect(response.body).not.toContain('Cannot GET');
  });

  it('distinguishes a missing resource from a missing route', async () => {
    const missingResource = await probe('/api/pet/students/999/dashboard');
    const missingRoute = await probe('/api/pet/nope-not-a-route');

    expect(missingResource.status).toBe(404);
    expect(missingRoute.status).toBe(404);

    // Both are 404, but only one went through a controller. If the plugin module
    // had been shadowed, `missingResource` would carry Nest's catch-all body.
    expect(missingResource.body).toContain('Student not found');
    expect(missingRoute.body).toContain('Cannot GET');
    expect(missingResource.body).not.toBe(missingRoute.body);
  });
});
