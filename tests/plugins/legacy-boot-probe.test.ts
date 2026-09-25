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
 *
 * ## A fresh database now has exactly one account
 *
 * `initDb()` used to fabricate demo rows on every boot: the teacher `admin` / `admin123`, a
 * `默认班级`, four shop items and six point presets. All of it is gone, so a clean install contains
 * the schema, the neutral settings and one superadmin built from `SUPERADMIN_USERNAME` /
 * `SUPERADMIN_PASSWORD` - nothing a probe may assert as "seeded". The prerequisites this file needs
 * (a teacher, a class, a configured payment environment) are therefore created through the real API
 * in the `beforeAll` below, which is also the stronger assertion: they prove the endpoints that
 * create them work.
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
/**
 * The class the setup creates. The probes that used to hardcode class `1` (which the removed
 * `默认班级` seed happened to occupy) use this id instead.
 */
let probeClassId = 0;

async function probe(pathname: string, init?: RequestInit): Promise<ProbeResponse> {
  const response = await fetch(base + pathname, { redirect: 'manual', ...init });
  return { status: response.status, body: await response.text() };
}

/**
 * A superadmin session for the probes that used to be anonymous. The legacy composition *creates*
 * `probe-root` from `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` (see the `env` block above), and one
 * login is reused for the whole file.
 */
let cachedSuperadminToken: string | null = null;
async function superadminToken(): Promise<string> {
  if (cachedSuperadminToken) return cachedSuperadminToken;

  const response = await probe('/api/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'probe-root', password: 'probe-secret' }),
  });
  const payload = JSON.parse(response.body) as { data?: { token?: string } };
  expect(typeof payload.data?.token, `login body: ${response.body}`).toBe('string');
  cachedSuperadminToken = payload.data!.token as string;
  return cachedSuperadminToken;
}

/**
 * A session for the teacher this file's setup creates (`probe-teacher` / `probe-teacher-secret`).
 *
 * `initDb()` no longer seeds a teacher: `admin` / `admin123` was fabricated demo data published in
 * this repository, so it is gone, and the probes that need a non-superadmin actor now use an account
 * created through `POST /api/admin/users` in the `beforeAll` below. The role is part of the
 * credential: `findUserByCredentials` looks a user up by `(username, role)`, so a superadmin cannot
 * log in with `role: 'teacher'`.
 *
 * The probes below used to present `x-user-role` / `x-user-id` headers instead. Those headers are
 * client-supplied and unverifiable, so `allowLegacyHeaderAuth` now defaults to off and they no longer
 * authenticate anyone - which is why every credentialed probe in this file logs in for real.
 */
