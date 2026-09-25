/**
 * `/api/economy` authorization - all twenty routes, over real HTTP.
 *
 * Every one of them answered anyone before this suite existed, and the asset-write family took the
 * student from the URL: `POST /api/economy/students/:studentId/bank/deposits|withdrawals` and the
 * `/stocks/buy|sell` routes (plus the `/bank/deposit/:studentId`, `/bank/withdraw/:studentId`,
 * `/stocks/buy|sell/:studentId` aliases) let an anonymous caller move any student's points.
 * `POST /api/economy/bank/trigger-interest` settled interest for every account in the database, and
 * `/teacher/stocks*` was an open stock CRUD.
 *
 * The contract per route is the matrix in `docs/security/route-authorization-matrix.md`:
 *
 *   anonymous                        -> 401 `未登录或登录已过期` (we do not know who you are)
 *   known caller without the role    -> 403 `无权限执行该操作`     (we know, and you may not)
 *   student naming another student   -> 403 (the subject comes from the actor, not the URL)
 *   teacher naming another class     -> 403
 *   the right role, on its own row   -> the route's real answer
 *
 * This is a real host boot (discovery, migrations, the Nest assembly, the kernel request-context
 * middleware) rather than a controller call with a fake `Request`, because the defect being fixed
 * was an integration gap. The boot also installs the application's actor-scope resolver, exactly as
 * `api/app.ts` does - that is what makes `Actor.studentId` the `students` row id rather than the
 * login id, and the money-path fix depends on that distinction.
 */

import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createPluginHost, type PluginHost } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let kernel: Kernel;
let host: PluginHost;
let server: Server;
let base: string;
let directory: string;

let teacherToken: string;
let otherTeacherToken: string;
let studentToken: string;
let otherStudentToken: string;
let parentToken: string;
let adminToken: string;

interface Reply {
  status: number;
  text: string;
  body: any;
}

