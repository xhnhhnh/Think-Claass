/**
 * `/api/gacha` authorization - all ten routes, over real HTTP.
 *
 * Every one of them answered anyone before this suite existed: an anonymous caller could draw for
 * any student (spending that student's points), read any student's collection, change any student's
 * active pet, add dictionary entries that feed every class's pool, and read - creating on first read
 * - any class's pool together with its odds.
 *
 * The contract per route is the matrix in `docs/security/route-authorization-matrix.md`:
 *
 *   anonymous                        -> 401 `未登录或登录已过期` (we do not know who you are)
 *   known caller without the role    -> 403 `无权限执行该操作`     (we know, and you may not)
 *   student naming another student   -> 403 (the subject comes from the actor, not the URL)
 *   teacher naming another class     -> 403
 *   the right role, on its own row   -> the route's real answer
 *
 * `GET /api/gacha/dictionary` is the one route the matrix leaves to "anyone (public content) or a
 * logged-in user"; it requires a session and stays open to every role, which this suite pins in
 * both directions.
 *
 * This is a real host boot (discovery, migrations, the Nest assembly, the request-context
 * middleware). The boot also installs the application's actor-scope resolver, exactly as
 * `api/app.ts` does, because `Actor.studentId` (the `students` row) is what the self-checks use.
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
  { label: 'GET /api/gacha/dictionary', method: 'GET', path: '/api/gacha/dictionary' },
  {
    label: 'POST /api/gacha/dictionary',
    method: 'POST',
    path: '/api/gacha/dictionary',
    body: { name: '匿名兽', element: 'fire', rarity: 'N', base_power: 1 },
  },
  { label: 'GET /api/gacha/pools/:classId', method: 'GET', path: '/api/gacha/pools/1' },
  { label: 'POST /api/gacha/draw/:studentId', method: 'POST', path: '/api/gacha/draw/10', body: { poolId: 1, times: 1 } },
  { label: 'GET /api/gacha/collection/:studentId', method: 'GET', path: '/api/gacha/collection/10' },
  { label: 'PUT /api/gacha/active/:studentId/:instanceId', method: 'PUT', path: '/api/gacha/active/10/1' },
  { label: 'GET /api/gacha/classes/:classId/pools', method: 'GET', path: '/api/gacha/classes/1/pools' },
  {
    label: 'POST /api/gacha/students/:studentId/draws',
    method: 'POST',
    path: '/api/gacha/students/10/draws',
    body: { poolId: 1, times: 1 },
  },
  { label: 'GET /api/gacha/students/:studentId/collection', method: 'GET', path: '/api/gacha/students/10/collection' },
  {
    label: 'PUT /api/gacha/students/:studentId/active-pet/:instanceId',
    method: 'PUT',
    path: '/api/gacha/students/10/active-pet/1',
  },
];

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-gacha-auth-'));
  const file = path.join(directory, 'gacha-auth.sqlite');

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

  // Two classes with two teachers, a student in each, and a parent linked to student 10.
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (7, 'teacher', 't7', 'x', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (8, 'teacher', 't8', 'x', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (300, 'parent', 'p300', 'x', 1);
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'GAC1');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (2, '二班', 8, 'GAC2');
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (10, 100, 1, '小明', 0, 500);
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (20, 200, 2, '小刚', 0, 500);
    INSERT INTO parent_students (parent_id, student_id) VALUES (300, 10);
    INSERT INTO pet_dictionary (id, name, element, rarity, base_power) VALUES (1, '星兽', 'star', 'N', 10);
    INSERT INTO pet_dictionary (id, name, element, rarity, base_power) VALUES (2, '月兽', 'moon', 'R', 20);
    INSERT INTO pet_dictionary (id, name, element, rarity, base_power) VALUES (3, '日兽', 'sun', 'SR', 30);
    INSERT INTO pet_dictionary (id, name, element, rarity, base_power) VALUES (4, '辰兽', 'void', 'SSR', 40);
  `);

  kernel.permissions.store.set({
    scopeType: 'class',
    scopeId: 1,
    capabilityKey: 'classroom.enable_gacha',
    enabled: true,
  });
  kernel.permissions.store.set({
    scopeType: 'class',
    scopeId: 2,
    capabilityKey: 'classroom.enable_gacha',
    enabled: true,
  });

  server = await new Promise<Server>((resolve) => {
    const listener = kernel.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  teacherToken = kernel.sessions.issue({ userId: 7, role: 'teacher', ttlMs: 60_000 }).token;
  otherTeacherToken = kernel.sessions.issue({ userId: 8, role: 'teacher', ttlMs: 60_000 }).token;
  studentToken = kernel.sessions.issue({ userId: 100, role: 'student', ttlMs: 60_000 }).token;
  otherStudentToken = kernel.sessions.issue({ userId: 200, role: 'student', ttlMs: 60_000 }).token;
  parentToken = kernel.sessions.issue({ userId: 300, role: 'parent', ttlMs: 60_000 }).token;
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

  it('an anonymous pool read creates no pool and no pet is granted', async () => {
    expect(kernel.db.prepare('SELECT COUNT(*) AS n FROM gacha_pools').get()).toMatchObject({ n: 0 });
    expect(kernel.db.prepare('SELECT COUNT(*) AS n FROM student_pets').get()).toMatchObject({ n: 0 });
  });
});

describe('a known caller without the role is refused with 403', () => {
  it('POST /api/gacha/dictionary is teacher/admin only', async () => {
    for (const token of [studentToken, parentToken]) {
      const reply = await call('POST', '/api/gacha/dictionary', {
        token,
        body: { name: '越权兽', element: 'fire', rarity: 'N', base_power: 1 },
      });
      expect(reply.status).toBe(403);
      expect(reply.body).toMatchObject({ success: false, message: '无权限执行该操作' });
    }

    expect(kernel.db.prepare(`SELECT COUNT(*) AS n FROM pet_dictionary WHERE name = '越权兽'`).get()).toMatchObject({
      n: 0,
    });

    const byTeacher = await call('POST', '/api/gacha/dictionary', {
      token: teacherToken,
      body: { name: '教师兽', element: 'fire', rarity: 'N', base_power: 1 },
    });
    expect(byTeacher.status).toBe(201);
  });

  it('the draw routes are student only', async () => {
    for (const token of [teacherToken, parentToken]) {
      const reply = await call('POST', '/api/gacha/students/10/draws', {
        token,
        body: { poolId: 1, times: 1 },
      });
      expect(reply.status).toBe(403);
    }
  });

  it('a student naming another student is refused with 403, on every self route', async () => {
    const endpoints: Array<[string, string, unknown]> = [
      ['POST', '/api/gacha/draw/10', { poolId: 1, times: 1 }],
      ['POST', '/api/gacha/students/10/draws', { poolId: 1, times: 1 }],
      ['GET', '/api/gacha/collection/10', undefined],
      ['GET', '/api/gacha/students/10/collection', undefined],
      ['PUT', '/api/gacha/active/10/1', undefined],
      ['PUT', '/api/gacha/students/10/active-pet/1', undefined],
    ];

    for (const [method, endpoint, body] of endpoints) {
      const reply = await call(method, endpoint, { token: otherStudentToken, body });
      expect(reply.status, endpoint).toBe(403);
    }

    // Nothing was spent or granted for either student.
    const balances = kernel.db
      .prepare('SELECT id, available_points FROM students ORDER BY id')
      .all() as Array<{ id: number; available_points: number }>;
    expect(balances).toEqual([
      { id: 10, available_points: 500 },
      { id: 20, available_points: 500 },
    ]);
    expect(kernel.db.prepare('SELECT COUNT(*) AS n FROM student_pets').get()).toMatchObject({ n: 0 });
  });
});

describe('the right role on its own row gets the real answer', () => {
  let poolId = 0;

  it('a student may read their own class pool, which creates it on first read', async () => {
    const reply = await call('GET', '/api/gacha/classes/1/pools', { token: studentToken });

    expect(reply.status).toBe(200);
    expect(reply.body.data.pools).toHaveLength(1);
    poolId = reply.body.data.pools[0].id as number;

    // The class board is readable by its teacher too, and by nobody from another class.
    expect((await call('GET', '/api/gacha/classes/1/pools', { token: teacherToken })).status).toBe(200);
    expect((await call('GET', '/api/gacha/classes/1/pools', { token: otherTeacherToken })).status).toBe(403);
    expect((await call('GET', '/api/gacha/classes/1/pools', { token: otherStudentToken })).status).toBe(403);
    // The legacy alias answers the other envelope but the same gate.
    expect((await call('GET', '/api/gacha/pools/1', { token: otherStudentToken })).status).toBe(403);
    expect((await call('GET', '/api/gacha/pools/1', { token: studentToken })).status).toBe(200);
  });

  it('a student draws for their own row and pays for it', async () => {
    const reply = await call('POST', '/api/gacha/students/10/draws', {
      token: studentToken,
      body: { poolId, times: 1 },
    });

    expect(reply.status).toBe(201);
    expect(reply.body.data.results).toHaveLength(1);

    const row = kernel.db.prepare('SELECT available_points FROM students WHERE id = 10').get() as {
      available_points: number;
    };
    expect(row.available_points).toBe(400);
    expect(kernel.db.prepare('SELECT COUNT(*) AS n FROM student_pets WHERE student_id = 10').get()).toMatchObject({
      n: 1,
    });

    // The legacy alias is gated by the same rule, in both directions.
    expect((await call('POST', '/api/gacha/draw/20', { token: studentToken, body: { poolId, times: 1 } })).status).toBe(
      403,
    );
  });

  it('a collection is readable by the student, their parent and their class teacher', async () => {
    for (const token of [studentToken, parentToken, teacherToken]) {
      const reply = await call('GET', '/api/gacha/students/10/collection', { token });
      expect(reply.status, `token ${token.slice(0, 6)}`).toBe(200);
      expect(reply.body.data.collection).toHaveLength(1);
    }

    expect((await call('GET', '/api/gacha/students/10/collection', { token: otherTeacherToken })).status).toBe(403);
    expect((await call('GET', '/api/gacha/students/10/collection', { token: otherStudentToken })).status).toBe(403);
  });

  it('the dictionary is readable by any logged-in role and by nobody anonymous', async () => {
    expect((await call('GET', '/api/gacha/dictionary')).status).toBe(401);

    for (const token of [studentToken, teacherToken, parentToken]) {
      expect((await call('GET', '/api/gacha/dictionary', { token })).status).toBe(200);
    }
  });

  it('a student activates their own pet', async () => {
    const instanceId = (
      kernel.db.prepare('SELECT id FROM student_pets WHERE student_id = 10').get() as { id: number }
    ).id;

    const reply = await call('PUT', `/api/gacha/students/10/active-pet/${instanceId}`, { token: studentToken });
    expect(reply.status).toBe(200);
    expect(reply.body.data).toMatchObject({ activePetId: instanceId });
  });
});