let cachedTeacherToken: string | null = null;
async function teacherToken(): Promise<string> {
  if (cachedTeacherToken) return cachedTeacherToken;

  const response = await probe('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'probe-teacher', password: 'probe-teacher-secret', role: 'teacher' }),
  });
  const payload = JSON.parse(response.body) as { token?: string };
  expect(typeof payload.token, `teacher login body: ${response.body}`).toBe('string');
  cachedTeacherToken = payload.token as string;
  return cachedTeacherToken;
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
      // `initDb()`, so a value in the repository's `.env` would otherwise win - and dotenv does not
      // override variables that are already set, which is what makes pinning them here enough
      // (this is the trap P4.3b.7 recorded when a probe's login kept answering 401). A fresh
      // database has no superadmin row any more, so these two variables are now *required*, not
      // just convenient: `initDb()` refuses to invent a credential.
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

  // --- prerequisites, created through the real API -------------------------------------------
  //
  // The order matters: `createClass` falls back to the first `teachers` row when a non-teacher
  // actor creates a class (`classroom.service.ts`), so the teacher has to exist first.
  const admin = await superadminToken();
  const auth = { 'content-type': 'application/json', authorization: `Bearer ${admin}` };

  const teacherCreated = await probe('/api/admin/users', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ username: 'probe-teacher', password: 'probe-teacher-secret' }),
  });
  expect(teacherCreated.status, `create teacher body: ${teacherCreated.body}`).toBe(200);

  const classCreated = await probe('/api/classes', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: '探针班级' }),
  });
  expect(classCreated.status, `create class body: ${classCreated.body}`).toBe(200);
  probeClassId = (JSON.parse(classCreated.body) as { class: { id: number } }).class.id;
  expect(Number.isInteger(probeClassId) && probeClassId > 0, `class body: ${classCreated.body}`).toBe(true);

  // The payment flow states its own environment and enables the channel it uses. Neither is a boot
  // seed any more: `payment_environment` is only seeded outside production and both channels are
  // seeded disabled.
  const settings = await probe('/api/admin/system/settings', {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ payment_environment: 'mock', payment_enable_wechat: '1' }),
  });
  expect(settings.status, `settings body: ${settings.body}`).toBe(200);
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
      'ai-study',
      'assignments',
      'battles',
      'challenge',
      'classroom',
      'collaboration',
      'dungeon',
      'economy',
      'engagement',
      'gacha',
      'homework',
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
    // A route that was not mounted would be 404, and a class that does not exist would be 404 too -
    // hence the setup-created id: the class is real and every `enable_*` flag on it defaults off.
    //
    // The request is credentialed because the route is: `GET /api/economy/classes/:classId/stocks`
    // now enforces the matrix's roles (class teacher / student of the class / admin), and an
    // anonymous caller is refused with 401 before the feature gate is ever consulted. The claim this
    // probe exists to make is about the *plugin* serving the route, so it has to get past the actor
    // gate to reach the gate being asserted. `probeClassId` is the class the superadmin created for
    // `probe-teacher` (`createClass` falls back to the first teacher row), so the teacher owns it
    // and this still lands on the feature gate rather than on an ownership refusal.
    const response = await probe(`/api/economy/classes/${probeClassId}/stocks`, {
      headers: { authorization: `Bearer ${await teacherToken()}` },
    });
    expect(response.status).toBe(403);
    expect(response.body).toContain('该功能当前已关闭');
  });

  it('serves a migrated route from its plugin, not from api/modules', async () => {
    // This said "dungeon is still an api/modules Nest module" - it is not, and has not
    // been since P4.3b.2.
    //
    // The route is guarded now (the matrix rules it `student（本人）/teacher（本班，只读）`), so the
    // anonymous half asserts the plugin's own gate and the credentialed half asserts the plugin's own
    // service path: the probe database holds no students, so a teacher gets the 404 the dungeon
    // service has always thrown. Both bodies distinguish "the plugin's controller ran" from
    // "route not mounted" (Nest's catch-all "Cannot GET ..."), which is what this probe is for.
    const anonymous = await probe('/api/dungeon/students/1/run');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toContain('未登录或登录已过期');
    expect(anonymous.body).not.toContain('Cannot GET');

    const response = await probe('/api/dungeon/students/1/run', {
      headers: { authorization: `Bearer ${await teacherToken()}` },
    });

    expect(response.status).toBe(404);
    expect(response.body).toContain('学生未找到');
    expect(response.body).not.toContain('Cannot GET');
  });

  it('serves the migrated system domain from its plugin, to an admin only', async () => {
    // `api/modules/system` is gone (P4.3b.5) and these routes have no legacy module
    // left. The empty-id list comes from the plugin's own repository, so a 200 with the
    // `{success, questions}` envelope proves the plugin served it: a route that was not
    // mounted would answer Nest's catch-all instead.
    //
    // The anonymous request comes first because this surface used to answer it with 200 -
    // `GET /api/system/backup/export` dumped the whole database, `users.password_hash`
    // included. `未登录或登录已过期` is the plugin's own gate, so the body still does the
    // real work: it distinguishes "the controller ran and refused" from "Cannot GET".
    const anonymous = await probe('/api/system/questions?teacherId=7');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toContain('未登录或登录已过期');
    expect(anonymous.body).not.toContain('Cannot GET');

    const response = await probe('/api/system/questions?teacherId=7', {
      headers: { authorization: `Bearer ${await superadminToken()}` },
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');
    expect(JSON.parse(response.body)).toEqual({ success: true, questions: [] });
  });

  it('serves the migrated assignments/exams domain from its plugin, to a credentialed caller only', async () => {
    // `api/modules/learning` no longer declares these two controllers (P4.3b.5b); the
    // routes come from `plugins/assignments` through the legacy root module. The envelope
    // carries the class list straight from the plugin's repository, and the `data`/`exams`
    // keys are the ones the deleted controller produced.
    //
    // The anonymous half comes first because this surface used to answer it with 200 and the exam
    // list of any class the caller named - it was one of the `无鉴权` rows of
    // `docs/security/route-authorization-matrix.md`. The message is the plugin's own gate, so the
    // body still does the real work: it distinguishes "the controller ran and refused" from
    // "Cannot GET".
    const anonymous = await probe(`/api/exams?class_id=${probeClassId}`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toContain('未登录或登录已过期');
    expect(anonymous.body).not.toContain('Cannot GET');

    // A session is what it takes now, and the answer is scoped to the caller: this teacher owns no
    // exam, so their own view of the class is the empty list the legacy envelope wraps.
    const response = await probe(`/api/exams?class_id=${probeClassId}`, {
      headers: { authorization: `Bearer ${await teacherToken()}` },
    });

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
    // The other half of the contract: with a credentialed caller the same route answers 200, and the
    // payload keeps this domain's legacy envelope - a `classes` key, not `data`, whose rows are
    // the raw `classes` shape (the 19 `enable_*` columns included). `data.classes` would be a
    // silently different response shape for every existing client.
    //
    // The list is not empty: the setup creates one class, and this teacher owns it. It is asserted
    // through the owner's own scope rather than pinned to a boot seed - there is no seeded class any
    // more, and `listClasses` narrows a teacher to their own rows.
    //
    // This used to present `x-user-role: teacher` / `x-user-id: 1` and rely on the legacy header
    // bridge. That bridge now defaults off - trusting client-supplied headers meant any caller could
    // be any user - so the probe logs in like a client does and presents the session it is issued.
    const response = await probe('/api/classes', {
      headers: { authorization: `Bearer ${await teacherToken()}` },
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');

    const payload = JSON.parse(response.body) as { success: boolean; classes: Array<Record<string, unknown>> };
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.classes)).toBe(true);
    expect(payload).not.toHaveProperty('data');
    expect(payload.classes.length).toBeGreaterThan(0);
    expect(payload.classes[0]).toHaveProperty('enable_achievements');
    expect(payload.classes[0]).toHaveProperty('invite_code');
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
    // The setup creates `probe-teacher` through this same endpoint, so the list is non-empty for a
    // reason the probe controls - not because a boot seed put a teacher there.
    expect(listed.data.total).toBeGreaterThan(0);

    // And the anonymous half: the console's routes are still gated in this composition.
    expect((await probe('/api/admin/users')).status).toBe(401);
  });

  it('serves the migrated learning domain from its plugin, to a logged-in caller only', async () => {
    // The other half of api/modules/learning (papers / knowledge / wrong-questions /
    // study-plans) is plugins/learning now. subjects is a plain list read, so an empty
    // database answers `{success, data: []}` - and a route served by the deleted module
    // cannot be what answered it.
    //
    // The knowledge-graph reads were this domain's last unguarded routes; the matrix rules them
    // 登录用户（teacher/student/admin）, so the anonymous request is asserted first and the body is
    // the plugin's own gate rather than Nest's catch-all.
    const anonymous = await probe('/api/knowledge/subjects');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toContain('未登录或登录已过期');
    expect(anonymous.body).not.toContain('Cannot GET');

    const response = await probe('/api/knowledge/subjects', {
      headers: { authorization: `Bearer ${await teacherToken()}` },
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');
    expect(JSON.parse(response.body)).toEqual({ success: true, data: [] });
  });

  it('serves the migrated insights domain from its plugin, through the report ports', async () => {
    // `api/modules/insights` is gone (P4.3b.13) and the three `/api/analytics` routes are
    // plugins/insights'. This is the round whose whole point is that the domain owns **no tables**: it
    // answers by calling `classroom.public` and `engagement.public`.
    //
    // The routes are guarded now, so an anonymous probe is refused by the plugin's own gate before
    // any port call. The body is what proves the plugin served it: Nest's catch-all answers
    // "Cannot GET ..." instead.
    const anonymousMissing = await probe('/api/analytics/classes/999/overview');
    expect(anonymousMissing.status).toBe(401);
    expect(anonymousMissing.body).toContain('未登录或登录已过期');
    expect(anonymousMissing.body).not.toContain('Cannot GET');

    // A missing class is the case that proves the port path ran: the service asks
    // `getClassReportInputs`, gets `class: null`, and answers the legacy 404. A route that was not
    // mounted answers Nest's catch-all instead - same status, different body - so both are asserted.
    // The admin token is needed because the class overview is scoped per the matrix
    // (`admin 任意；teacher 本班；parent 孩子；student 本人`).
    const missing = await probe('/api/analytics/classes/999/overview', {
      headers: { authorization: `Bearer ${await superadminToken()}` },
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toContain('Class not found');
    expect(missing.body).not.toContain('Cannot GET');

    // The setup-created class exists, so this one goes all the way through the port: aggregates from
    // classroom, praise count from engagement, and the derived rates computed here.
    const overview = await probe(`/api/analytics/classes/${probeClassId}/overview`, {
      headers: { authorization: `Bearer ${await superadminToken()}` },
    });
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
    expect(payload.class.id).toBe(probeClassId);
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
    // An anonymous caller is refused with 401 before any port call: we do not know who they are.
    const anonymous = await probe('/api/analytics/students/1/radar');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toContain('未登录或登录已过期');
    expect(anonymous.body).not.toContain('Cannot GET');

    // A known caller outside the scope gets the 403 - the other half of the contract. The teacher
    // asking about a class they do not own gets the class-overview refusal - the other
    // hand-written gate in this domain. Like the classroom probe above, this presents a real session
    // rather than the legacy identity headers, which no longer authenticate by default.
    const teacher = await probe('/api/analytics/classes/999/overview', {
      headers: { authorization: `Bearer ${await teacherToken()}` },
    });
    expect(teacher.status).toBe(403);
    expect(teacher.body).toContain('无权限查看该班级分析');
  });

  it('runs the migrated identity domain through a real login', async () => {
    // `api/modules/auth` is gone (P4.3b.7) and these four routes are plugins/identity's. This is
    // the strongest available evidence that the move kept working: a real HTTP login against a real
    // database, answered by the plugin's own repository through the ownership-checked `ctx.db`.
    //
    // The account is `probe-teacher`, created through `POST /api/admin/users` in the setup above:
    // `initDb()` no longer seeds a teacher at all, because `admin` / `admin123` was fabricated demo
    // data published in this repository. The role still matters: `findUserByCredentials` looks a
    // user up by `(username, role)`.
    //
    // The token matters as much as the body: it is minted from `ctx.sessions`, so a session that
    // verifies on the next request proves the plugin is wired to the kernel's session store rather
    // than to a private one.
    const login = await probe('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'probe-teacher', password: 'probe-teacher-secret', role: 'teacher' }),
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
    expect(payload.user.username).toBe('probe-teacher');
    expect(typeof payload.token).toBe('string');
    expect(payload.expiresAt).toBeTruthy();

    // The issued session is accepted on the next request: the profile route reads the actor from the
    // kernel's request context, which resolves a Bearer token through the same session store the
    // plugin issued it from. An invalid or unknown token would make the caller anonymous (403).
    const profile = await probe('/api/auth/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${payload.token}` },
      body: JSON.stringify({ username: 'probe-teacher' }),
    });
    expect(profile.status, `profile body: ${profile.body}`).toBe(200);
    expect(JSON.parse(profile.body)).toMatchObject({ success: true, user: { username: 'probe-teacher' } });
  });

  it('answers a bad identity login with the plugin own 401, not a catch-all 404', async () => {
    // A wrong password for an account that exists - not an unknown username - so the 401 comes from
    // the credential check rather than from the lookup finding nothing.
    const response = await probe('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'probe-teacher', password: 'wrong', role: 'teacher' }),
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
    // 200 here is the whole wiring proof. The account is the setup-created teacher: a superadmin
    // cannot log in under `role: 'teacher'`, because the lookup matches on both.
    const response = await probe('/api/kernel/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'probe-teacher', password: 'probe-teacher-secret', role: 'teacher' }),
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ success: true, data: { token: expect.any(String) } });
  });

  it('distinguishes a missing resource from a missing route', async () => {
    // Both probes are credentialed: the pet routes now enforce the matrix's
    // `student（本人）/ parent（孩子）/ teacher（本班）` rule, so an anonymous caller is refused with 401
    // before the service is consulted - and a 401 cannot distinguish a missing student from a
    // missing route, which is the distinction this test exists for. Staff pass the scope check.
    const auth = { authorization: `Bearer ${await superadminToken()}` };
    const missingResource = await probe('/api/pet/students/999/dashboard', { headers: auth });
    const missingRoute = await probe('/api/pet/nope-not-a-route', { headers: auth });

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
    //   the setup session -> create an order -> a bad signature is rejected -> the real mock webhook
    //   settles it -> the order reads PAID *and* the account it paid for reports is_activated: true.
    //
    // The last step is the one that matters. `is_activated` lives in `users` (identity's table) and
    // the order lives in `payment_orders` (this plugin's), so observing both changed proves the
    // cross-plugin activation port actually ran - no fake can show that.
    //
    // The payer is the setup's superadmin, whose row starts with `is_activated = 0` (the boot writes
    // it from the environment and nothing activates it), so the flip at the end is a real change.
    // `payment_environment: 'mock'` and `payment_enable_wechat: '1'` come from the setup's settings
    // PUT, not from a boot seed: production gets no environment row and both channels are seeded
    // disabled, which is why the probe states what it needs through the console API.
    const token = await superadminToken();
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
      body: JSON.stringify({ username: 'probe-root' }),
    });
    expect(profile.status, `profile body: ${profile.body}`).toBe(200);
    expect(JSON.parse(profile.body)).toMatchObject({ success: true, user: { is_activated: true } });
  });

  it('serves the migrated pet domain from its plugin, through the classroom port', async () => {
    // `GET /api/pet/classes/:classId` builds its answer from `classroom.public.listClassStudents`,
    // so the setup-created class answering `{success, data:{students:[]}, students:[]}` proves three
    // things at once: the plugin's controller ran, the port resolved, and both envelope copies
    // are intact. A route that was not mounted would be Nest's catch-all instead.
    //
    // Credentialed: the class board is scoped to the class's teacher (or its students). The probe
    // class was created by the superadmin and `createClass` assigned it to `probe-teacher`, so the
    // teacher token passes the scope check and the envelope below is the plugin's own answer.
    const response = await probe(`/api/pet/classes/${probeClassId}`, {
      headers: { authorization: `Bearer ${await teacherToken()}` },
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toContain('Cannot GET');
    expect(JSON.parse(response.body)).toEqual({ success: true, data: { students: [] }, students: [] });
  });

  it('serves the legacy /api/pets alias family from the plugin too', async () => {
    // The parent dashboard still calls `/api/pets/${studentId}`. Its envelope has no `data`
    // key at all - a different shape from `/api/pet/...` - and the pet plugin answers both.
    // Credentialed for the same reason as the dashboard probe above: the alias family now enforces
    // the same scope rule as its `/api/pet` twin, which is what made it a bypass before.
    const response = await probe('/api/pets/999', {
      headers: { authorization: `Bearer ${await superadminToken()}` },
    });

    expect(response.status).toBe(404);
    expect(response.body).toContain('Student not found');
    expect(response.body).not.toContain('Cannot GET');
  });
});