/** One request. No `token` means no `authorization` header at all - the original vulnerability. */
async function call(
  method: string,
  endpoint: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Reply> {
  const response = await fetch(base + endpoint, {
    method,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const text = await response.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, text, body };
}

/** Every route the plugin serves, with a body where the method takes one. */
interface GuardedEndpoint {
  label: string;
  method: string;
  path: string;
  body?: unknown;
}

const GUARDED: GuardedEndpoint[] = [
  { label: 'POST /api/economy/bank/trigger-interest', method: 'POST', path: '/api/economy/bank/trigger-interest' },
  { label: 'GET /api/economy/bank/:studentId', method: 'GET', path: '/api/economy/bank/10' },
  { label: 'POST /api/economy/bank/deposit/:studentId', method: 'POST', path: '/api/economy/bank/deposit/10', body: { amount: 10 } },
  { label: 'POST /api/economy/bank/withdraw/:studentId', method: 'POST', path: '/api/economy/bank/withdraw/10', body: { amount: 10 } },
  { label: 'GET /api/economy/stocks/:classId', method: 'GET', path: '/api/economy/stocks/1' },
  { label: 'GET /api/economy/portfolio/:studentId', method: 'GET', path: '/api/economy/portfolio/10' },
  { label: 'POST /api/economy/stocks/buy/:studentId', method: 'POST', path: '/api/economy/stocks/buy/10', body: { stockId: 1, shares: 1 } },
  { label: 'POST /api/economy/stocks/sell/:studentId', method: 'POST', path: '/api/economy/stocks/sell/10', body: { stockId: 1, shares: 1 } },
  { label: 'GET /api/economy/students/:studentId/overview', method: 'GET', path: '/api/economy/students/10/overview' },
  { label: 'GET /api/economy/students/:studentId/bank', method: 'GET', path: '/api/economy/students/10/bank' },
  { label: 'POST /api/economy/students/:studentId/bank/deposits', method: 'POST', path: '/api/economy/students/10/bank/deposits', body: { amount: 10 } },
  { label: 'POST /api/economy/students/:studentId/bank/withdrawals', method: 'POST', path: '/api/economy/students/10/bank/withdrawals', body: { amount: 10 } },
  { label: 'GET /api/economy/classes/:classId/stocks', method: 'GET', path: '/api/economy/classes/1/stocks' },
  { label: 'GET /api/economy/students/:studentId/portfolio', method: 'GET', path: '/api/economy/students/10/portfolio' },
  { label: 'POST /api/economy/students/:studentId/stocks/buy', method: 'POST', path: '/api/economy/students/10/stocks/buy', body: { stockId: 1, shares: 1 } },
  { label: 'POST /api/economy/students/:studentId/stocks/sell', method: 'POST', path: '/api/economy/students/10/stocks/sell', body: { stockId: 1, shares: 1 } },
  { label: 'POST /api/economy/bank/interest', method: 'POST', path: '/api/economy/bank/interest' },
  { label: 'POST /api/economy/teacher/stocks', method: 'POST', path: '/api/economy/teacher/stocks', body: { class_id: 1, name: '学生股', symbol: 'STU', current_price: 10 } },
  { label: 'PUT /api/economy/teacher/stocks/:id', method: 'PUT', path: '/api/economy/teacher/stocks/1', body: { current_price: 11 } },
  { label: 'DELETE /api/economy/teacher/stocks/:id', method: 'DELETE', path: '/api/economy/teacher/stocks/1' },
];

/** The routes only admin/superadmin may reach: the two settlement triggers. */
const ADMIN_ONLY = [GUARDED[0], GUARDED[16]];

/** The routes only a teacher (owning the class) or admin may reach. */
const TEACHER_ONLY = [GUARDED[17], GUARDED[18], GUARDED[19]];

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-economy-auth-'));
  const file = path.join(directory, 'economy-auth.sqlite');

  kernel = await createKernel({
    rootDir: ROOT,
    overrides: { logLevel: 'silent', pluginsEnabled: true, pluginDirs: [], env: 'test', databaseFile: file },
    migrations: APP_MIGRATIONS,
    scopeResolver: async (_req, actor) => {
      if (actor.role !== 'student' && actor.role !== 'parent') return null;
      const classroom = host?.active
        .find((entry) => entry.manifest.id === 'classroom')
        ?.context.use('classroom.public');
      if (!classroom) return null;

      const studentRow =
        actor.role === 'student'
          ? await classroom.getStudentByUserId(actor.userId)
          : ((await classroom.listStudentsByParent(actor.userId))[0] ?? null);

      return { ...actor, studentId: studentRow?.id, classId: studentRow?.classId };
    },
    mountPlugins: async (hooks) => {
      host = await createPluginHost({
        ...hooks,
        pluginDirs: [path.join(ROOT, 'plugins')],
        authProvider: { current: null },
      });
      return host;
    },
  });

  // Two classes with two teachers, two students (one per class) and a parent linked to student 10 -
  // the teacher/parent scope checks need a subject the caller does not own.
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (7, 'teacher', 't7', 'x', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (8, 'teacher', 't8', 'x', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (300, 'parent', 'p300', 'x', 1);
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'ECO1');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (2, '二班', 8, 'ECO2');
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (10, 100, 1, '小明', 0, 500);
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (20, 200, 2, '小刚', 0, 500);
    INSERT INTO parent_students (parent_id, student_id) VALUES (300, 10);
  `);

  for (const classId of [1, 2]) {
    kernel.permissions.store.set({
      scopeType: 'class',
      scopeId: classId,
      capabilityKey: 'classroom.enable_economy',
      enabled: true,
    });
  }

  server = await new Promise<Server>((resolve) => {
    const listener = kernel.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  teacherToken = kernel.sessions.issue({ userId: 7, role: 'teacher', ttlMs: 60_000 }).token;
  otherTeacherToken = kernel.sessions.issue({ userId: 8, role: 'teacher', ttlMs: 60_000 }).token;
  studentToken = kernel.sessions.issue({ userId: 100, role: 'student', ttlMs: 60_000 }).token;
  otherStudentToken = kernel.sessions.issue({ userId: 200, role: 'student', ttlMs: 60_000 }).token;
  parentToken = kernel.sessions.issue({ userId: 300, role: 'parent', ttlMs: 60_000 }).token;
  adminToken = kernel.sessions.issue({ userId: 1, role: 'admin', ttlMs: 60_000 }).token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await host?.stop();
  await kernel.shutdown();
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // Windows keeps the file handle briefly.
  }
});

// ---------------------------------------------------------------------------

describe('anonymous callers are refused with 401', () => {
  for (const endpoint of GUARDED) {
    it(`${endpoint.label} answers 401 without any credential`, async () => {
      const reply = await call(endpoint.method, endpoint.path, { body: endpoint.body });

      expect(reply.status).toBe(401);
      expect(reply.body).toMatchObject({ success: false, message: '未登录或登录已过期' });
    });
  }

  it('settling interest anonymously moves no balance at all', async () => {
    kernel.db
      .prepare(
        `INSERT OR REPLACE INTO bank_accounts (student_id, deposit_amount, interest_rate, last_interest_date)
         VALUES (10, 100, 0.05, NULL)`,
      )
      .run();

    const reply = await call('POST', '/api/economy/bank/trigger-interest');
    expect(reply.status).toBe(401);

    const row = kernel.db.prepare('SELECT deposit_amount FROM bank_accounts WHERE student_id = 10').get() as {
      deposit_amount: number;
    };
    expect(row.deposit_amount).toBe(100);

    // Leave the account as it was found: the deposit test below asserts an exact balance.
    kernel.db.prepare('DELETE FROM bank_accounts WHERE student_id = 10').run();
  });
});

describe('a known caller without the role is refused with 403', () => {
  for (const endpoint of ADMIN_ONLY) {
    it(`${endpoint.label} answers 403 for a student and for a teacher`, async () => {
      const byStudent = await call(endpoint.method, endpoint.path, { token: studentToken, body: endpoint.body });
      expect(byStudent.status).toBe(403);
      expect(byStudent.body).toMatchObject({ success: false, message: '无权限执行该操作' });

      const byTeacher = await call(endpoint.method, endpoint.path, { token: teacherToken, body: endpoint.body });
      expect(byTeacher.status).toBe(403);
    });
  }

  for (const endpoint of TEACHER_ONLY) {
    it(`${endpoint.label} answers 403 for a student`, async () => {
      const reply = await call(endpoint.method, endpoint.path, { token: studentToken, body: endpoint.body });

      expect(reply.status).toBe(403);
      expect(reply.body).toMatchObject({ success: false, message: '无权限执行该操作' });
    });
  }

  it('a student cannot use any route to spend another student points', async () => {
    for (const endpoint of GUARDED.filter((entry) => entry.path.includes('/10'))) {
      const reply = await call(endpoint.method, endpoint.path, { token: otherStudentToken, body: endpoint.body });
      if (reply.status === 403) continue;
      // A read/alias route the student role may reach must still be refused for *another* row.
      throw new Error(`${endpoint.label} answered ${reply.status} for a different student`);
    }

    const balances = kernel.db
      .prepare('SELECT id, available_points FROM students ORDER BY id')
      .all() as Array<{ id: number; available_points: number }>;
    expect(balances).toEqual([
      { id: 10, available_points: 500 },
      { id: 20, available_points: 500 },
    ]);
  });
});

describe('the right role on its own row gets the real answer', () => {
  it('a student deposits into and withdraws from their own account', async () => {
    const deposited = await call('POST', '/api/economy/students/10/bank/deposits', {
      token: studentToken,
      body: { amount: 40 },
    });
    expect(deposited.status).toBe(201);
    expect(deposited.body).toMatchObject({ success: true, data: { account: { student_id: 10, deposit_amount: 40 } } });

    const withdrawn = await call('POST', '/api/economy/students/10/bank/withdrawals', {
      token: studentToken,
      body: { amount: 10 },
    });
    expect(withdrawn.status).toBe(201);
    expect(withdrawn.body).toMatchObject({ success: true, data: { account: { student_id: 10, deposit_amount: 30 } } });

    const row = kernel.db
      .prepare('SELECT available_points FROM students WHERE id = 10')
      .get() as { available_points: number };
    // 500 - 40 + 10: the points moved through classroom.public, not by a direct table write.
    expect(row.available_points).toBe(470);
  });

  it('a student reads their own balance, overview and portfolio', async () => {
    for (const endpoint of ['/api/economy/students/10/bank', '/api/economy/students/10/overview', '/api/economy/students/10/portfolio']) {
      const reply = await call('GET', endpoint, { token: studentToken });
      expect(reply.status, endpoint).toBe(200);
      expect(reply.body.success).toBe(true);
    }
  });

  it('their class teacher and linked parent may read the same rows, and nobody else may', async () => {
    expect((await call('GET', '/api/economy/students/10/bank', { token: teacherToken })).status).toBe(200);
    expect((await call('GET', '/api/economy/students/10/bank', { token: parentToken })).status).toBe(200);
    expect((await call('GET', '/api/economy/students/10/bank', { token: adminToken })).status).toBe(200);

    // Teacher 8 teaches class 2; the parent is linked to student 10 only.
    expect((await call('GET', '/api/economy/students/10/bank', { token: otherTeacherToken })).status).toBe(403);
    expect((await call('GET', '/api/economy/students/20/bank', { token: parentToken })).status).toBe(403);
  });

  it('a teacher buys nothing, but a student buys and sells their own shares', async () => {
    const created = await call('POST', '/api/economy/teacher/stocks', {
      token: teacherToken,
      body: { class_id: 1, name: '课堂之星', symbol: 'star', current_price: 20 },
    });
    expect(created.status).toBe(201);
    const stockId = created.body.data.id as number;

    const bought = await call('POST', `/api/economy/students/10/stocks/buy`, {
      token: studentToken,
      body: { stockId, shares: 2 },
    });
    expect(bought.status).toBe(201);
    expect(bought.body.data.portfolio).toContainEqual(expect.objectContaining({ stock_id: stockId, shares: 2 }));

    const sold = await call('POST', `/api/economy/students/10/stocks/sell`, {
      token: studentToken,
      body: { stockId, shares: 1 },
    });
    expect(sold.status).toBe(201);
    expect(sold.body.data.portfolio).toContainEqual(expect.objectContaining({ stock_id: stockId, shares: 1 }));

    // The legacy alias family is gated by the same rule.
    expect(
      (await call('POST', `/api/economy/stocks/buy/20`, { token: studentToken, body: { stockId, shares: 1 } })).status,
    ).toBe(403);
    expect(
      (await call('POST', `/api/economy/stocks/sell/20`, { token: studentToken, body: { stockId, shares: 1 } })).status,
    ).toBe(403);
  });

  it('a teacher creating a stock is scoped to their own class', async () => {
    const own = await call('POST', '/api/economy/teacher/stocks', {
      token: teacherToken,
      body: { class_id: 1, name: '一班股', symbol: 'ONE', current_price: 10 },
    });
    expect(own.status).toBe(201);

    const foreign = await call('POST', '/api/economy/teacher/stocks', {
      token: otherTeacherToken,
      body: { class_id: 1, name: '越权股', symbol: 'NOPE', current_price: 10 },
    });
    expect(foreign.status).toBe(403);
    expect(foreign.body).toMatchObject({ success: false, message: '无权限管理该班级的股票' });

    const byAdmin = await call('POST', '/api/economy/teacher/stocks', {
      token: adminToken,
      body: { class_id: 1, name: '管理股', symbol: 'ADM', current_price: 10 },
    });
    expect(byAdmin.status).toBe(201);
  });

  it('a class stock board is readable by its teacher and students only', async () => {
    expect((await call('GET', '/api/economy/classes/1/stocks', { token: teacherToken })).status).toBe(200);
    expect((await call('GET', '/api/economy/classes/1/stocks', { token: studentToken })).status).toBe(200);
    expect((await call('GET', '/api/economy/classes/1/stocks', { token: otherTeacherToken })).status).toBe(403);
    expect((await call('GET', '/api/economy/classes/1/stocks', { token: otherStudentToken })).status).toBe(403);
    // The legacy alias answers with the other envelope but the same gate.
    expect((await call('GET', '/api/economy/stocks/1', { token: otherStudentToken })).status).toBe(403);
  });
});
