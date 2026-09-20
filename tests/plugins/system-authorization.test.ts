/**
 * `api/system` authorization - the eight routes this plugin serves, over real HTTP.
 *
 * Every one of them was reachable with no credential at all before this suite existed:
 * `GET /api/system/backup/export` answered an anonymous caller with the whole database as JSON
 * (`users.password_hash` included), and the question bank - including its POST/PUT/DELETE half -
 * was anonymously writable. The plugin's manifest declared `auth: "actor"` and the controller
 * called nothing, which is exactly the gap: "declared" is not "checked".
 *
 * So the matrix below is the contract, per route:
 *
 *   anonymous                 -> 401 `未登录或登录已过期` (we do not know who you are)
 *   student / teacher         -> 403 `无权限执行该操作`     (we know, and you may not)
 *   admin, superadmin         -> the route's real answer
 *
 * The `@Res()` route is covered in both directions: refused callers get the ordinary error
 * envelope and *no* `content-disposition`, and only a credentialed caller gets the download.
 *
 * This is a real host boot (discovery, migrations, the Nest assembly, the kernel request-context
 * middleware) rather than a controller call with a fake `Request`, because the bug being fixed was
 * an integration gap: the helper is only meaningful if the middleware that populates the actor is
 * actually installed on these routes.
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

let superadminToken: string;
let adminToken: string;
let teacherToken: string;
let studentToken: string;

interface Reply {
  status: number;
  headers: Headers;
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
  return { status: response.status, headers: response.headers, text, body };
}

/** Every route the plugin serves, with a body where the method takes one. */
interface GuardedEndpoint {
  label: string;
  method: string;
  path: string;
  body?: unknown;
}

const GUARDED: GuardedEndpoint[] = [
  { label: 'GET /api/system/questions', method: 'GET', path: '/api/system/questions' },
  {
    label: 'POST /api/system/questions',
    method: 'POST',
    path: '/api/system/questions',
    body: { title: '匿名写入', type: 'single', teacher_id: 7 },
  },
  {
    label: 'PUT /api/system/questions/1',
    method: 'PUT',
    path: '/api/system/questions/1',
    body: { title: '匿名改写', type: 'single' },
  },
  { label: 'DELETE /api/system/questions/1', method: 'DELETE', path: '/api/system/questions/1' },
  { label: 'GET /api/system/settings', method: 'GET', path: '/api/system/settings' },
  {
    label: 'POST /api/system/settings',
    method: 'POST',
    path: '/api/system/settings',
    body: { key: 'anonymous_probe', value: 'x' },
  },
  { label: 'GET /api/system/logs', method: 'GET', path: '/api/system/logs' },
  { label: 'GET /api/system/backup/export', method: 'GET', path: '/api/system/backup/export' },
];

/** Create a question as the superadmin so the read/update/delete cases have a real row. */
async function createQuestion(title: string): Promise<number> {
  const created = await call('POST', '/api/system/questions', {
    token: superadminToken,
    body: { title, type: 'single', options: '["A","B"]', answer: 'A', explanation: '', teacher_id: 7 },
  });
  expect(created.status, `createQuestion body: ${created.text}`).toBe(201);
  return created.body.question.id as number;
}

