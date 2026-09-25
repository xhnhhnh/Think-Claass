/**
 * `/api/shop` authorization - all sixteen routes, over real HTTP.
 *
 * Every one of them answered anyone before this suite existed. The sharpest case was the money
 * path: `POST /api/shop/buy` took `studentId` from the body and never compared it with the caller,
 * so an anonymous request could spend a named student's points - and with `?studentId=` omitted,
 * `GET /api/shop/items` returned every teacher's shelf. `POST /api/shop` fell back to the first
 * teacher in the database when `teacher_id` was absent, and `PUT /api/shop/:id` edited any item.
 *
 * The contract per route is the matrix in `docs/security/route-authorization-matrix.md`:
 *
 *   anonymous                        -> 401 `未登录或登录已过期` (we do not know who you are)
 *   known caller without the role    -> 403 `无权限执行该操作`     (we know, and you may not)
 *   buyer naming another student     -> 403 (identity comes from the actor, not the body)
 *   the right role, on its own row   -> the route's real answer
 *
 * This is a real host boot (discovery, migrations, the Nest assembly, the kernel request-context
 * middleware) rather than a controller call with a fake `Request`, because the defect being fixed
 * was an integration gap: a helper is only meaningful if the middleware that populates the actor is
 * actually installed on these routes. The boot also installs the application's actor-scope
 * resolver, exactly as `api/app.ts` does, because `Actor.studentId` is the `students` row id and
 * the whole point of the money-path fix is that it is resolved from the login and not guessed.
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
  { label: 'GET /api/shop/items', method: 'GET', path: '/api/shop/items' },
  { label: 'GET /api/shop/all', method: 'GET', path: '/api/shop/all' },
  { label: 'POST /api/shop', method: 'POST', path: '/api/shop', body: { name: '匿名', price: 5, stock: 1 } },
  { label: 'PUT /api/shop/1/status', method: 'PUT', path: '/api/shop/1/status', body: { is_active: 0 } },
  { label: 'PUT /api/shop/1', method: 'PUT', path: '/api/shop/1', body: { name: '匿名' } },
  { label: 'POST /api/shop/buy', method: 'POST', path: '/api/shop/buy', body: { studentId: 10, itemId: 1 } },
  { label: 'GET /api/shop/auctions', method: 'GET', path: '/api/shop/auctions' },
  {
    label: 'POST /api/shop/auctions/1/bid',
    method: 'POST',
    path: '/api/shop/auctions/1/bid',
    body: { studentId: 10, bid_amount: 100 },
  },
  { label: 'POST /api/shop/blind_box', method: 'POST', path: '/api/shop/blind_box', body: { studentId: 10 } },
  { label: 'POST /api/shop/auctions', method: 'POST', path: '/api/shop/auctions', body: { item_name: '匿名' } },
  { label: 'PUT /api/shop/auctions/1', method: 'PUT', path: '/api/shop/auctions/1', body: { item_name: '匿名' } },
  { label: 'DELETE /api/shop/auctions/1', method: 'DELETE', path: '/api/shop/auctions/1' },
  { label: 'GET /api/shop/blind_boxes', method: 'GET', path: '/api/shop/blind_boxes' },
  {
    label: 'POST /api/shop/blind_boxes',
    method: 'POST',
    path: '/api/shop/blind_boxes',
    body: { name: '匿名盒', price: 10 },
  },
  { label: 'PUT /api/shop/blind_boxes/1', method: 'PUT', path: '/api/shop/blind_boxes/1', body: { name: '匿名' } },
  { label: 'DELETE /api/shop/blind_boxes/1', method: 'DELETE', path: '/api/shop/blind_boxes/1' },
];

/**
 * Routes the matrix gives to teacher/admin, so a student must be refused. The other six -
 * `GET /items`, `GET /auctions`, `GET /blind_boxes` and the three money routes - are reachable by
 * a student and are covered by the scoping tests below instead.
 */
