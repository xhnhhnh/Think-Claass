/**
 * Session authentication and the legacy header bridge (P2).
 *
 * The baseline trusted `x-user-role` / `x-user-id` verbatim, so any client could
 * become a superadmin by editing a header. These tests pin the replacement
 * behaviour and, just as importantly, the shape of the migration bridge: forged
 * headers must be rejected when the bridge is off and honoured only while it is on.
 */

import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { createKernel, type AuthProvider, type Kernel } from '@thinkclass/kernel';

/** Minimal identity owner; in P3 this is the identity plugin. */
function stubAuthProvider(): AuthProvider {
  return {
    async authenticate({ username, password }) {
      if (username !== 'teacher' || password !== 'secret') return null;
      return {
        actor: { userId: 11, role: 'teacher', classId: 3 },
        profile: { displayName: '示例老师' },
      };
    },
  };
}

interface Harness {
  kernel: Kernel;
  server: Server;
  base: string;
  close(): Promise<void>;
}

const openHarnesses: Harness[] = [];

async function boot(overrides: Record<string, unknown> = {}): Promise<Harness> {
  const kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: { logLevel: 'silent', ...overrides },
    // A holder, not a provider: since P4.3b.7 the identity plugin registers the real verifier
    // during setup, and the kernel router reads `current` per request. In a kernel-only test there
    // is no plugin, so pre-filling the holder is how a test supplies one.
    authProvider: { current: stubAuthProvider() },
  });
  const server = await new Promise<Server>((resolve) => {
    const s = kernel.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const harness: Harness = {
    kernel,
    server,
    base: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await kernel.shutdown();
    },
  };
  openHarnesses.push(harness);
  return harness;
}

afterEach(async () => {
  while (openHarnesses.length > 0) {
    await openHarnesses.pop()?.close();
  }
});

