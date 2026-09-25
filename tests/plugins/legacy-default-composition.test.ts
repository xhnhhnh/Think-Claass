/**
 * The default composition must serve business routes.
 *
 * This file exists because the whole test suite passed while the *deployed* configuration served
 * nothing. `PLUGINS_ENABLED` defaulted to `false`, `api/app.ts` returned early when it was false, and
 * `api/app.module.ts` had long since become `imports: []` - so `npm run dev`, `npm start` and every
 * PM2 deployment (see `scripts/deploy-common.sh`) booted an application whose every business route
 * answered 404. `GET /api/health` still answered `200 {"success":true}` with `plugins: { total: 0 }`,
 * which is why it looked healthy: the two compositions are indistinguishable over HTTP.
 *
 * Nothing caught it, and the reason is worth stating precisely, because it is the trap this file
 * closes:
 *
 *   - `tests/plugins/legacy-boot-probe.test.ts` is the only other test that boots the real server, and
 *     it pins `PLUGINS_ENABLED: '1'` explicitly. It therefore proved the *working* configuration works
 *     and could never observe the default.
 *   - `tests/kernel/kernel-boot.test.ts` does assert "business routes 404", but behind an explicit
 *     `pluginsEnabled: false` override, so it pins kernel-only mode rather than the default.
 *   - `tests/guardrails/api-surface-snapshot.test.ts` scans route *declarations* in source, so it is
 *     green in a world where none of them are mounted.
 *
 * So the fix has three parts and this file pins all three:
 *
 *   A. with no composition variable set at all, the app serves its business routes;
 *   B. legacy + `PLUGINS_ENABLED=0` fails the boot instead of serving nothing;
 *   C. `KERNEL_ENABLED=1 PLUGINS_ENABLED=0` - the documented kernel-only deployment - still boots.
 *
 * The probes talk real HTTP to a real child process, because every cheaper assertion is exactly the
 * kind that was already green in the broken world. Each child gets its own temporary database, so a
 * developer's `database.sqlite` is never touched and the cases cannot interfere.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSX = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

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

interface BootedProbe {
  child: ChildProcess;
  base: string;
  log: () => string;
}

interface BootOptions {
  /** Composition variables for the child. `undefined` deletes the key, which is the point of case A. */
  env: Record<string, string | undefined>;
  /** When true, wait for the process to exit instead of for the port to answer. */
  expectExit?: boolean;
}

/**
 * Start `api/server.ts` in a child process.
 *
 * `undefined` deletes the variable rather than setting it to `''`, because case A must reproduce a
 * deployment where nobody ever set it - an empty string would still be a set variable, and the
 * difference is the entire subject of this test.
 */
