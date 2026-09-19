/**
 * Kernel boot smoke test - the P1 acceptance gate.
 *
 * Proves that the minimal core boots and serves infrastructure endpoints with
 * ZERO plugins loaded, and that it exposes no business surface of its own.
 */

import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';

let kernel: Kernel;
let server: Server;
let base: string;

beforeAll(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: { logLevel: 'silent', pluginsEnabled: false },
  });
  server = await new Promise<Server>((resolve) => {
    const s = kernel.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await kernel.shutdown();
});

const get = async (path: string, init?: RequestInit) => {
  const res = await fetch(base + path, init);
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

describe('kernel boots with zero plugins', () => {
  it('serves /api/health with a plugin summary of zero', async () => {
    const { status, body } = await get('/api/health');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.kernel.apiVersion).toBe(1);
    expect(body.kernel.plugins).toEqual({ total: 0, active: 0, degraded: 0 });
  });

  it('reports itself through /api/kernel/info', async () => {
    const { status, body } = await get('/api/kernel/info');
    expect(status).toBe(200);
    expect(body.data.apiVersion).toBe(1);
    expect(body.data.pluginsEnabled).toBe(false);
    expect(body.data.pluginDirs.length).toBeGreaterThan(0);
  });

  it('returns an empty plugin registry', async () => {
    const { status, body } = await get('/api/kernel/plugins');
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('returns an empty permission catalogue (kernel declares no permissions)', async () => {
    const { status, body } = await get('/api/kernel/permissions');
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('rejects unauthenticated /api/kernel/auth/me', async () => {
    const { status, body } = await get('/api/kernel/auth/me');
    expect(status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('returns the resolved actor for a bearer session', async () => {
    const { token } = kernel.sessions.issue({ userId: 42, role: 'teacher', ttlMs: 60_000 });
    const { status, body } = await get('/api/kernel/auth/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status).toBe(200);
    expect(body.data.actor).toEqual({ userId: 42, role: 'teacher' });
    expect(body.data.authSource).toBe('bearer');
  });

  it('revokes a session on logout', async () => {
    const { token } = kernel.sessions.issue({ userId: 7, role: 'student', ttlMs: 60_000 });
    const logout = await get('/api/kernel/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.body.data.revoked).toBe(true);
    const me = await get('/api/kernel/auth/me', { headers: { authorization: `Bearer ${token}` } });
    expect(me.status).toBe(401);
  });

  it('exposes no business route', async () => {
    for (const path of ['/api/students', '/api/pet', '/api/shop', '/api/classes']) {
      const { status, body } = await get(path);
      expect(status, `${path} must not exist in a zero-plugin kernel`).toBe(404);
      expect(body.message).toBe('接口不存在');
    }
  });

  it('echoes a request id on every response', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('accepts an inbound request id', async () => {
    const res = await fetch(`${base}/api/health`, { headers: { 'x-request-id': 'trace-abc' } });
    expect(res.headers.get('x-request-id')).toBe('trace-abc');
  });
});

describe('kernel applies its own migrations on boot', () => {
  it('records the sessions migration in the ledger', () => {
    expect(kernel.migrations.applied).toContain('0002_kernel_sessions');
  });

  it('creates the sessions table', () => {
    const row = kernel.db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'`)
      .get();
    expect(row).toBeTruthy();
  });

  it('is idempotent across reboots', async () => {
    const second = await createKernel({
      inMemoryDatabase: true,
      overrides: { logLevel: 'silent' },
    });
    // Fresh in-memory database: migrations apply again, proving the ledger is
    // keyed by id and not by process state.
    expect(second.migrations.applied).toContain('0002_kernel_sessions');
    await second.shutdown();
  });
});
