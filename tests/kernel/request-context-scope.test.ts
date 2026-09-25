/**
 * The request context's actor, and the scope the host resolves onto it.
 *
 * Two properties are load-bearing and neither was true before this test existed:
 *
 *   1. a verified session carries only `userId` + `role` (`sessions.verify`), so `studentId` and
 *      `classId` can only arrive through the host-supplied `resolveScope` hook. Every plugin that
 *      gates on "is this the caller's own student row" depends on it - `plugins/pet` refused all
 *      students with「当前账号未绑定学生」while it was missing.
 *   2. when that hook *fails*, the request keeps the actor the session store verified. Failing
 *      open on identity ("now you are anonymous") would turn a plugin fault into a wave of 401s,
 *      and rethrowing would turn it into a 500; both are worse than "known user, unknown scope".
 */

import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { Actor } from '@thinkclass/contracts';
import {
  createRequestContextMiddleware,
  type ScopeResolver,
} from '../../packages/kernel/src/http/requestContext.js';
import type { KernelConfig } from '../../packages/kernel/src/config/loadConfig.js';
import type { SessionService } from '../../packages/kernel/src/auth/session.js';

const TOKEN = 'session-token';

/** Just enough of the config for the middleware: legacy header auth stays off. */
const config = { allowLegacyHeaderAuth: false } as KernelConfig;

function fakeSessions(actor: Actor | null): SessionService {
  return { verify: vi.fn().mockReturnValue(actor) } as unknown as SessionService;
}

function fakeRequest(headers: Record<string, string> = {}): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    originalUrl: '/api/pet/students/1/adopt',
  } as unknown as Request;
}

function run(
  options: { actor: Actor | null; resolveScope?: ScopeResolver; logger?: { warn: ReturnType<typeof vi.fn> } },
  headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` },
) {
  const req = fakeRequest(headers);
  const res = { setHeader: vi.fn() } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  const middleware = createRequestContextMiddleware({
    config,
    sessions: fakeSessions(options.actor),
    logger: options.logger as never,
    resolveScope: options.resolveScope,
  });

  return middleware(req, res, next).then(() => req as Request & { context?: { actor: Actor | null } });
}

describe('request context: scope resolution', () => {
  it('leaves the actor as the session store returned it when no resolver is supplied', async () => {
    const req = await run({ actor: { userId: 3, role: 'student' } });

    expect(req.context?.actor).toEqual({ userId: 3, role: 'student' });
  });

  it('replaces the actor with the resolved one, so the scope reaches every route', async () => {
    const resolveScope: ScopeResolver = vi.fn().mockResolvedValue({
      userId: 3,
      role: 'student',
      studentId: 42,
      classId: 7,
    });

    const req = await run({ actor: { userId: 3, role: 'student' }, resolveScope });

    expect(resolveScope).toHaveBeenCalledWith(expect.anything(), { userId: 3, role: 'student' });
    expect(req.context?.actor).toEqual({ userId: 3, role: 'student', studentId: 42, classId: 7 });
  });

  it('keeps the unscoped actor and warns when resolution throws', async () => {
    const logger = { warn: vi.fn() };
    const resolveScope: ScopeResolver = vi.fn().mockRejectedValue(new Error('classroom.public unavailable'));

    const req = await run({ actor: { userId: 3, role: 'student' }, resolveScope, logger });

    // Identity survives; only the scope is missing. A 401 here would be a lie about the caller.
    expect(req.context?.actor).toEqual({ userId: 3, role: 'student' });
    expect(logger.warn).toHaveBeenCalledWith(
      'actor scope resolution failed; serving the unscoped actor',
      expect.objectContaining({ role: 'student', error: 'classroom.public unavailable' }),
    );
  });

  it('honours a resolver that declines to extend the actor', async () => {
    const resolveScope: ScopeResolver = vi.fn().mockResolvedValue(null);

    const req = await run({ actor: { userId: 9, role: 'teacher' }, resolveScope });

    expect(resolveScope).toHaveBeenCalled();
    expect(req.context?.actor).toEqual({ userId: 9, role: 'teacher' });
  });

  it('never resolves a scope for an anonymous request', async () => {
    const resolveScope: ScopeResolver = vi.fn();

    const req = await run({ actor: null, resolveScope }, {});

    expect(resolveScope).not.toHaveBeenCalled();
    expect(req.context?.actor).toBeNull();
    expect(req.context?.authSource ?? 'none').toBe('none');
  });
});