/** Read back the questions of teacher 7, the owner `GET /api/system/questions` filters on. */
async function listQuestions(token: string): Promise<Array<Record<string, any>>> {
  const listed = await call('GET', '/api/system/questions?teacherId=7', { token });
  expect(listed.status).toBe(200);
  return listed.body.questions;
}

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-system-auth-'));
  const file = path.join(directory, 'system-auth.sqlite');

  kernel = await createKernel({
    rootDir: ROOT,
    overrides: { logLevel: 'silent', pluginsEnabled: true, pluginDirs: [], env: 'test', databaseFile: file },
    migrations: APP_MIGRATIONS,
    mountPlugins: async (hooks) => {
      host = await createPluginHost({
        ...hooks,
        pluginDirs: [path.join(ROOT, 'plugins')],
        authProvider: { current: null },
      });
      return host;
    },
  });

  // A user row with a real password hash, so `backup/export` below can prove what the anonymous
  // 401 is protecting: `users` is one of the sixteen tables the download dumps. User 7 exists
  // because `question_bank.teacher_id` carries a foreign key to `users.id`: inserting a question
  // for a teacher that does not exist is refused by SQLite, not by this suite.
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated)
      VALUES (1, 'superadmin', 'root', 'hash-in-the-backup', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated)
      VALUES (7, 'teacher', 'teacher7', 'x', 1);
    INSERT INTO operation_logs (teacher_id, user_id, role, action, details, ip_address)
      VALUES (7, 1, 'superadmin', 'SYSTEM_AUTH_PROBE', '{}', '127.0.0.1');
  `);

  server = await new Promise<Server>((resolve) => {
    const listener = kernel.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  superadminToken = kernel.sessions.issue({ userId: 1, role: 'superadmin', ttlMs: 60_000 }).token;
  adminToken = kernel.sessions.issue({ userId: 2, role: 'admin', ttlMs: 60_000 }).token;
  teacherToken = kernel.sessions.issue({ userId: 7, role: 'teacher', ttlMs: 60_000 }).token;
  studentToken = kernel.sessions.issue({ userId: 8, role: 'student', ttlMs: 60_000 }).token;
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

  it('the backup download is refused before a single byte of it is written', async () => {
    const reply = await call('GET', '/api/system/backup/export');

    expect(reply.status).toBe(401);
    // The `@Res()` handler must throw before setting the download headers, or a refused caller
    // would still receive a half-written attachment of the real database.
    expect(reply.headers.get('content-disposition')).toBeNull();
    expect(reply.text).not.toContain('hash-in-the-backup');
    expect(reply.text).not.toContain('password_hash');
  });

  it('a garbage bearer token is anonymous, not an admin', async () => {
    const reply = await call('GET', '/api/system/logs', { token: 'not-a-real-session-token' });

    expect(reply.status).toBe(401);
    expect(reply.body).toMatchObject({ success: false, message: '未登录或登录已过期' });
  });
});

describe('a known caller without the admin role is refused with 403', () => {
  for (const endpoint of GUARDED) {
    it(`${endpoint.label} answers 403 for a student`, async () => {
      const reply = await call(endpoint.method, endpoint.path, { token: studentToken, body: endpoint.body });

      expect(reply.status).toBe(403);
      expect(reply.body).toMatchObject({ success: false, message: '无权限执行该操作' });
    });
  }

  it('a teacher is refused too, on the sharpest route', async () => {
    const reply = await call('GET', '/api/system/backup/export', { token: teacherToken });

    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ success: false, message: '无权限执行该操作' });
    expect(reply.headers.get('content-disposition')).toBeNull();
    expect(reply.text).not.toContain('hash-in-the-backup');
  });
});

describe('admins and superadmins get the real answer', () => {
  it('GET /api/system/questions lists the question bank', async () => {
    const id = await createQuestion('鉴权测试题');
    const questions = await listQuestions(superadminToken);

    expect(questions.some((question) => question.id === id)).toBe(true);
  });

  it('POST /api/system/questions creates a question', async () => {
    // Nest's POST default is 201 for this domain: the controller carries no `@HttpCode`, and
    // pinning 200 here would change the surface instead of preserving it.
    const created = await call('POST', '/api/system/questions', {
      token: superadminToken,
      body: { title: '新题目', type: 'single', options: '["A"]', answer: 'A', teacher_id: 7 },
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ success: true, question: { title: '新题目' } });
    expect(await listQuestions(superadminToken)).toContainEqual(
      expect.objectContaining({ id: created.body.question.id }),
    );
  });

  it('PUT /api/system/questions/:id updates the row', async () => {
    const id = await createQuestion('更新前');

    const updated = await call('PUT', `/api/system/questions/${id}`, {
      token: superadminToken,
      body: { title: '更新后', type: 'single', options: '["A"]', answer: 'A' },
    });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ success: true });
    expect(await listQuestions(superadminToken)).toContainEqual(
      expect.objectContaining({ id, title: '更新后' }),
    );
  });

  it('DELETE /api/system/questions/:id removes the row', async () => {
    const id = await createQuestion('删除我');
    expect(await listQuestions(superadminToken)).toContainEqual(expect.objectContaining({ id }));

    const deleted = await call('DELETE', `/api/system/questions/${id}`, { token: superadminToken });

    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ success: true });
    expect(await listQuestions(superadminToken)).not.toContainEqual(expect.objectContaining({ id }));
  });

  it('GET /api/system/settings and POST /api/system/settings round-trip a setting', async () => {
    const saved = await call('POST', '/api/system/settings', {
      token: superadminToken,
      body: { key: 'auth_probe_key', value: 'probe-value', description: '鉴权测试' },
    });

    expect(saved.status).toBe(201);
    expect(saved.body).toEqual({ success: true });

    const listed = await call('GET', '/api/system/settings', { token: superadminToken });
    expect(listed.status).toBe(200);
    expect(listed.body.success).toBe(true);
    expect(listed.body.settings).toContainEqual(
      expect.objectContaining({ key: 'auth_probe_key', value: 'probe-value' }),
    );
  });

  it('GET /api/system/logs reads the operation log', async () => {
    const reply = await call('GET', '/api/system/logs', { token: adminToken });

    expect(reply.status).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(Array.isArray(reply.body.logs)).toBe(true);
    expect(reply.body.logs).toContainEqual(expect.objectContaining({ action: 'SYSTEM_AUTH_PROBE' }));
  });

  it('GET /api/system/backup/export downloads the whole database, and only then', async () => {
    const reply = await call('GET', '/api/system/backup/export', { token: superadminToken });

    expect(reply.status).toBe(200);
    expect(reply.headers.get('content-type')).toContain('application/json');
    expect(reply.headers.get('content-disposition')).toBe('attachment; filename=backup.json');

    // Verbatim JSON, not a quoted JSON string - the reason this route keeps `@Res()`.
    const dump = JSON.parse(reply.text) as Record<string, unknown[]>;
    expect(Object.keys(dump)).toContain('users');
    expect(dump.users).toContainEqual(expect.objectContaining({ password_hash: 'hash-in-the-backup' }));
  });
});

