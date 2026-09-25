/**
 * The composed application, exercised over real HTTP for every route.
 *
 * ## The gap this closes
 *
 * Before this file, two suites covered the surface between them and neither covered the contracts:
 * `tests/**` booted real kernels but only touched the routes a given suite was about, and
 * `src/**` ran the real page code against MSW handlers that answer **200 for everything**. So a
 * route could require a role the page did not have, answer a status the client did not expect, or
 * answer a shape the page did not read, and the suite stayed green at 133 files / 1128 tests.
 *
 * It is measured, not hypothetical. Three defects that shipped and were reproduced live:
 *
 *   - `POST /api/pet/students/:id/actions` refused **every** student with 403「当前账号未绑定学生」,
 *     because `Actor.studentId` was never populated by the request context;
 *   - the student area bounced every feature page back to `/student/pet`, because the class feature
 *     flags were read as "all off" while they were still loading;
 *   - `GET /api/family-tasks` and `GET /api/danmaku` answered **500** for a missing row, which a
 *     page renders as a generic failure rather than "not found".
 *
 * ## What it asserts
 *
 *   1. **Every endpoint in the frozen snapshot** refuses an anonymous caller, except the ones that
 *      are anonymous by design - each with its reason in `scripts/security/route-authorization-audit.mjs`,
 *      so the exemption list is reviewable rather than implied.
 *   2. **No endpoint answers 500**, for any role. A 500 is never a contract: it means the handler
 *      threw somewhere it should have answered 401/403/404/400.
 *   3. **The endpoints the frontend actually calls** answer a shape it can read, as each role - so a
 *      contract drift is a failing test rather than a silently empty page.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import publicRoutes from '../publicRoutes.json';
import {
  ROOT_DIR,
  STUDENTS,
  STUDENT_PASSWORD,
  bootAndSeed,
  call,
  frontendEndpoints,
  mapLimit,
  type Seeded,
} from '../harness.js';

/**
 * The routes that are anonymous on purpose, each with its reason.
 *
 * Shared with the inventory script rather than restated here, so the exemption a reviewer reads is
 * the exemption this suite asserts.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = publicRoutes.publicByDesign;

/** The frozen endpoint list: the same snapshot the API-surface guardrail compares against. */
function snapshotEndpoints(): string[] {
  const file = path.join(ROOT_DIR, 'tests', 'guardrails', 'snapshots', 'api-surface.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).endpoints as string[];
}

/**
 * Known 5xx answers, with the reason each one is preserved.
 *
 * These are **not** accepted as correct: a 500 is never a contract. They are recorded upstream
 * behaviours that changing would be an unrequested behaviour change in this round - HANDOFF §11
 * says a defect found during a migration is recorded, not silently fixed - so both 5xx assertions
 * below consult this one list instead of either ignoring 5xx wholesale (which would hide new ones)
 * or failing on a behaviour nobody asked the suite to change.
 *
 * Each entry should shrink this literal, not grow it.
 */
const KNOWN_5XX: Record<string, string> = {
  'GET /api/family-tasks':
    'engagement.controllers.ts: a class-feature refusal is an ApiError, and the legacy catch clause ' +
    'only rethrows HttpException, so a switched-off feature answers 500 该功能当前已关闭 instead of 403. ' +
    'Recorded in plugins/engagement/plugin.json as known debt, with the pre-migration behaviour verified.',
};

/**
 * A body for the verbs that need one.
 *
 * Deliberately minimal and *invalid* for most routes: the probes are about authorization, so the
 * interesting outcome is 401/403. Any route that gets as far as validating this body answers 400,
 * which is a pass - and if one answered 500 instead, that is the failure being looked for.
 */
function probeBody(method: string): unknown {
  return method === 'GET' || method === 'DELETE' ? undefined : {};
}

/**
 * Endpoints that must **not** be probed with a shared role token.
 *
 * `reset` and `import` replace or drop the whole database. Probing them as staff wipes the fixture
 * mid-run - which is exactly what happened the first time this suite ran: the reset dropped every
 * table, and the next request died with `no such table: sessions` from inside the request-context
 * middleware.
 *
 * `logout` is here rather than "the probe revokes the token it is given": probing it once per role
 * signed every seeded session out and turned the whole role matrix into 401s - the second
 * self-inflicted failure. It gets its own test below, which is a stronger assertion than a status
 * check anyway: it proves the session is actually dead afterwards.
 *
 * All three are still covered by the anonymous probe, which is the assertion that matters for them:
 * an anonymous caller must not reach them at all.
 */
const SKIP_CREDENTIALED = new Set([
  'POST /api/admin/system/database/reset',
  'POST /api/admin/system/database/import',
  'POST /api/kernel/auth/logout',
]);

let seeded: Seeded;
let endpoints: string[];

beforeAll(async () => {
  seeded = await bootAndSeed();
  endpoints = snapshotEndpoints();
}, 240_000);

afterAll(async () => {
  await seeded?.close();
});

describe('the whole HTTP surface', () => {
  it('has the endpoint list the guardrail snapshot records', () => {
    // If this fails, the snapshot changed and the coverage assertions below are measuring a
    // different surface than the suite believes.
    //
    // 304 -> 320 in the homework round: the sixteen `/api/homework` routes. 320 -> 321 in the AI
    // round: `POST /api/admin/system/ai/test`, the console's connection test, which reaches the
    // model through the `homework.public` port. 321 -> 322: `POST /api/homework/ai/questions`, AI
    // 出题, the only homework route with no `:id`. 322 -> 328 in the AI 智学 round: the six
    // `/api/ai-study` routes (four student, two teacher). The number moves with
    // `npm run api:surface:update`, and it is asserted here as well as in the guardrail so the two
    // cannot drift - this one would otherwise keep probing a surface the snapshot no longer describes.
    expect(endpoints.length).toBe(328);
  });

  it('never answers an anonymous caller with data', async () => {
    const probed = endpoints.filter((endpoint) => PUBLIC_BY_DESIGN[endpoint] === undefined);

    const results = await mapLimit(probed, 6, async (endpoint) => {
      const [method, ...rest] = endpoint.split(' ');
      const pathname = rest.join(' ');
      const response = await call(seeded.base, method, pathname, { body: probeBody(method) });
      return { endpoint, response };
    });

    /**
     * The property asserted is "no data", not "exactly 401".
     *
     * A `2xx` is the failure: the route ran and returned a body to an unauthenticated caller.
     * `401`/`403` is the intended refusal, and `404` is a parameterised route answering "no such
     * row", which leaks nothing either. `400` is the one worth naming: a route that validates
     * before it authenticates answers "class name is required" to a stranger, which reveals the
     * route's shape without revealing data.
     *
     * That ordering is deliberately **not** changed here. Fourteen classroom/pet write routes and
     * the two `POST /api/classes[/class]` routes return 400 before their gate, and the matrix rules
     * the resulting ordering separately; flipping it would change the wire behaviour of routes this
     * round is not about. What the suite does pin is the part that is a security boundary.
     */
    const leaks = results
      .filter(({ response }) => response.status < 400)
      .map(({ endpoint, response }) => `${endpoint} -> ${response.status} ${response.text.slice(0, 120)}`);

    expect(
      leaks,
      `These endpoints answered an anonymous caller with a success status:\n${leaks.join('\n')}`,
    ).toEqual([]);
  });

  it('serves every route that is public by design to an anonymous caller', async () => {
    // The other direction: an exemption list that is never checked would rot into "routes we
    // forgot", so each one is asserted to be reachable without a session.
    const probes = Object.keys(PUBLIC_BY_DESIGN).filter((endpoint) => endpoints.includes(endpoint));

    const results = await mapLimit(probes, 6, async (endpoint) => {
      const [method, ...rest] = endpoint.split(' ');
      const pathname = rest.join(' ');
      // Placeholder ids in a public path (`/api/website/articles/:id`) are fine: a 404 is still
      // proof the route resolved without a session, which is the claim.
      const response = await call(seeded.base, method, pathname, { body: probeBody(method) });
      return { endpoint, response };
    });

    const blocked = results
      .filter(({ response }) => response.status > 404)
      .map(({ endpoint, response }) => `${endpoint} -> ${response.status} ${response.text.slice(0, 120)}`);

    expect(blocked, `Public routes were not reachable anonymously:\n${blocked.join('\n')}`).toEqual([]);
  });

  it('never answers 500, for any role, on any route', async () => {
    const roles = Object.keys(seeded.tokens) as Array<keyof Seeded['tokens']>;
    const probes = roles.flatMap((role) =>
      endpoints
        .filter((endpoint) => !SKIP_CREDENTIALED.has(endpoint))
        .map((endpoint) => ({ role, endpoint })),
    );

    const results = await mapLimit(probes, 6, async ({ role, endpoint }) => {
      const [method, ...rest] = endpoint.split(' ');
      const pathname = rest.join(' ');
      const response = await call(seeded.base, method, pathname, {
        token: seeded.tokens[role],
        body: probeBody(method),
      });
      return { role, endpoint, response };
    });

    // A 500 is never a contract. It means a handler threw where it should have answered
    // 400/401/403/404 - the class of bug that made two routes look like broken pages.
    const failures = results
      .filter(({ response }) => response.status >= 500)
      .map(({ role, endpoint, response }) => `${role} ${endpoint} -> ${response.status} ${response.text.slice(0, 160)}`);

    const unexpected = failures.filter((failure) => {
      const endpoint = failure.split(' ').slice(1, 3).join(' ');
      return KNOWN_5XX[endpoint] === undefined;
    });

    expect(
      unexpected,
      `Routes answered 5xx without a recorded reason:\n${unexpected.join('\n')}\n\n` +
        `Recorded 5xx (each should shrink this list, not grow it):\n` +
        Object.entries(KNOWN_5XX)
          .map(([endpoint, reason]) => `  ${endpoint}: ${reason}`)
          .join('\n'),
    ).toEqual([]);
  });
});

describe('the endpoints the frontend actually calls', () => {
  it('answers each of them as the role that page runs as', async () => {
    const endpointsCalled = frontendEndpoints();
    // A sanity floor: if the extractor stops finding call sites, the loop below would pass
    // vacuously - the same failure mode the rest of this file exists to avoid.
    expect(endpointsCalled.length).toBeGreaterThan(60);

    const failures: string[] = [];
    for (const role of ['teacher', 'student', 'parent', 'superadmin'] as const) {
      for (const pathname of endpointsCalled) {
        if (KNOWN_5XX[`GET ${pathname}`] !== undefined) continue;
        // Parameterised paths are probed with id 1, which exists for the seeded class and is
        // absent for students - either way the answer must be a status, not an exception.
        const response = await call(seeded.base, 'GET', pathname, { token: seeded.tokens[role] });
        if (response.status >= 500) {
          failures.push(`${role} GET ${pathname} -> ${response.status} ${response.text.slice(0, 160)}`);
        }
      }
    }

    expect(failures, `Frontend endpoints answered 5xx:\n${failures.join('\n')}`).toEqual([]);
  });
});

describe('the actor scope the kernel resolves', () => {
  it('lets a student see their own pet dashboard and refuses another student"s', async () => {
    const own = await call(seeded.base, 'GET', `/api/pet/students/${seeded.studentIds[0]}/dashboard`, {
      token: seeded.tokens.student,
    });
    const other = await call(seeded.base, 'GET', `/api/pet/students/${seeded.studentIds[1]}/dashboard`, {
      token: seeded.tokens.student,
    });

    // `studentId` in the path is the `students` row, and the actor's own scope comes from the
    // kernel's resolver. Before that resolver existed this route had no way to tell them apart.
    expect(other.status).toBe(403);
    expect(own.status).not.toBe(500);
  });

  it('lets a teacher read the class roster and their own class" pet board', async () => {
    const roster = await call(seeded.base, 'GET', `/api/students?classId=${seeded.classId}`, {
      token: seeded.tokens.teacher,
    });
    expect(roster.status).toBe(200);
    expect(roster.body.students.length).toBe(3);

    const board = await call(seeded.base, 'GET', `/api/pet/classes/${seeded.classId}`, {
      token: seeded.tokens.teacher,
    });
    expect(board.status).toBe(200);
  });

  it('lets a parent read their own child and not another family"s', async () => {
    const own = await call(seeded.base, 'GET', `/api/students/${seeded.studentIds[0]}`, {
      token: seeded.tokens.parent,
    });
    const other = await call(seeded.base, 'GET', `/api/students/${seeded.studentIds[1]}`, {
      token: seeded.tokens.parent,
    });

    expect(own.status).toBe(200);
    expect(other.status).toBe(403);
  });

  it('refuses a student the teacher-only writes', async () => {
    const response = await call(seeded.base, 'POST', '/api/students/batch-points', {
      token: seeded.tokens.student,
      body: { studentIds: seeded.studentIds, amount: 10, reason: 'e2e' },
    });
    expect(response.status).toBe(403);
  });
});

describe('logout actually ends the session', () => {
  it('revokes the token, so the same token is refused afterwards', async () => {
    // Its own session rather than one of the seeded role tokens: logging out is the assertion, so
    // it must not sign out the fixtures the rest of the file uses.
    const login = await call(seeded.base, 'POST', '/api/auth/login', {
      body: { username: STUDENTS[0].username, password: STUDENT_PASSWORD, role: 'student' },
    });
    const token: string | undefined = login.body?.token;
    expect(typeof token, `student login body: ${login.text}`).toBe('string');

    // The student's own id, taken from the login payload rather than from the seed: the path
    // parameter is the `students` row while the session carries the `users` row, and asking about
    // the seed's *first* student only works if they are the same account - which they are here, but
    // relying on it would make this test depend on the seed's ordering rather than on the platform.
    const ownStudentId: number = login.body.user.studentId;
    expect(Number.isInteger(ownStudentId), `login carried no studentId: ${login.text}`).toBe(true);
    // And that id really is the one the scope resolver produced, not the login row.
    expect(ownStudentId).toBe(seeded.studentIds[0]);

    const probePath = `/api/pet/students/${ownStudentId}/dashboard`;
    const before = await call(seeded.base, 'GET', probePath, { token });
    // The login payload's `studentId` and the actor scope the kernel resolves must agree: they come
    // from different places (the identity plugin resolves the payload, the host's `scopeResolver`
    // fills the actor) and a route reads the second. Asserting both here is what makes a mismatch
    // legible instead of showing up as an unrelated 403.
    expect(before.status, `before logout: ${before.text}`).toBe(200);

    const loggedOut = await call(seeded.base, 'POST', '/api/kernel/auth/logout', { token });
    expect(loggedOut.status).toBe(200);

    const after = await call(seeded.base, 'GET', probePath, { token });
    // The local sign-out was always instant; this is the server-side half, which did not exist
    // until `revokeSession()` was added, so a copied token kept working for the session's full TTL.
    expect(after.status).toBe(401);
  });
});
