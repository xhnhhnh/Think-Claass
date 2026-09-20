/**
 * `api/audit-logs` and `api/openapi/*` authorization - the eight console routes that were served
 * without any credential.
 *
 * `AuditLogsController` and `OpenApiController` live in the admin plugin next to the `/api/admin`
 * surface, whose every route calls `requireAdmin`, and both are called by the same console
 * (`src/features/admin/api/adminClient.ts`, which sends the session token its own login mints).
 * Neither controller called anything, so `GET /api/openapi/keys` answered anonymous callers with
 * plaintext `sk_...` secrets and `GET /api/audit-logs` with operator ids and IPs.
 *
 * Per route, the matrix this pins is:
 *
 *   anonymous                 -> 401 `未登录或登录已过期`
 *   student                   -> 403 `无权限执行该操作`
 *   admin / superadmin        -> the route's real answer
 *
 * The refusal half is asserted before the success half in each block, because a 200 is only
 * evidence of authorization if the same call without the credential is refused.
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

interface GuardedEndpoint {
  label: string;
  method: string;
  path: string;
  body?: unknown;
}

/** The eight routes the two controllers serve: 1 audit-log read, 3 key routes, 4 school routes. */
const GUARDED: GuardedEndpoint[] = [
  { label: 'GET /api/audit-logs', method: 'GET', path: '/api/audit-logs' },
  { label: 'GET /api/openapi/keys', method: 'GET', path: '/api/openapi/keys' },
  { label: 'POST /api/openapi/keys', method: 'POST', path: '/api/openapi/keys', body: { name: '匿名密钥' } },
  { label: 'DELETE /api/openapi/keys/1', method: 'DELETE', path: '/api/openapi/keys/1' },
  { label: 'GET /api/openapi/schools', method: 'GET', path: '/api/openapi/schools' },
  {
    label: 'POST /api/openapi/schools',
    method: 'POST',
    path: '/api/openapi/schools',
    body: { name: '匿名学校' },
  },
  {
    label: 'PUT /api/openapi/schools/1',
    method: 'PUT',
    path: '/api/openapi/schools/1',
    body: { name: '匿名改名' },
  },
  { label: 'DELETE /api/openapi/schools/1', method: 'DELETE', path: '/api/openapi/schools/1' },
];

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-admin-openapi-auth-'));
  const file = path.join(directory, 'admin-openapi-auth.sqlite');

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

  // One audit entry to read back: `GET /api/audit-logs` is the viewer over `operation_logs`.
  kernel.db.exec(`
    INSERT INTO operation_logs (teacher_id, user_id, role, action, details, ip_address)
      VALUES (7, 1, 'superadmin', 'OPENAPI_AUTH_PROBE', '{}', '127.0.0.1');
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

  it('the key listing does not leak a plaintext `sk_...` to an anonymous caller', async () => {
    // The route used to answer this request with `{ success: true, keys: [{ key: 'sk_...' }] }`.
    const reply = await call('GET', '/api/openapi/keys');

    expect(reply.status).toBe(401);
    expect(reply.text).not.toMatch(/sk_[0-9a-f]{48}/);
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

  it('a teacher is refused as well', async () => {
    const reply = await call('GET', '/api/audit-logs', { token: teacherToken });

    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ success: false, message: '无权限执行该操作' });
  });
});

describe('admins and superadmins get the real answer', () => {
  it('GET /api/audit-logs serves the viewer envelope to an admin', async () => {
    const reply = await call('GET', '/api/audit-logs', { token: adminToken });

    expect(reply.status).toBe(200);
    expect(reply.body.success).toBe(true);
    expect(Array.isArray(reply.body.data)).toBe(true);
    expect(reply.body.total).toBeGreaterThanOrEqual(1);
    expect(reply.body.data).toContainEqual(expect.objectContaining({ action: 'OPENAPI_AUTH_PROBE' }));
  });

  it('the key routes create, list and delete a key with the legacy envelope', async () => {
    const created = await call('POST', '/api/openapi/keys', {
      token: superadminToken,
      body: { name: '测试密钥' },
    });

    expect(created.status).toBe(200);
    expect(created.body.key.key).toMatch(/^sk_[0-9a-f]{48}$/);

    const listed = await call('GET', '/api/openapi/keys', { token: superadminToken });
    expect(listed.status).toBe(200);
    expect(listed.body.keys).toContainEqual(expect.objectContaining({ id: created.body.key.id, name: '测试密钥' }));

    const deleted = await call('DELETE', `/api/openapi/keys/${created.body.key.id}`, { token: superadminToken });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ success: true });
    expect((await call('GET', '/api/openapi/keys', { token: superadminToken })).body.keys).not.toContainEqual(
      expect.objectContaining({ id: created.body.key.id }),
    );
  });

  it('the school routes create, list, update and delete a school', async () => {
    const created = await call('POST', '/api/openapi/schools', {
      token: superadminToken,
      body: { name: '示范学校', description: 'd' },
    });
    expect(created.status).toBe(200);

    const id = created.body.school.id;
    const updated = await call('PUT', `/api/openapi/schools/${id}`, {
      token: superadminToken,
      body: { name: '示范学校二', description: 'd2' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.school.name).toBe('示范学校二');

    const listed = await call('GET', '/api/openapi/schools', { token: superadminToken });
    expect(listed.status).toBe(200);
    expect(listed.body.schools).toContainEqual(expect.objectContaining({ id, name: '示范学校二' }));

    const deleted = await call('DELETE', `/api/openapi/schools/${id}`, { token: superadminToken });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ success: true });
    expect((await call('GET', '/api/openapi/schools', { token: superadminToken })).body.schools).not.toContainEqual(
      expect.objectContaining({ id }),
    );
  });

  it('an authorized caller still reaches the repository validation', async () => {
    // `throwAdminError` passes the kernel `ApiError` through untouched, so the 400 the repository
    // raises for a missing name survives the new gate instead of turning into a 401/403/500.
    const reply = await call('POST', '/api/openapi/keys', { token: superadminToken, body: {} });

    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({ success: false, message: '名称为必填项' });
  });
});
