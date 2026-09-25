/**
 * The binding rules, over a real database.
 *
 * These are the tests the SQL deserves: ticket single-use is an `UPDATE ... WHERE consumed_at IS
 * NULL`, rebinding is a `DELETE` + `INSERT` in one transaction under two unique indexes, and the
 * cleanup rule has to remove tickets through openids it is about to delete. A mocked repository would
 * assert the shape of these calls and none of their behaviour.
 *
 * `identity.public` and the WeChat gateway are faked, because both are other systems' answers - the
 * real gateway's refusal modes are covered in `wechat-gateway.test.ts`, and the real port is
 * exercised over HTTP in `wechat-http.test.ts`.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IdentityPort } from '@thinkclass/contracts/domains/identity';
import { ApiError } from '@thinkclass/kernel';
import type { DbApi, KernelContext } from '@thinkclass/plugin-sdk';

import { createWechatCleanupRule } from '../../plugins/wechat/src/wechat.cleanup.js';
import { createGatewayFromConfig } from '../../plugins/wechat/src/wechat.gateway.js';
import { createWechatRepository } from '../../plugins/wechat/src/wechat.repository.js';
import { WechatService, type WechatRequestMeta } from '../../plugins/wechat/src/wechat.service.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = fs.readFileSync(
  path.join(ROOT, 'plugins', 'wechat', 'migrations', '0001_init.sql'),
  'utf8',
);

const META: WechatRequestMeta = { userAgent: 'MicroMessenger/test', ip: '203.0.113.9' };

/** A `DbApi` over a private in-memory database, which is all the repository needs. */
function createDb(): { db: DbApi; close: () => void } {
  const raw = new Database(':memory:');
  raw.exec(MIGRATION);

  const api: DbApi = {
    query: (sql, params) => raw.prepare(sql).all(...(params ?? [])) as never,
    get: (sql, params) => raw.prepare(sql).get(...(params ?? [])) as never,
    run: (sql, params) => raw.prepare(sql).run(...(params ?? [])) as never,
    tx: (fn) => raw.transaction(() => fn(api))(),
    exec: (sql) => raw.exec(sql),
  };

  return { db: api, close: () => raw.close() };
}

interface FakeUser {
  id: number;
  username: string;
  role: string;
  password: string;
}

const USERS: FakeUser[] = [
  { id: 5, username: 'student01', role: 'student', password: 'pw-student' },
  { id: 7, username: 'teacher01', role: 'teacher', password: 'pw-teacher' },
];

function createFakeIdentity(users: FakeUser[] = USERS) {
  const calls: string[] = [];
  const port = {
    async loginWithCredentials({ username, password }: { username: string; password: string }) {
      calls.push('loginWithCredentials');
      const user = users.find((entry) => entry.username === username);
      if (!user || user.password !== password) {
        throw new ApiError(401, '账号或密码错误，请重试');
      }
      return {
        user: { id: user.id, role: user.role, username: user.username, is_activated: true },
        classFeatures: { enable_shop: true },
      };
    },
    async getLoginPayload(userId: number) {
      calls.push('getLoginPayload');
      const user = users.find((entry) => entry.id === userId);
      if (!user) return null;
      return {
        user: { id: user.id, role: user.role, username: user.username, is_activated: true },
        classFeatures: { enable_shop: true },
      };
    },
  };

  return { port: port as unknown as IdentityPort, calls };
}

function createFakeContext(options: { env?: string; allowDevLogin?: boolean } = {}) {
  const issued: Array<{ userId: number; role: string; ttlMs: number }> = [];
  const audits: Array<Record<string, unknown>> = [];

  const ctx = {
    config: {
      env: options.env ?? 'test',
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      get: (key: string) =>
        key === 'WECHAT_ALLOW_DEV_LOGIN' && options.allowDevLogin ? '1' : undefined,
    },
    sessions: {
      issue: (input: { userId: number; role: string; ttlMs: number }) => {
        issued.push(input);
        return { token: `token-for-${input.userId}`, expiresAt: '2026-12-31T00:00:00.000Z' };
      },
    },
    audit: {
      record: (entry: Record<string, unknown>) => {
        audits.push(entry);
      },
    },
    log: { warn: () => {}, info: () => {}, debug: () => {}, error: () => {} },
  } as unknown as KernelContext;

  return { ctx, issued, audits };
}