function boot(options: BootOptions): BootedProbe {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-default-composition-'));
  const port = Number(options.env.PORT);
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    LOG_LEVEL: 'warn',
    DATABASE_FILE: path.join(tempDir, 'probe.sqlite'),
    // Deterministic console credentials: `.env` would otherwise win over the seed, since
    // `dotenv.config()` runs before `initDb()` and dotenv does not override variables already set.
    SUPERADMIN_USERNAME: 'probe-root',
    SUPERADMIN_PASSWORD: 'probe-secret',
  };

  for (const [key, value] of Object.entries(options.env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }

  const child = spawn(process.execPath, [TSX, 'api/server.ts'], {
    cwd: ROOT,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

  return { child, base: `http://127.0.0.1:${port}`, log: () => output };
}

/** Poll `/api/health` until the child answers or the deadline passes. */
async function waitForReady(probe: BootedProbe, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (probe.child.exitCode !== null) return false;
    try {
      const response = await fetch(`${probe.base}/api/health`);
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

/** Wait for the child to exit on its own (used by the cases that must fail the boot). */
async function waitForExit(probe: BootedProbe, timeoutMs = 90_000): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (probe.child.exitCode !== null) return probe.child.exitCode;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

async function probe(base: string, pathname: string): Promise<{ status: number; body: string }> {
  const response = await fetch(base + pathname, { redirect: 'manual' });
  return { status: response.status, body: await response.text() };
}

/**
 * A superadmin session for the probes that reach an actor-scoped plugin route.
 *
 * Needed since the authorization round: `/api/pets/:studentId` is ruled
 * `student（本人）/ parent（孩子）/ teacher（本班）` in `docs/security/route-authorization-matrix.md`, so
 * an anonymous caller is refused with 401 *before* the service can answer its own 404 - and this
 * test exists precisely to tell those two apart. The credentials are the ones the boot above pins.
 */
async function superadminToken(base: string): Promise<string> {
  const response = await fetch(`${base}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'probe-root', password: 'probe-secret' }),
  });
  const payload = (await response.json()) as { data?: { token?: string } };
  if (!payload.data?.token) throw new Error(`admin login failed: ${JSON.stringify(payload)}`);
  return payload.data.token;
}

function stop(probe: BootedProbe | null): void {
  if (probe && probe.child.exitCode === null) probe.child.kill();
}

/** The 23 in-repo plugin ids the default composition must activate. */
const PLUGIN_IDS = [
  'admin',
  'ai-study', 'assignments', 'battles', 'challenge', 'classroom', 'collaboration', 'dungeon',
  'economy', 'engagement', 'gacha', 'homework', 'identity', 'insights', 'learning', 'marketplace',
  'parent-buff', 'payment', 'pet', 'portal', 'slg', 'system', 'wechat',
].sort();

describe('the default composition serves business routes', () => {
  let defaultProbe: BootedProbe | null = null;
  let defaultPort = 0;

  beforeAll(async () => {
    defaultPort = await freePort();
    defaultProbe = boot({
      env: {
        // Case A: exactly what a deployment looks like when nobody sets these.
        // `KERNEL_ENABLED` unset selects the legacy composition (the default and rollback target);
        // `PLUGINS_ENABLED` unset must resolve to the plugin host being ON.
        KERNEL_ENABLED: undefined,
        PLUGINS_ENABLED: undefined,
        PORT: String(defaultPort),
      },
    });

    const ready = await waitForReady(defaultProbe);
    expect(ready, `default composition never became ready\n--- output ---\n${defaultProbe.log()}`).toBe(true);
  }, 150_000);

  afterAll(() => stop(defaultProbe));

  it('resolves pluginsEnabled to true when the variable is unset', async () => {
    const response = await probe(defaultProbe!.base, '/api/kernel/info');
    expect(response.status).toBe(200);

    const payload = JSON.parse(response.body) as { data: { pluginsEnabled: boolean } };
    // The single fact the broken default got wrong. Asserting it directly means a regression names
    // the cause instead of only reporting that some downstream route 404s.
    expect(payload.data.pluginsEnabled).toBe(true);
  });

  it('activates the whole in-repo plugin set', async () => {
    const response = await probe(defaultProbe!.base, '/api/kernel/plugins');
    expect(response.status).toBe(200);

    const payload = JSON.parse(response.body) as { data: Array<{ id: string }> };
    expect(payload.data.map((plugin) => plugin.id).sort()).toEqual(PLUGIN_IDS);
  });

  it('serves a plugin-owned route instead of the catch-all', async () => {
    // `plugins/portal` owns `/api/website/home`. In the broken world this answered Nest's catch-all
    // 404; what distinguishes "mounted, resource missing" from "not mounted at all" is the body, so
    // the body is what is asserted - not the status.
    const response = await probe(defaultProbe!.base, '/api/website/home');

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');
    expect(JSON.parse(response.body)).toMatchObject({ success: true });
  });

  it('reaches a plugin controller on a parameterised business route', async () => {
    // `/api/pets/:studentId` is served by `plugins/pet` and answers the plugin's own 404 for a student
    // that does not exist in a fresh database. A route that was never mounted answers the catch-all
    // instead - same status, different body - so the body is the assertion.
    //
    // The request carries a staff session because the route is scoped now: an anonymous caller is
    // refused with 401, which would be indistinguishable from a missing route in exactly the way
    // this test exists to rule out.
    const token = await superadminToken(defaultProbe!.base);
    const response = await fetch(`${defaultProbe!.base}/api/pets/999`, {
      redirect: 'manual',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await response.text();

    expect(body).toContain('Student not found');
    expect(body).not.toContain('Cannot GET');
  });

  it('serves the migrated classroom surface from its plugin', async () => {
    // The endpoints a deployment loses most visibly. `listClasses` refuses an anonymous caller with
    // 403 - the pre-migration behaviour - so the status proves the route resolved and the body proves
    // a controller ran rather than the catch-all.
    const response = await probe(defaultProbe!.base, '/api/classes');

    expect(response.status).toBe(403);
    expect(response.body).toContain('无权限查看班级');
    expect(response.body).not.toContain('Cannot GET');
  });
});

describe('the compositions that must fail loudly', () => {
  let refusedProbe: BootedProbe | null = null;
  let kernelOnlyProbe: BootedProbe | null = null;

  afterAll(() => {
    stop(refusedProbe);
    stop(kernelOnlyProbe);
  });

  it('refuses to boot legacy with the plugin host switched off', async () => {
    // Case B. This pairing has no legitimate use: `api/app.module.ts` is `imports: []`, so with the
    // host off there is no module to mount and every business route 404s. Before `assertUsableComposition`
    // this booted "successfully" and served nothing.
    const port = await freePort();
    refusedProbe = boot({
      env: { KERNEL_ENABLED: '0', PLUGINS_ENABLED: '0', PORT: String(port) },
    });

    const exitCode = await waitForExit(refusedProbe);
    expect(exitCode, `expected a non-zero exit, got ${exitCode}\n${refusedProbe.log()}`).not.toBe(0);
    // The message names the variable and both ways out, so the operator does not have to read source.
    expect(refusedProbe.log()).toContain('not a usable configuration for the legacy composition');
    expect(refusedProbe.log()).toContain('KERNEL_ENABLED=1');
  }, 120_000);

  it('still boots kernel-only, which is the documented way to run without plugins', async () => {
    // Case C. The guard above must not swallow this: `KERNEL_ENABLED=1 PLUGINS_ENABLED=0` is a
    // supported deployment (`docs/migration/HANDOFF.md`), and it legitimately serves zero plugins.
    const port = await freePort();
    kernelOnlyProbe = boot({
      env: { KERNEL_ENABLED: '1', PLUGINS_ENABLED: '0', PORT: String(port) },
    });

    const ready = await waitForReady(kernelOnlyProbe, 60_000);
    expect(ready, `kernel-only composition never became ready\n${kernelOnlyProbe.log()}`).toBe(true);

    const health = await probe(kernelOnlyProbe.base, '/api/health');
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toMatchObject({ kernel: { plugins: { total: 0, active: 0 } } });

    // And it genuinely has no business routes - distinguished by the kernel's own NOT_FOUND envelope
    // rather than by status alone, since a mounted-but-failing route would also answer 404.
    const business = await probe(kernelOnlyProbe.base, '/api/students');
    expect(business.status).toBe(404);
    expect(JSON.parse(business.body)).toMatchObject({ code: 'NOT_FOUND' });
  }, 120_000);
});
