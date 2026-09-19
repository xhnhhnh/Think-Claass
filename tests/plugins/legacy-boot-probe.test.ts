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
      // Deterministic console credentials. `api/server.ts` calls `dotenv.config()` before
      // `initDb()`, so a value in the repository's `.env` would otherwise win over the seed -
      // and dotenv does not override variables that are already set, which is what makes
      // pinning them here enough (this is the trap P4.3b.7 recorded when a probe's login kept
      // answering 401).
      SUPERADMIN_USERNAME: 'probe-root',
      SUPERADMIN_PASSWORD: 'probe-secret',
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
      'admin',
      'assignments',
      'battles',
      'challenge',
      'classroom',
      'collaboration',
      'dungeon',
      'economy',
      'engagement',
      'gacha',
      'identity',
      'insights',
      'learning',
      'marketplace',
      'parent-buff',
      'payment',
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

  it('serves the admin console from its plugin in this composition', async () => {
    // `api/modules/admin` was the last module and P4.3b.14 deleted it, so `/api/admin/*` is served
    // by `plugins/admin` - and this is the composition where that is easiest to get wrong: the
    // legacy Nest root imports the plugin modules itself, and the console's controllers depend on
    // ports (`identity.public`, `classroom.public`) that must be published before a request arrives.
    //
    // The login below is the end-to-end proof: it reaches `identity.public.verifyAdminCredentials`
    // against the real `users` table, and the token it returns is a kernel session - so a 200 on the
    // second request means the console's own controller, the permission check and the identity port
    // all ran in this process.
    const login = await probe('/api/admin/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'probe-root', password: 'probe-secret' }),
    });

    expect(login.status).toBe(200);
    expect(login.body).not.toContain('Cannot POST');
    const session = JSON.parse(login.body) as { success: boolean; data: { user: { role: string }; token?: string } };
    expect(session.success).toBe(true);
    expect(session.data.user.role).toBe('superadmin');
    expect(typeof session.data.token).toBe('string');

    const users = await probe('/api/admin/users', {
      headers: { authorization: `Bearer ${session.data.token}` },
    });
    expect(users.status).toBe(200);
    expect(users.body).not.toContain('Cannot GET');
    const listed = JSON.parse(users.body) as { success: boolean; data: { items: unknown[]; total: number } };
    expect(listed.success).toBe(true);
    // `initDb()` seeds one teacher (`admin`), so this asserts the port answered rather than
    // pinning the seed count.
    expect(listed.data.total).toBeGreaterThan(0);

    // And the anonymous half: the console's routes are still gated in this composition.
    expect((await probe('/api/admin/users')).status).toBe(401);
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

  it('serves the migrated insights domain from its plugin, through the report ports', async () => {
    // `api/modules/insights` is gone (P4.3b.13) and the three `/api/analytics` routes are
    // plugins/insights'. This is the round whose whole point is that the domain owns **no tables**: it
    // answers by calling `classroom.public` and `engagement.public`.
    //
    // A missing class is the case that proves the port path ran: the service asks
    // `getClassReportInputs`, gets `class: null`, and answers the legacy 404. A route that was not
    // mounted answers Nest's catch-all instead - same status, different body - so both are asserted.
    const missing = await probe('/api/analytics/classes/999/overview');
    expect(missing.status).toBe(404);
    expect(missing.body).toContain('Class not found');
    expect(missing.body).not.toContain('Cannot GET');

    // The boot-seeded class exists, so this one goes all the way through the port: aggregates from
    // classroom, praise count from engagement, and the derived rates computed here.
    const overview = await probe('/api/analytics/classes/1/overview');
    expect(overview.status, `overview body: ${overview.body}`).toBe(200);
    expect(overview.body).not.toContain('Cannot GET');

    const payload = JSON.parse(overview.body) as {
      success: boolean;
      class: { id: number; name: string };
      summary: Record<string, number>;
      distributions: unknown[];
      top_students: unknown[];
    };
    expect(payload.success).toBe(true);
    expect(payload.class.id).toBe(1);
    // Every key the summary contract names, present and numeric - the shape the dashboard reads.
    for (const key of [
      'total_students',
      'average_points',
      'max_points',
      'min_points',
      'average_exam_score',
      'assignment_completion_rate',
      'attendance_rate',
      'praise_count',
      'leave_count',
    ]) {
      expect(typeof payload.summary[key], `summary.${key}`).toBe('number');
    }
    expect(Array.isArray(payload.distributions)).toBe(true);
    expect(Array.isArray(payload.top_students)).toBe(true);
  });

  it('answers the insights access check on a real request', async () => {
    // An anonymous caller is refused by the access check *before* any port call, so this also shows
    // the 403/404 split: a bogus student id is a 403 for an anonymous caller, not a 404.
    const anonymous = await probe('/api/analytics/students/1/radar');
    expect(anonymous.status).toBe(403);
    expect(anonymous.body).not.toContain('Cannot GET');

    // With the legacy header bridge, a teacher asking about a class they do not own gets the
    // class-overview refusal - the other hand-written gate in this domain.
    const teacher = await probe('/api/analytics/classes/999/overview', {
      headers: { 'x-user-role': 'teacher', 'x-user-id': '1' },
    });
    expect(teacher.status).toBe(403);
    expect(teacher.body).toContain('无权限查看该班级分析');
  });

  it('runs the migrated identity domain through a real login', async () => {
    // `api/modules/auth` is gone (P4.3b.7) and these four routes are plugins/identity's. This is
    // the strongest available evidence that the move kept working: a real HTTP login against a real
    // database, answered by the plugin's own repository through the ownership-checked `ctx.db`.
    //
    // The account is the teacher `initDb()` always seeds with a literal password (`admin` /
    // `admin123`), not the superadmin: `createApp()` calls `dotenv.config()` before `initDb()`, so
    // a populated `SUPERADMIN_USERNAME`/`SUPERADMIN_PASSWORD` in `.env` *replaces* the seeded
    // superadmin's credentials and the literal defaults are then wrong. Measured, not assumed.
    //
    // The token matters as much as the body: it is minted from `ctx.sessions`, so a session that
    // verifies on the next request proves the plugin is wired to the kernel's session store rather
    // than to a private one.
    const login = await probe('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123', role: 'teacher' }),
    });

    expect(login.status, `login body: ${login.body}`).toBe(200);
    expect(login.body).not.toContain('Cannot POST');

    const payload = JSON.parse(login.body) as {
      success: boolean;
      user: { id: number; role: string; username: string };
      token?: string;
      expiresAt?: string;
    };
    expect(payload.success).toBe(true);
    expect(payload.user.role).toBe('teacher');
    expect(typeof payload.token).toBe('string');
    expect(payload.expiresAt).toBeTruthy();

    // The issued session is accepted on the next request: the profile route reads the actor from the
    // kernel's request context, which resolves a Bearer token through the same session store the
    // plugin issued it from. An invalid or unknown token would make the caller anonymous (403).
    const profile = await probe('/api/auth/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${payload.token}` },
      body: JSON.stringify({ username: 'admin' }),
    });
    expect(profile.status, `profile body: ${profile.body}`).toBe(200);
    expect(JSON.parse(profile.body)).toMatchObject({ success: true, user: { username: 'admin' } });
  });

  it('answers a bad identity login with the plugin own 401, not a catch-all 404', async () => {
    const response = await probe('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong', role: 'teacher' }),
    });

    expect(response.status).toBe(401);
    expect(response.body).toContain('账号或密码错误');
    expect(response.body).not.toContain('Cannot POST');
  });

  it('serves the kernel login route through the verifier the identity plugin registered', async () => {
    // `POST /api/kernel/auth/login` lives in the kernel router and predates the plugin runtime. It
    // used to be served by `api/modules/auth/legacyAuthProvider.ts`; that adapter is deleted, and
    // the route now works because plugins/identity registers an `AuthProvider` through
    // `ctx.auth.registerProvider` during setup. Without that registration this answers 503, so a
    // 200 here is the whole wiring proof.
    const response = await probe('/api/kernel/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123', role: 'teacher' }),
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ success: true, data: { token: expect.any(String) } });
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

  it('runs the migrated payment domain end to end: order, webhook, and the account it opens up', async () => {
    // `api/modules/platform` is gone (P4.3b.8) and these three routes are plugins/payment's - an
    // `infrastructure`-tier plugin, because it owns live orders and cannot be switched off like a
    // feature. This walks the whole chain against the real server:
    //
    //   login -> create an order -> a bad signature is rejected -> the real mock webhook settles it
    //   -> the order reads PAID *and* the account it paid for reports is_activated: true.
    //
    // The last step is the one that matters. `is_activated` lives in `users` (identity's table) and
    // the order lives in `payment_orders` (this plugin's), so observing both changed proves the
    // cross-plugin activation port actually ran - no fake can show that.
    const login = await probe('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123', role: 'teacher' }),
    });
    const token = (JSON.parse(login.body) as { token: string }).token;
    const auth = { 'content-type': 'application/json', authorization: `Bearer ${token}` };

    const created = await probe('/api/payment/create', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ method: 'wechat' }),
    });
    expect(created.status, `create body: ${created.body}`).toBe(200);

    const order = JSON.parse(created.body) as {
      success: boolean;
      message: string;
      data: { orderNo: string; status: string; amount: number; environment: string; providerMode: string };
    };
    expect(order.success).toBe(true);
    expect(order.message).toBe('订单创建成功');
    expect(order.data.status).toBe('AWAITING_PAYMENT');
    expect(order.data.environment).toBe('mock');

    const status = await probe(`/api/payment/status/${order.data.orderNo}`, { headers: auth });
    expect(status.status).toBe(200);
    expect(JSON.parse(status.body)).toMatchObject({ success: true, data: { orderNo: order.data.orderNo } });

    // A webhook with no signature header must be refused: the mock provider only accepts the
    // literal `mock-valid-signature`, so this proves verification runs before anything is written.
    const unsigned = await probe('/api/payment/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNo: order.data.orderNo, method: 'wechat', trade_status: 'SUCCESS' }),
    });
    expect(unsigned.status).toBe(401);
    expect(unsigned.body).toContain('Invalid signature');

    const notified = await probe('/api/payment/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-payment-signature': 'mock-valid-signature' },
      body: JSON.stringify({ orderNo: order.data.orderNo, method: 'wechat', trade_status: 'SUCCESS' }),
    });
    // The channel expects the literal `success` string, not an envelope.
    expect(notified.status, `notify body: ${notified.body}`).toBe(200);
    expect(notified.body).toBe('success');

    const settled = await probe(`/api/payment/status/${order.data.orderNo}`, { headers: auth });
    expect(JSON.parse(settled.body)).toMatchObject({ success: true, data: { status: 'PAID' } });

    // And the account is open: `users.is_activated` flipped through identity.public.activateUser.
    const profile = await probe('/api/auth/profile', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ username: 'admin' }),
    });
    expect(profile.status, `profile body: ${profile.body}`).toBe(200);
    expect(JSON.parse(profile.body)).toMatchObject({ success: true, user: { is_activated: true } });
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