interface Harness {
  service: WechatService;
  db: DbApi;
  identity: ReturnType<typeof createFakeIdentity>;
  issued: Array<{ userId: number; role: string; ttlMs: number }>;
  audits: Array<Record<string, unknown>>;
  close: () => void;
}

function createHarness(
  options: {
    env?: string;
    allowDevLogin?: boolean;
    users?: FakeUser[];
    gateway?: () => { exchangeCode(code: string): Promise<{ openid: string; unionid: string | null }> };
  } = {},
): Harness {
  const { db, close } = createDb();
  const identity = createFakeIdentity(options.users ?? USERS);
  const { ctx, issued, audits } = createFakeContext(options);

  const service = new WechatService({
    ctx,
    repository: createWechatRepository(db),
    identity: identity.port,
    gateway:
      options.gateway ??
      (() => ({
        async exchangeCode(code: string) {
          return { openid: `openid-for-${code}`, unionid: 'union-1' };
        },
      })),
  });

  return { service, db, identity, issued, audits, close };
}

let harness: Harness;

afterEach(() => {
  harness?.close();
});

describe('wechat login: the two-step flow', () => {
  it('hands back a ticket for an unbound openid, and stores only its digest', async () => {
    harness = createHarness();

    const answer = await harness.service.login({ code: 'code-a' }, META);

    expect(answer).toMatchObject({ success: true, bound: false });
    const ticket = (answer as { ticket: string }).ticket;
    expect(ticket).toHaveLength(43); // 32 random bytes, base64url

    const rows = harness.db.query<{ ticket_hash: string; openid: string; unionid: string | null }>(
      'SELECT ticket_hash, openid, unionid FROM p_wechat_login_tickets',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].openid).toBe('openid-for-code-a');
    // The unionid travels with the ticket: the code cannot be exchanged twice at bind time.
    expect(rows[0].unionid).toBe('union-1');
    expect(rows[0].ticket_hash).not.toBe(ticket);
    expect(rows[0].ticket_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('completes the binding and answers a session for the account', async () => {
    harness = createHarness();
    const started = (await harness.service.login({ code: 'code-b' }, META)) as { ticket: string };

    const bound = await harness.service.bind(
      { ticket: started.ticket, username: 'student01', password: 'pw-student', role: 'student' },
      META,
    );

    expect(bound).toMatchObject({
      success: true,
      bound: true,
      token: 'token-for-5',
      expiresAt: '2026-12-31T00:00:00.000Z',
      user: { id: 5, role: 'student', username: 'student01' },
      classFeatures: { enable_shop: true },
    });
    expect(harness.issued[0]).toMatchObject({ userId: 5, role: 'student' });

    const accounts = harness.db.query<{ openid: string; user_id: number; role: string }>(
      'SELECT openid, user_id, role FROM p_wechat_accounts',
    );
    expect(accounts).toEqual([{ openid: 'openid-for-code-b', user_id: 5, role: 'student' }]);
    expect(harness.audits[0]).toMatchObject({ action: 'WECHAT_BIND', actorId: 5 });
  });

  it('logs a bound openid straight in, without a password', async () => {
    harness = createHarness();
    const started = (await harness.service.login({ code: 'code-c' }, META)) as { ticket: string };
    await harness.service.bind(
      { ticket: started.ticket, username: 'teacher01', password: 'pw-teacher', role: 'teacher' },
      META,
    );

    const again = await harness.service.login({ code: 'code-c' }, META);

    expect(again).toMatchObject({ success: true, bound: true, token: 'token-for-7' });
    // The silent path is the only one that asks identity for a payload without a password; the bind
    // above went through `loginWithCredentials` instead.
    expect(harness.identity.calls.filter((call) => call === 'getLoginPayload')).toHaveLength(1);
    expect(harness.identity.calls).toContain('loginWithCredentials');
  });

  it('refuses a ticket twice - the second bind cannot mint a second session', async () => {
    harness = createHarness();
    const started = (await harness.service.login({ code: 'code-d' }, META)) as { ticket: string };
    await harness.service.bind({ ticket: started.ticket, username: 'student01', password: 'pw-student', role: 'student' }, META);

    await expect(
      harness.service.bind({ ticket: started.ticket, username: 'student01', password: 'pw-student', role: 'student' }, META),
    ).rejects.toMatchObject({ status: 401, message: '绑定已过期，请重新登录' });
  });

  it('refuses an expired ticket', async () => {
    harness = createHarness();
    const repository = createWechatRepository(harness.db);
    repository.createTicket({
      ticketHash: 'deadbeef',
      openid: 'openid-expired',
      unionid: null,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    await expect(
      harness.service.bind({ ticket: 'anything', username: 'student01', password: 'pw-student', role: 'student' }, META),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('requires all three bind fields', async () => {
    harness = createHarness();

    await expect(harness.service.bind({ ticket: 't' }, META)).rejects.toMatchObject({
      status: 400,
      message: '绑定参数不完整：需要 ticket、username、password、role',
    });
  });

  it('keeps the credential error the identity plugin raised', async () => {
    harness = createHarness();
    const started = (await harness.service.login({ code: 'code-e' }, META)) as { ticket: string };

    await expect(
      harness.service.bind({ ticket: started.ticket, username: 'student01', password: 'wrong', role: 'student' }, META),
    ).rejects.toMatchObject({ status: 401, message: '账号或密码错误，请重试' });
  });

  it('replaces a stale binding instead of looping on it', async () => {
    // The account behind the binding is gone: the row must not survive as a 401 generator.
    harness = createHarness({ users: [], allowDevLogin: true });
    const repository = createWechatRepository(harness.db);
    repository.linkAccount({ openid: 'openid-orphan', unionid: null, userId: 5, role: 'student' });

    await expect(harness.service.login({ devOpenid: 'openid-orphan' }, META)).rejects.toMatchObject({
      status: 401,
      message: '微信绑定已失效，请重新登录并绑定账号',
    });

    expect(harness.db.query('SELECT id FROM p_wechat_accounts')).toHaveLength(0);
  });
});

describe('wechat login: rebinding and unbinding', () => {
  it('keeps one binding per account when a new WeChat replaces the old one', async () => {
    harness = createHarness({ allowDevLogin: true });

    const first = (await harness.service.login({ devOpenid: 'openid-old' }, META)) as { ticket: string };
    await harness.service.bind({ ticket: first.ticket, username: 'student01', password: 'pw-student', role: 'student' }, META);

    const second = (await harness.service.login({ devOpenid: 'openid-new' }, META)) as { ticket: string };
    await harness.service.bind({ ticket: second.ticket, username: 'student01', password: 'pw-student', role: 'student' }, META);

    const accounts = harness.db.query<{ openid: string; user_id: number }>(
      'SELECT openid, user_id FROM p_wechat_accounts',
    );
    expect(accounts).toEqual([{ openid: 'openid-new', user_id: 5 }]);

    // The old openid is unbound again rather than pointing at the account.
    const orphan = await harness.service.login({ devOpenid: 'openid-old' }, META);
    expect(orphan).toMatchObject({ bound: false });
  });

  it('unbinds only the caller, and reports whether anything was removed', async () => {
    harness = createHarness({ allowDevLogin: true });
    const started = (await harness.service.login({ devOpenid: 'openid-x' }, META)) as { ticket: string };
    await harness.service.bind({ ticket: started.ticket, username: 'student01', password: 'pw-student', role: 'student' }, META);

    await expect(harness.service.unbind(5)).resolves.toEqual({ success: true, unbound: true });
    await expect(harness.service.unbind(5)).resolves.toEqual({ success: true, unbound: false });
    // A different account's call removes nothing.
    await expect(harness.service.unbind(7)).resolves.toEqual({ success: true, unbound: false });
    expect(harness.audits.filter((entry) => entry.action === 'WECHAT_UNBIND')).toHaveLength(1);
  });
});

describe('wechat me', () => {
  it('reports bound:false for a session with no binding, as a normal answer', async () => {
    harness = createHarness();

    await expect(harness.service.me(5)).resolves.toEqual({ success: true, bound: false });
  });

  it('reports the binding and the payload for a bound session', async () => {
    harness = createHarness({ allowDevLogin: true });
    const started = (await harness.service.login({ devOpenid: 'openid-me' }, META)) as { ticket: string };
    await harness.service.bind({ ticket: started.ticket, username: 'student01', password: 'pw-student', role: 'student' }, META);

    await expect(harness.service.me(5)).resolves.toMatchObject({
      success: true,
      bound: true,
      user: { id: 5, username: 'student01' },
      classFeatures: { enable_shop: true },
    });
  });
});

describe('wechat login: configuration and the development bypass', () => {
  it('answers 503 with the variable names when the credentials are missing', async () => {
    harness = createHarness({
      gateway: () =>
        createGatewayFromConfig({
          config: { get: () => undefined },
        } as unknown as KernelContext),
    });

    await expect(harness.service.login({ code: 'c' }, META)).rejects.toMatchObject({
      status: 503,
      message: '微信小程序未配置：请设置 WECHAT_APPID / WECHAT_SECRET',
    });
  });

  it('refuses the bypass in production, whatever the flag says', async () => {
    harness = createHarness({ env: 'production', allowDevLogin: true });

    await expect(harness.service.login({ devOpenid: 'openid-dev' }, META)).rejects.toMatchObject({
      status: 403,
      message: '生产环境不允许使用开发登录',
    });
  });

  it('refuses the bypass unless it is switched on', async () => {
    harness = createHarness({ allowDevLogin: false });

    await expect(harness.service.login({ devOpenid: 'openid-dev' }, META)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('accepts the bypass when it is explicitly enabled outside production', async () => {
    harness = createHarness({ allowDevLogin: true });

    await expect(harness.service.login({ devOpenid: 'openid-dev' }, META)).resolves.toMatchObject({
      bound: false,
    });
    expect(
      harness.db.query<{ openid: string }>('SELECT openid FROM p_wechat_login_tickets'),
    ).toEqual([{ openid: 'openid-dev' }]);
  });

  it('asks for a code when neither is present', async () => {
    harness = createHarness();

    await expect(harness.service.login({}, META)).rejects.toMatchObject({
      status: 400,
      message: '缺少微信登录凭证 code',
    });
  });
});

describe('wechat cleanup rule', () => {
  it('removes the bindings and tickets of the erased accounts only', () => {
    harness = createHarness();
    const repository = createWechatRepository(harness.db);
    repository.linkAccount({ openid: 'openid-5', unionid: null, userId: 5, role: 'student' });
    repository.linkAccount({ openid: 'openid-7', unionid: null, userId: 7, role: 'teacher' });
    repository.createTicket({
      ticketHash: 'hash-5',
      openid: 'openid-5',
      unionid: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    repository.createTicket({
      ticketHash: 'hash-7',
      openid: 'openid-7',
      unionid: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const rule = createWechatCleanupRule();
    harness.db.tx((tx) =>
      rule.run(tx, { teacherIds: [], classIds: [], studentIds: [], userIds: [5] }),
    );

    expect(harness.db.query<{ openid: string }>('SELECT openid FROM p_wechat_accounts')).toEqual([
      { openid: 'openid-7' },
    ]);
    // The ticket of the erased account goes with it; the other account's ticket stays.
    expect(harness.db.query<{ openid: string }>('SELECT openid FROM p_wechat_login_tickets')).toEqual([
      { openid: 'openid-7' },
    ]);
  });

  it('is a no-op when no account is in scope', () => {
    harness = createHarness();
    createWechatRepository(harness.db).linkAccount({
      openid: 'openid-keep',
      unionid: null,
      userId: 5,
      role: 'student',
    });

    const rule = createWechatCleanupRule();
    harness.db.tx((tx) =>
      rule.run(tx, { teacherIds: [], classIds: [], studentIds: [], userIds: [] }),
    );

    expect(harness.db.query('SELECT id FROM p_wechat_accounts')).toHaveLength(1);
  });
});