const post = async (base: string, path: string, body: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

const get = async (base: string, path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(base + path, { headers });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

// ---------------------------------------------------------------------------

describe('login issues a session', () => {
  it('returns a token and an actor for valid credentials', async () => {
    const { base, kernel } = await boot();
    const { status, body } = await post(base, '/api/kernel/auth/login', {
      username: 'teacher',
      password: 'secret',
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(body.data.actor).toEqual({ userId: 11, role: 'teacher', classId: 3 });
    expect(body.data.profile).toEqual({ displayName: '示例老师' });

    // Stored as a digest, never in the clear.
    const row = kernel.db.prepare(`SELECT token_hash FROM sessions`).get() as { token_hash: string };
    expect(row.token_hash).not.toBe(body.data.token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects bad credentials with 401 and issues nothing', async () => {
    const { base, kernel } = await boot();
    const { status } = await post(base, '/api/kernel/auth/login', { username: 'teacher', password: 'wrong' });

    expect(status).toBe(401);
    const count = kernel.db.prepare(`SELECT COUNT(*) AS n FROM sessions`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('rejects a request with no credentials', async () => {
    const { base } = await boot();
    const { status } = await post(base, '/api/kernel/auth/login', {});
    expect(status).toBe(400);
  });

  it('reports 503 when no identity owner is wired', async () => {
    const kernel = await createKernel({ inMemoryDatabase: true, overrides: { logLevel: 'silent' } });
    const server = await new Promise<Server>((resolve) => {
      const s = kernel.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const { status, body } = await post(base, '/api/kernel/auth/login', { username: 'a', password: 'b' });
      expect(status).toBe(503);
      expect(body.code).toBe('AUTH_PROVIDER_MISSING');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await kernel.shutdown();
    }
  });
});

describe('bearer sessions', () => {
  it('resolves the actor from the token', async () => {
    const { base } = await boot();
    const login = await post(base, '/api/kernel/auth/login', { username: 'teacher', password: 'secret' });

    const me = await get(base, '/api/kernel/auth/me', { authorization: `Bearer ${login.body.data.token}` });
    expect(me.status).toBe(200);
    expect(me.body.data.actor.role).toBe('teacher');
    expect(me.body.data.authSource).toBe('bearer');
  });

  it('rejects a garbage token', async () => {
    const { base } = await boot();
    const me = await get(base, '/api/kernel/auth/me', { authorization: 'Bearer not-a-real-token' });
    expect(me.status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const { base, kernel } = await boot();
    const { token } = kernel.sessions.issue({ userId: 5, role: 'student', ttlMs: -1000 });
    const me = await get(base, '/api/kernel/auth/me', { authorization: `Bearer ${token}` });
    expect(me.status).toBe(401);
  });

  it('rejects a revoked session', async () => {
    const { base, kernel } = await boot();
    const { token } = kernel.sessions.issue({ userId: 5, role: 'student', ttlMs: 60_000 });
    kernel.sessions.revoke(token);
    const me = await get(base, '/api/kernel/auth/me', { authorization: `Bearer ${token}` });
    expect(me.status).toBe(401);
  });
});

describe('legacy header bridge', () => {
  const forged = { 'x-user-role': 'superadmin', 'x-user-id': '1' };

  it('is honoured while ALLOW_LEGACY_HEADER_AUTH is on', async () => {
    const { base } = await boot({ allowLegacyHeaderAuth: true });
    const me = await get(base, '/api/kernel/auth/me', forged);
    expect(me.status).toBe(200);
    expect(me.body.data.actor).toEqual({ userId: 1, role: 'superadmin' });
    expect(me.body.data.authSource).toBe('legacy-headers');
  });

  it('is rejected once ALLOW_LEGACY_HEADER_AUTH is off', async () => {
    const { base } = await boot({ allowLegacyHeaderAuth: false });
    const me = await get(base, '/api/kernel/auth/me', forged);

    // The whole point of P2: a forged header must not authenticate anyone.
    expect(me.status).toBe(401);
    expect(me.body.success).toBe(false);
  });

  it('is off by default, so a forged header cannot authenticate without opting in', async () => {
    // The default, not the override. `boot()` passes no `allowLegacyHeaderAuth`, so this reads
    // whatever `loadConfig()` resolves - and it must resolve to closed.
    //
    // It used to resolve to open. The bridge was meant to let pre-token sessions keep working, but
    // the headers are client-supplied and unverifiable, so an open-by-default bridge makes every
    // per-endpoint authorization check in the application advisory: two headers turn any caller into
    // `superadmin`. Defaulting closed is what makes the per-endpoint guards mean anything, so this
    // assertion is the one that keeps them meaningful.
    const { base } = await boot();
    const me = await get(base, '/api/kernel/auth/me', forged);

    expect(me.status).toBe(401);
    expect(me.body.success).toBe(false);
  });

  it('still honours the bridge when it is explicitly enabled', async () => {
    // The opt-in has to keep working, otherwise the fix would be a removal rather than a default.
    // A deployment that genuinely still needs the bridge sets `ALLOW_LEGACY_HEADER_AUTH=1` and gets
    // exactly the old behaviour, logged per request.
    const { base } = await boot({ allowLegacyHeaderAuth: true });
    const me = await get(base, '/api/kernel/auth/me', forged);

    expect(me.status).toBe(200);
    expect(me.body.data.authSource).toBe('legacy-headers');
  });

  it('cannot override a valid token when the bridge is on', async () => {
    const { base } = await boot({ allowLegacyHeaderAuth: true });
    const login = await post(base, '/api/kernel/auth/login', { username: 'teacher', password: 'secret' });

    const me = await get(base, '/api/kernel/auth/me', {
      authorization: `Bearer ${login.body.data.token}`,
      ...forged,
    });

    // Bearer wins; the header cannot escalate the authenticated role.
    expect(me.body.data.actor.role).toBe('teacher');
    expect(me.body.data.authSource).toBe('bearer');
  });

  it('a forged header cannot resurrect a revoked session', async () => {
    const { base, kernel } = await boot({ allowLegacyHeaderAuth: true });
    const { token } = kernel.sessions.issue({ userId: 9, role: 'student', ttlMs: 60_000 });
    kernel.sessions.revoke(token);

    const me = await get(base, '/api/kernel/auth/me', { authorization: `Bearer ${token}`, ...forged });
    expect(me.status).toBe(401);
  });
});
