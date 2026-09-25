/**
 * The WeChat mini program surface, over real HTTP, against a really booted host.
 *
 * A unit test can prove the service's rules; this file proves the things that only meet at the seam:
 * that the manifest's four route declarations match the controller's decorators, that the plugin's
 * migration actually created both tables on a real database, that `identity.public` really exposes
 * the two methods this plugin consumes, and that a token minted here is accepted by the request
 * middleware on the next call.
 *
 * The code exchange is bypassed through the documented development switch
 * (`WECHAT_ALLOW_DEV_LOGIN=1` + `devOpenid`), because a test that reached api.weixin.qq.com would
 * need a real AppSecret and would be flaky in CI. The gateway's own refusal modes are covered in
 * `wechat-gateway.test.ts`.
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

interface Reply {
  status: number;
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
    body = text;
  }
  return { status: response.status, body };
}

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-http-'));
  const file = path.join(directory, 'wechat-http.sqlite');

  // Read by `ctx.config.get` at call time, which is exactly how the plugin reads its own switches.
  process.env.WECHAT_ALLOW_DEV_LOGIN = '1';

  kernel = await createKernel({
    rootDir: ROOT,
    overrides: { logLevel: 'silent', pluginsEnabled: true, pluginDirs: [], env: 'test', databaseFile: file },
    migrations: APP_MIGRATIONS,
    scopeResolver: async (_req, actor) => {
      if (actor.role !== 'student') return null;
      const classroom = host?.active
        .find((entry) => entry.manifest.id === 'classroom')
        ?.context.use('classroom.public');
      if (!classroom) return null;

      const studentRow = await classroom.getStudentByUserId(actor.userId);
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

  // One teacher (id 7) and one student (id 9, student row 10 in class 1). Plaintext password hashes
  // are the legacy rows `verifyPassword` still accepts, and the first successful bind upgrades them.
  kernel.db.exec(`
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (7, 'teacher', 't7', 'pw-teacher', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (8, 'teacher', 't8', 'pw-teacher', 1);
    INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (9, 'student', 's9', 'pw-student', 1);
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'WX1');
    INSERT INTO students (id, user_id, class_id, name, total_points, available_points)
      VALUES (10, 9, 1, '小明', 0, 0);
  `);

  kernel.permissions.store.set({
    scopeType: 'class',
    scopeId: 1,
    capabilityKey: 'classroom.enable_shop',
    enabled: true,
  });

  server = await new Promise<Server>((resolve) => {
    const listener = kernel.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  delete process.env.WECHAT_ALLOW_DEV_LOGIN;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await host?.stop();
  await kernel.shutdown();
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // Windows keeps the file handle briefly.
  }
});

describe('wechat plugin: route surface and access control', () => {
  it('publishes the plugin with its two tables created by its own migration', () => {
    const wechat = host.active.find((entry) => entry.manifest.id === 'wechat');
    expect(wechat).toBeTruthy();

    const tables = kernel.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'p_wechat_%' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toEqual(['p_wechat_accounts', 'p_wechat_login_tickets']);
  });

  it('401s an anonymous caller on both actor routes', async () => {
    const me = await call('GET', '/api/wechat/me');
    expect(me.status).toBe(401);
    expect(me.body.message).toBe('未登录或登录已过期');

    const unbind = await call('POST', '/api/wechat/unbind');
    expect(unbind.status).toBe(401);
  });

  it('400s a login with no code and no development openid', async () => {
    const reply = await call('POST', '/api/wechat/login', { body: {} });

    expect(reply.status).toBe(400);
    expect(reply.body.message).toBe('缺少微信登录凭证 code');
  });
});

describe('wechat plugin: bind, silent login and unbind', () => {
  it('walks the whole flow for a student, and the token works on the next request', async () => {
    const started = await call('POST', '/api/wechat/login', { body: { devOpenid: 'openid-student-9' } });
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ success: true, bound: false });
    const ticket = started.body.ticket as string;

    const bound = await call('POST', '/api/wechat/bind', {
      body: { ticket, username: 's9', password: 'pw-student', role: 'student' },
    });
    expect(bound.status).toBe(200);
    expect(bound.body).toMatchObject({
      success: true,
      bound: true,
      user: { id: 9, role: 'student', username: 's9', studentId: 10, classId: 1 },
    });
    expect(typeof bound.body.token).toBe('string');
    // The class-feature snapshot travels with the login, which is what the mini program's tab bar
    // resolves its visibility from.
    expect(bound.body.classFeatures).toMatchObject({ enable_shop: true });

    // The token is verified by the same middleware every other route uses.
    const me = await call('GET', '/api/wechat/me', { token: bound.body.token });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ success: true, bound: true, user: { id: 9 } });

    // A second wx.login needs no password.
    const again = await call('POST', '/api/wechat/login', { body: { devOpenid: 'openid-student-9' } });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ success: true, bound: true, user: { id: 9 } });
    expect(again.body.token).not.toBe(bound.body.token);

    const unbound = await call('POST', '/api/wechat/unbind', { token: again.body.token });
    expect(unbound.status).toBe(200);
    expect(unbound.body).toEqual({ success: true, unbound: true });

    const afterUnbind = await call('POST', '/api/wechat/login', { body: { devOpenid: 'openid-student-9' } });
    expect(afterUnbind.body).toMatchObject({ bound: false });
  });

  it('refuses a ticket that was already used', async () => {
    const started = await call('POST', '/api/wechat/login', { body: { devOpenid: 'openid-once' } });
    const ticket = started.body.ticket as string;

    const first = await call('POST', '/api/wechat/bind', {
      body: { ticket, username: 't7', password: 'pw-teacher', role: 'teacher' },
    });
    expect(first.status).toBe(200);

    const replay = await call('POST', '/api/wechat/bind', {
      body: { ticket, username: 't7', password: 'pw-teacher', role: 'teacher' },
    });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toBe('绑定已过期，请重新登录');
  });

  it('requires the role, because the credential lookup is the (username, role) pair', async () => {
    const started = await call('POST', '/api/wechat/login', { body: { devOpenid: 'openid-no-role' } });

    const reply = await call('POST', '/api/wechat/bind', {
      body: { ticket: started.body.ticket, username: 's9', password: 'pw-student' },
    });

    expect(reply.status).toBe(400);
    expect(reply.body.message).toBe('绑定参数不完整：需要 ticket、username、password、role');
  });

  it('answers the credential failure without saying whether the account exists', async () => {
    const started = await call('POST', '/api/wechat/login', { body: { devOpenid: 'openid-wrong' } });

    const wrong = await call('POST', '/api/wechat/bind', {
      body: { ticket: started.body.ticket, username: 's9', password: 'nope', role: 'student' },
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe('账号或密码错误，请重试');
  });

  it('reports bound:false for a session that holds no binding', async () => {
    // User 8 never bound anything; user 7 did, earlier in this file.
    const token = kernel.sessions.issue({ userId: 8, role: 'teacher', ttlMs: 60_000 }).token;

    const me = await call('GET', '/api/wechat/me', { token });

    expect(me.status).toBe(200);
    expect(me.body).toEqual({ success: true, bound: false });
  });
});
