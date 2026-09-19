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

async function probe(pathname: string, init?: RequestInit): Promise<ProbeResponse> {
  const response = await fetch(base + pathname, { redirect: 'manual', ...init });
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
      'assignments',
      'battles',
      'challenge',
      'classroom',
      'collaboration',
      'dungeon',
      'economy',
      'gacha',
      'learning',
      'marketplace',
      'parent-buff',
      'pet',
      'portal',
      'slg',
      'system',
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

  it('serves a migrated route from its plugin, not from api/modules', async () => {
    // This said "dungeon is still an api/modules Nest module" - it is not, and has not
    // been since P4.3b.2. `plugins/dungeon/src/dungeon.service.ts:91` is the source of
    // this message, which is what makes it evidence for the right thing: the legacy
    // composition is serving a *plugin* controller's real error path. The route answers
    // 404 for a student that does not exist, so status alone proves nothing - the *body*
    // distinguishes "controller ran" ("学生未找到") from "route not mounted"
    // (Nest's catch-all "Cannot GET ...").
    const response = await probe('/api/dungeon/students/1/run');

    expect(response.body).toContain('学生未找到');
    expect(response.body).not.toContain('Cannot GET');
  });

  it('serves the migrated system domain from its plugin', async () => {
    // `api/modules/system` is gone (P4.3b.5) and these routes have no legacy module
    // left. The empty-id list comes from the plugin's own repository, so a 200 with the
    // `{success, questions}` envelope proves the plugin served it: a route that was not
    // mounted would answer Nest's catch-all instead.
    const response = await probe('/api/system/questions?teacherId=7');

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');
    expect(JSON.parse(response.body)).toEqual({ success: true, questions: [] });
  });

  it('serves the migrated assignments/exams domain from its plugin', async () => {
    // `api/modules/learning` no longer declares these two controllers (P4.3b.5b); the
    // routes come from `plugins/assignments` through the legacy root module. The envelope
    // carries the class list straight from the plugin's repository, and the `data`/`exams`
    // keys are the ones the deleted controller produced.
    const response = await probe('/api/exams?class_id=1');

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');
    expect(JSON.parse(response.body)).toEqual({ success: true, data: [] });
  });

  it('serves the split-out parent-buff action from its plugin', async () => {
    // `api/modules/platform` no longer declares ParentBuffController (P4.3b.5d). An empty
    // body is rejected by the *plugin's* first guard before any write, so this needs no
    // seeded student - and the body is what distinguishes "the plugin's controller ran"
    // from "the route is not mounted" (Nest answers `Cannot POST /api/parent-buff`).
    const response = await probe('/api/parent-buff', { method: 'POST' });

    expect(response.status).toBe(400);
    expect(response.body).toContain('Student ID required');
    expect(response.body).not.toContain('Cannot POST');
  });

  it('serves the migrated classroom HTTP surface from its plugin', async () => {
    // P4.3b.6b deleted api/modules/classroom, so the 47 METHOD+PATH pairs the frontend
    // calls for students/classes/groups/presets/attendance/leaves are served by
    // plugins/classroom through the legacy root module.
    //
    // This request carries no credential at all, and that is the point: `listClasses` has
    // four actor branches and *throws 403* when none of them matches - the same
    // `throw new ApiError(403, '无权限查看班级')` the pre-migration service ended with
    // (`api/modules/classroom/classroom.service.ts` at HEAD, the method's last line). So 403
    // is the correct pre-migration behaviour, and asserting 200 here asserted a world in
    // which the service silently returned an empty list to an anonymous caller.
    //
    // Which means the status code proves nothing on its own - an unmounted route answers 404
    // and a mounted one answers 403, but the *body* is what distinguishes "the plugin's
    // controller ran" from "Nest's catch-all answered". Hence the message assertion.
    const response = await probe('/api/classes');

    expect(response.status).toBe(403);
    expect(response.body).toContain('无权限查看班级');
    expect(response.body).not.toContain('Cannot GET');
  });

  it('serves the migrated classroom envelope to a credentialed caller', async () => {
    // The other half of the contract: with a teacher actor the same route answers 200, and the
    // payload keeps this domain's legacy envelope - a `classes` key, not `data`, whose rows are
    // the raw `classes` shape (the 19 `enable_*` columns included). `data.classes` would be a
    // silently different response shape for every existing client.
    //
    // The list is not asserted empty: `initDb()` seeds a `默认班级` for the default teacher, so a
    // fresh legacy database legitimately has one class. Asserting emptiness would pin the seed,
    // not the route.
    const response = await probe('/api/classes', {
      headers: { 'x-user-role': 'teacher', 'x-user-id': '1' },
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');

    const payload = JSON.parse(response.body) as { success: boolean; classes: Array<Record<string, unknown>> };
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.classes)).toBe(true);
    expect(payload).not.toHaveProperty('data');
    if (payload.classes.length > 0) {
      expect(payload.classes[0]).toHaveProperty('enable_achievements');
      expect(payload.classes[0]).toHaveProperty('invite_code');
    }
  });

  it('serves the migrated learning domain from its plugin', async () => {
    // The other half of api/modules/learning (papers / knowledge / wrong-questions /
    // study-plans) is plugins/learning now. subjects is a plain list read, so an empty
    // database answers `{success, data: []}` - and a route served by the deleted module
    // cannot be what answered it.
    const response = await probe('/api/knowledge/subjects');

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');
    expect(JSON.parse(response.body)).toEqual({ success: true, data: [] });
  });

  it('distinguishes a missing resource from a missing route', async () => {
    const missingResource = await probe('/api/pet/students/999/dashboard');
    const missingRoute = await probe('/api/pet/nope-not-a-route');

    expect(missingResource.status).toBe(404);
    expect(missingRoute.status).toBe(404);

    // Both are 404, but only one went through a controller. Since P4.3b.6 there is no
    // `api/modules/pet` left at all, so "Student not found" can only come from the plugin's
    // own service: the legacy module that used to answer this path is deleted.
    expect(missingResource.body).toContain('Student not found');
    expect(missingRoute.body).toContain('Cannot GET');
    expect(missingResource.body).not.toBe(missingRoute.body);
  });

  it('serves the migrated pet domain from its plugin, through the classroom port', async () => {
    // `GET /api/pet/classes/:classId` builds its answer from `classroom.public.listClassStudents`,
    // so an empty database answering `{success, data:{students:[]}, students:[]}` proves three
    // things at once: the plugin's controller ran, the port resolved, and both envelope copies
    // are intact. A route that was not mounted would be Nest's catch-all instead.
    const response = await probe('/api/pet/classes/1');

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');
    expect(JSON.parse(response.body)).toEqual({ success: true, data: { students: [] }, students: [] });
  });

  it('serves the legacy /api/pets alias family from the plugin too', async () => {
    // The parent dashboard still calls `/api/pets/${studentId}`. Its envelope has no `data`
    // key at all - a different shape from `/api/pet/...` - and the pet plugin answers both.
    const response = await probe('/api/pets/999');

    expect(response.status).toBe(404);
    expect(response.body).toContain('Student not found');
    expect(response.body).not.toContain('Cannot GET');
  });
});