const STAFF_ONLY: GuardedEndpoint[] = [
  { label: 'GET /api/shop/all', method: 'GET', path: '/api/shop/all' },
  { label: 'POST /api/shop', method: 'POST', path: '/api/shop', body: { name: '学生', price: 5, stock: 1 } },
  { label: 'PUT /api/shop/1/status', method: 'PUT', path: '/api/shop/1/status', body: { is_active: 0 } },
  { label: 'PUT /api/shop/1', method: 'PUT', path: '/api/shop/1', body: { name: '学生' } },
  { label: 'POST /api/shop/auctions', method: 'POST', path: '/api/shop/auctions', body: { item_name: '学生' } },
  { label: 'PUT /api/shop/auctions/1', method: 'PUT', path: '/api/shop/auctions/1', body: { item_name: '学生' } },
  { label: 'DELETE /api/shop/auctions/1', method: 'DELETE', path: '/api/shop/auctions/1' },
  {
    label: 'POST /api/shop/blind_boxes',
    method: 'POST',
    path: '/api/shop/blind_boxes',
    body: { name: '学生盒', price: 10 },
  },
  { label: 'PUT /api/shop/blind_boxes/1', method: 'PUT', path: '/api/shop/blind_boxes/1', body: { name: '学生' } },
  { label: 'DELETE /api/shop/blind_boxes/1', method: 'DELETE', path: '/api/shop/blind_boxes/1' },
];

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-shop-auth-'));
  const file = path.join(directory, 'shop-auth.sqlite');

  kernel = await createKernel({
    rootDir: ROOT,
    overrides: { logLevel: 'silent', pluginsEnabled: true, pluginDirs: [], env: 'test', databaseFile: file },
    migrations: APP_MIGRATIONS,
    /**
     * The application's actor-scope resolver, reproduced from `api/app.ts`: a verified session
     * carries only `userId` + `role`, and the host extends it with the `students` row through
     * `classroom.public`. Without this the money routes would see `studentId: null` and (correctly)
     * refuse - which is the fail-closed behaviour, but it is not the production path being tested.
     */
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

  // Two classes with two teachers, and two students in the first one: the cross-teacher and
  // cross-student refusals below need a *second* subject that is not the caller.
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (7, 'teacher', 't7', 'x', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (8, 'teacher', 't8', 'x', 1);
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'SHOP1');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (2, '二班', 8, 'SHOP2');
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (10, 100, 1, '小明', 0, 500);
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (11, 101, 1, '小红', 0, 500);
  `);

  // The shop and auction features are class-scope flags and default to off on a fresh class.
  for (const feature of ['enable_shop', 'enable_auction_blind_box']) {
    kernel.permissions.store.set({
      scopeType: 'class',
      scopeId: 1,
      capabilityKey: `classroom.${feature}`,
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
  otherStudentToken = kernel.sessions.issue({ userId: 101, role: 'student', ttlMs: 60_000 }).token;
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
});

describe('a known caller without the role is refused with 403', () => {
  for (const endpoint of STAFF_ONLY) {
    it(`${endpoint.label} answers 403 for a student`, async () => {
      const reply = await call(endpoint.method, endpoint.path, { token: studentToken, body: endpoint.body });

      expect(reply.status).toBe(403);
      expect(reply.body).toMatchObject({ success: false, message: '无权限执行该操作' });
    });
  }

  it('POST /api/shop/buy answers 403 for a teacher', async () => {
    // Buying is student-only: the shop route spends a student's points, and a teacher has no
    // student row of their own to spend from.
    const reply = await call('POST', '/api/shop/buy', {
      token: teacherToken,
      body: { studentId: 10, itemId: 1 },
    });

    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ success: false, message: '无权限执行该操作' });
  });
});

describe('the money routes take the student from the actor, not the body', () => {
  let itemId = 0;

  it('a teacher creates an item on their own shelf', async () => {
    const created = await call('POST', '/api/shop', {
      token: teacherToken,
      body: { name: '铅笔', price: 50, stock: 3, teacher_id: 8 },
    });

    expect(created.status).toBe(200);
    itemId = created.body.id as number;
    // `teacher_id` in the body is ignored for a teacher: the item lands on *their* shelf, or the
    // next teacher could create stock for a class they do not teach.
    const row = kernel.db.prepare('SELECT teacher_id FROM shop_items WHERE id = ?').get(itemId) as {
      teacher_id: number;
    };
    expect(row.teacher_id).toBe(7);
  });

  it('a student sees their own class teacher shelf', async () => {
    const reply = await call('GET', '/api/shop/items', { token: studentToken });

    expect(reply.status).toBe(200);
    expect(reply.body.items).toContainEqual(expect.objectContaining({ id: itemId, teacher_id: 7 }));
  });

  /**
   * `GET /api/shop/blind_boxes` is the one route where the matrix's role column and the deployed
   * frontend disagree: the student shop page reads it (`useStudentShopData`). It is therefore
   * scoped rather than refused - staff see every box, a student sees the active ones - which is
   * what the plugin documents as a deliberate deviation.
   */
  it('a student sees only the active blind boxes, staff see all of them', async () => {
    const active = await call('POST', '/api/shop/blind_boxes', {
      token: teacherToken,
      body: { name: '在售盲盒', price: 30, is_active: 1 },
    });
    const retired = await call('POST', '/api/shop/blind_boxes', {
      token: teacherToken,
      body: { name: '下架盲盒', price: 30, is_active: 0 },
    });
    expect(active.status).toBe(200);
    expect(retired.status).toBe(200);

    const studentView = await call('GET', '/api/shop/blind_boxes', { token: studentToken });
    expect(studentView.status).toBe(200);
    expect(studentView.body.boxes.map((box: any) => box.name)).toEqual(['在售盲盒']);

    const staffView = await call('GET', '/api/shop/blind_boxes', { token: otherTeacherToken });
    expect(staffView.status).toBe(200);
    expect(staffView.body.boxes.map((box: any) => box.name).sort()).toEqual(['下架盲盒', '在售盲盒']);
  });

  it('a student buying with another student id is refused with 403', async () => {
    const reply = await call('POST', '/api/shop/buy', {
      token: studentToken,
      body: { studentId: 11, itemId },
    });

    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ success: false, message: '无权限执行该操作' });

    // Neither student was charged and no ticket was issued.
    const balances = kernel.db
      .prepare('SELECT id, available_points FROM students ORDER BY id')
      .all() as Array<{ id: number; available_points: number }>;
    expect(balances).toEqual([
      { id: 10, available_points: 500 },
      { id: 11, available_points: 500 },
    ]);
    expect(kernel.db.prepare('SELECT COUNT(*) AS n FROM redemption_tickets').get()).toMatchObject({ n: 0 });
  });

  it('a student buying their own id passes and pays from their own balance', async () => {
    const reply = await call('POST', '/api/shop/buy', {
      token: studentToken,
      body: { studentId: 10, itemId },
    });

    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ success: true, points: 450 });

    const row = kernel.db.prepare('SELECT available_points FROM students WHERE id = 10').get() as {
      available_points: number;
    };
    expect(row.available_points).toBe(450);
  });

  it('a student bidding with another student id is refused with 403', async () => {
    const created = await call('POST', '/api/shop/auctions', {
      token: teacherToken,
      body: { item_name: '限量徽章', starting_price: 10 },
    });
    expect(created.status).toBe(200);

    const refused = await call('POST', `/api/shop/auctions/${created.body.id}/bid`, {
      token: otherStudentToken,
      body: { studentId: 10, bid_amount: 100 },
    });
    expect(refused.status).toBe(403);

    // The other student's own bid on the same auction passes.
    const placed = await call('POST', `/api/shop/auctions/${created.body.id}/bid`, {
      token: otherStudentToken,
      body: { studentId: 11, bid_amount: 100 },
    });
    expect(placed.status).toBe(200);
    expect(placed.body).toMatchObject({ success: true, points: 400 });
  });

  it('a student buying a blind box for another student is refused with 403', async () => {
    const refused = await call('POST', '/api/shop/blind_box', {
      token: otherStudentToken,
      body: { studentId: 10 },
    });

    expect(refused.status).toBe(403);

    const own = await call('POST', '/api/shop/blind_box', {
      token: otherStudentToken,
      body: { studentId: 11 },
    });
    expect(own.status).toBe(200);
    expect(own.body.success).toBe(true);
  });
});

describe('item administration is scoped to the owning teacher', () => {
  let itemId = 0;

  beforeAll(async () => {
    const created = await call('POST', '/api/shop', {
      token: teacherToken,
      body: { name: '归属测试', price: 10, stock: 5 },
    });
    itemId = created.body.id as number;
  });

  it('another teacher cannot read it through /api/shop/all or edit it', async () => {
    const listed = await call('GET', '/api/shop/all', { token: otherTeacherToken });
    expect(listed.status).toBe(200);
    // The `?teacherId=` filter is forced to the caller's own id, so teacher 8's management view
    // cannot even name teacher 7's shelf.
    expect(listed.body.items).toEqual([]);
    expect(
      (
        await call('GET', '/api/shop/all?teacherId=7', { token: otherTeacherToken })
      ).body.items,
    ).toEqual([]);

    const edited = await call('PUT', `/api/shop/${itemId}`, {
      token: otherTeacherToken,
      body: { name: '越权改名', price: 1, stock: 1 },
    });
    expect(edited.status).toBe(403);
    expect(edited.body).toMatchObject({ success: false, message: '无权限执行该操作' });

    const row = kernel.db.prepare('SELECT name FROM shop_items WHERE id = ?').get(itemId) as { name: string };
    expect(row.name).toBe('归属测试');
  });

  it('the owning teacher and an admin may edit it', async () => {
    const owned = await call('PUT', `/api/shop/${itemId}/status`, { token: teacherToken, body: { is_active: 0 } });
    expect(owned.status).toBe(200);

    const byAdmin = await call('PUT', `/api/shop/${itemId}`, {
      token: adminToken,
      body: { name: '管理员改名', price: 20, stock: 5 },
    });
    expect(byAdmin.status).toBe(200);
    const row = kernel.db.prepare('SELECT name FROM shop_items WHERE id = ?').get(itemId) as { name: string };
    expect(row.name).toBe('管理员改名');
  });
});
