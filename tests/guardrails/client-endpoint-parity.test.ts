/**
 * G22 - the client and the HTTP surface must agree, in both directions.
 *
 * The web client and the mini program are two hand-written call surfaces against one HTTP API
 * (`tests/guardrails/snapshots/api-surface.json`, refreshed by `npm run api:surface:update`).
 *
 * Direction one: a call to a path nobody serves is invisible until the page is opened - it fails as a
 * 404 rendered as "网络请求错误", the page shows its empty state, and nothing in CI notices.
 *
 * Direction two: an endpoint with no client is the mirror image, and it is how a feature disappears
 * without anybody deleting it. `GET /api/system/questions` had no UI in any console, so the challenge
 * had no questions to serve; `POST /api/payment/create` had no order page; `GET
 * /api/exams/student-exams` was the marks a teacher recorded that no pupil could read; `POST
 * /api/class-announcements` was a notice board nobody could write to. Each was found by hand before
 * this check existed; now the inventory of unreachable endpoints can only shrink (`UNREACHABLE_ALLOWANCE`).
 *
 * Known limits, stated so a green run is not over-read: the extractor works on string literals, so
 * (a) a client function that exists but is never *called* still counts as coverage, and (b) an
 * `UNKNOWN` method covers every method on its path (see `methodNear`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOT } from './lib/paths.mjs';

const SNAPSHOT = 'tests/guardrails/snapshots/api-surface.json';

const CLIENT_ROOTS = [
  { dir: 'src', extensions: ['.ts', '.tsx'] },
  { dir: 'miniprogram', extensions: ['.ts'] },
];

const SKIP = [/\.test\.tsx?$/, /\.spec\.tsx?$/, /[\\/]__tests__[\\/]/, /[\\/]mocks[\\/]/, /[\\/]typings[\\/]/];

/** `:studentId` and `${studentId}` are the same placeholder for this comparison. */
function normalise(rawPath: string): string {
  const withoutQuery = rawPath.split('?')[0];
  const withoutTemplate = withoutQuery.replace(/\$\{[^}]*\}/g, ':x');
  return withoutTemplate.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':x').replace(/\/$/, '');
}

function walk(dir: string, extensions: string[], out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(abs, extensions, out);
    } else if (extensions.includes(path.extname(entry.name)) && !SKIP.some((pattern) => pattern.test(abs))) {
      out.push(abs);
    }
  }
  return out;
}

interface CallSite {
  file: string;
  line: number;
  raw: string;
  /** Every path this literal could resolve to: the whole thing, and the part before a suffix. */
  candidates: string[];
  /** The HTTP method the call site names, or `UNKNOWN` when the line does not say. */
  method: string;
}

/**
 * The method a call site uses, read from the source around the path.
 *
 * Without this the check compares paths alone - and since `DELETE /api/openapi/schools/:id` and
 * `PUT /api/openapi/schools/:id` normalise to the same string, a route could sit there with no caller
 * and still look covered because a *different* method on it was called. That is not hypothetical: it
 * is how `PUT /api/openapi/schools/:id` stayed invisible while the console could create and delete
 * schools but not edit one.
 *
 * The window is seven lines, not one, because the codebase formats calls both ways:
 *
 *     apiPost<{...}>('/api/students/batch-import', body)      // same line
 *     apiPost<{...}>(
 *       '/api/students/batch-import',                          // three lines down
 *       body,
 *     )
 *
 * Reading only the path's own line would call the second shape UNKNOWN at best and orphaned at
 * worst - a false orphan would demand an allowance entry for a route that is plainly reachable. An
 * unrecognised window yields `UNKNOWN`, which covers every method on that path: the check errs
 * towards "covered" on purpose.
 */
function methodOf(window: string): string {
  const named = /\bapi(Get|Post|Put|Patch|Delete)\b/.exec(window);
  if (named) return named[1].toUpperCase();

  const explicit = /\bmethod:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i.exec(window);
  if (explicit) return explicit[1].toUpperCase();

  // The service-layer sugar (`get<T>(`, `post(`, `put(`, `del(`).
  const sugar = /\b(get|post|put|patch|del|delete)\s*[<(]/.exec(window);
  if (sugar) {
    const verb = sugar[1].toLowerCase();
    return verb === 'del' || verb === 'delete' ? 'DELETE' : verb.toUpperCase();
  }

  return 'UNKNOWN';
}

/**
 * The method of the call the path belongs to: nearest line first, then outwards.
 *
 * A flat window is not enough - a file that lists `apiGet`, `apiPost` and `apiPut` one after another
 * would attribute the first of them to all three paths (`apiPut(\`/api/leaves/${id}\`)` inherited the
 * `apiPost` three lines above and was reported as an endpoint nobody calls). Ordering by distance
 * fixes that while still reaching a multi-line call's opener, which sits *above* its path.
 */
function methodNear(lines: string[], index: number): string {
  for (const delta of [0, -1, 1, -2, 2, -3, 3]) {
    const line = lines[index + delta];
    if (line === undefined) continue;
    const method = methodOf(line);
    if (method !== 'UNKNOWN') return method;
  }
  return 'UNKNOWN';
}

/** Every `/api/...` string literal in the two client trees, with the method its call names. */
function clientCalls(): CallSite[] {
  const calls: CallSite[] = [];
  for (const { dir, extensions } of CLIENT_ROOTS) {
    for (const file of walk(path.join(ROOT, dir), extensions)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((text, index) => {
        for (const match of text.matchAll(/['"`](\/api\/[^'"`]*)['"`]/g)) {
          calls.push({
            file: path.relative(ROOT, file).replace(/\\/g, '/'),
            line: index + 1,
            raw: match[1],
            candidates: candidatesFor(match[1]),
            method: methodNear(lines, index),
          });
        }
      });
    }
  }
  return calls;
}

/**
 * The paths a literal can become at runtime.
 *
 * Two shapes cover the whole client:
 *   - a plain path (`/api/pet/students/${id}`) - every interpolation is a path segment;
 *   - a path with a *query* suffix built by interpolation (`/api/attendance${suffix}`,
 *     `/api/classes/${id}/features${query}`), where the interpolation is not a segment at all.
 *
 * The second shape normalises to nonsense (`/api/attendance:x`), so a second candidate is built by
 * replacing only the interpolations that follow a `/` and stopping at the first one that does not.
 */
function candidatesFor(raw: string): string[] {
  const candidates = [normalise(raw)];

  let out = '';
  let index = 0;
  while (index < raw.length) {
    const next = raw.indexOf('${', index);
    if (next === -1) {
      out += raw.slice(index);
      break;
    }
    out += raw.slice(index, next);
    if (next === 0 || raw[next - 1] !== '/') {
      // A query string starts here: everything after it is not part of the path.
      break;
    }
    const close = raw.indexOf('}', next);
    out += ':x';
    index = close === -1 ? raw.length : close + 1;
  }
  candidates.push(normalise(out));

  return [...new Set(candidates)];
}

const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, SNAPSHOT), 'utf8')) as { endpoints: string[] };
const served = new Set(snapshot.endpoints.map((endpoint) => normalise(endpoint.split(' ', 2)[1])));

/**
 * The endpoints no client calls, as of the closure round - a frozen inventory, not a target.
 *
 * The list is deliberately not "these are fine": it is the set that existed when the check was
 * written, and the ratchet is that it may only **shrink**. A new route with no caller fails here the
 * moment it lands, which is the failure mode this round kept finding by hand: `/api/system/questions`
 * (four routes, no UI anywhere, so the challenge had no questions), `POST /api/payment/create` (no
 * order page), `GET /api/exams/student-exams` (grades the teacher recorded that no pupil could read).
 *
 * Path parameters are normalised to `:x` (`normalise()` collapses every `:name`), so the entries read
 * as `DELETE /api/assignments/:x` rather than `:id`.
 *
 * Most entries are *supposed* to have no caller and are listed here rather than asserted away:
 *
 *  - the plugin-declared legacy alias families (`/api/class/*`, `/api/pets/*`, `/api/economy/*`
 *    `/api/dungeon/*`, the `/api/battles/teacher/*` set, `/api/gacha/*`, ...): the same handlers
 *    under their old paths, kept on purpose and documented in each plugin's header;
 *  - the kernel's probes and diagnostics (`/api/health`, `/api/pet/health`, `/api/kernel/*`);
 *  - the payment channel's webhook (`POST /api/payment/notify`), which a browser never calls;
 *  - `POST /api/economy/bank/interest` and `/trigger-interest`, the settlement paths a scheduler
 *    calls rather than a page;
 *  - `GET /api/system/backup/export`, `/api/system/logs`, `/api/system/settings`, which the admin
 *    console reads through `/api/admin/*` instead (the two families answer the same settings).
 *
 * Removing an entry is progress (a UI appeared, or the route was deleted); adding one is the defect.
 */
const UNREACHABLE_ALLOWANCE = [
  'DELETE /api/assignments/:x',
  'DELETE /api/challenge/boss/:x',
  'DELETE /api/praises/:x',
  'GET /api/assignments',
  'GET /api/assignments/student-assignments',
  'GET /api/battles/stats/:x',
  'GET /api/battles/teacher/:x',
  'GET /api/challenge/boss',
  'GET /api/challenge/boss/active/:x',
  'GET /api/challenge/questions',
  'GET /api/class',
  'GET /api/class/:x',
  'GET /api/class/:x/bigscreen',
  'GET /api/class/:x/features',
  'GET /api/class/:x/guild-ranking',
  'GET /api/class/:x/incentive-policy',
  'GET /api/class/:x/team-ranking',
  'GET /api/class/invite/:x',
  'GET /api/dungeon/:x',
  'GET /api/economy/bank/:x',
  'GET /api/economy/portfolio/:x',
  'GET /api/economy/stocks/:x',
  'GET /api/gacha/collection/:x',
  'GET /api/gacha/dictionary',
  'GET /api/gacha/pools/:x',
  'GET /api/health',
  'GET /api/kernel/auth/me',
  'GET /api/kernel/info',
  'GET /api/kernel/permissions',
  'GET /api/kernel/plugins',
  'GET /api/pet/health',
  'GET /api/peer-reviews',
  'GET /api/pets/admin/class/:x',
  'GET /api/pets/classmates/:x',
  'GET /api/pets/leaderboard/:x',
  'GET /api/praises',
  'GET /api/slg/map/:x',
  'GET /api/students/progress-star',
  'GET /api/system/backup/export',
  'GET /api/system/logs',
  'GET /api/system/settings',
  'GET /api/team-quests/progress',
  'POST /api/assignments',
  'POST /api/battles/teacher/initiate',
  'POST /api/challenge/boss',
  'POST /api/challenge/boss/:x/attack',
  'POST /api/challenge/submit',
  'POST /api/class',
  'POST /api/dungeon/abandon/:x',
  'POST /api/dungeon/choice/:x',
  'POST /api/dungeon/start/:x',
  'POST /api/economy/bank/deposit/:x',
  'POST /api/economy/bank/interest',
  'POST /api/economy/bank/trigger-interest',
  'POST /api/economy/bank/withdraw/:x',
  'POST /api/economy/stocks/buy/:x',
  'POST /api/economy/stocks/sell/:x',
  'POST /api/gacha/dictionary',
  'POST /api/gacha/draw/:x',
  'POST /api/groups/assign',
  'POST /api/kernel/auth/login',
  'POST /api/payment/notify',
  'POST /api/pet/students/:x/action',
  'POST /api/pet/students/:x/adopt',
  'POST /api/pets/adopt',
  'POST /api/pets/battle',
  'POST /api/pets/interact',
  'POST /api/slg/student/:x/contribute/:x',
  'POST /api/slg/teacher',
  'POST /api/slg/teacher/yield/:x',
  'POST /api/system/settings',
  'PUT /api/assignments/:x',
  'PUT /api/assignments/student-assignments/:x',
  'PUT /api/battles/teacher/accept/:x',
  'PUT /api/battles/teacher/end/:x',
  'PUT /api/battles/teacher/reject/:x',
  'PUT /api/class/:x/features',
  'PUT /api/class/:x/incentive-policy',
  'PUT /api/class/:x/settings',
  'PUT /api/classes/:x/settings',
  'PUT /api/exams/student-exams/:x',
  'PUT /api/gacha/active/:x/:x',
  'PUT /api/pets/:x',
  'PUT /api/students/:x/birthday',
].sort();

describe('G22: client calls resolve to served endpoints', () => {
  it('has a snapshot to compare against', () => {
    expect(snapshot.endpoints.length).toBeGreaterThan(0);
  });

  it('never calls a path the API does not serve', () => {
    const missing = clientCalls()
      .filter((call) => !call.candidates.some((candidate) => served.has(candidate)))
      .map((call) => `${call.file}:${call.line} calls ${call.raw}`);

    expect(missing, `client calls with no matching endpoint:\n${missing.join('\n')}`).toEqual([]);
  });

  it('names the endpoints it covers, so a green run means something', () => {
    const endpointsTouched = new Set(
      clientCalls()
        .flatMap((call) => call.candidates)
        .filter((candidate) => served.has(candidate)),
    );
    // A crude floor with a wide margin: it exists to catch "the extractor silently stopped matching"
    // (a refactor of the client, a changed quote style), not to measure coverage.
    expect(endpointsTouched.size).toBeGreaterThan(120);
  });
});

/**
 * G22, the other direction: no *new* endpoint may appear without a client.
 *
 * The check above catches a client calling something the server does not serve. This one catches the
 * mirror image - the shape this round kept finding by hand: a route that exists, is authorized, is
 * tested, and that nobody can reach. `GET /api/system/questions` had no UI in any console for four
 * versions, which is why the challenge page had no questions to show.
 *
 * It is a ratchet rather than an assertion of zero: most of the allowance is deliberately unreachable
 * (legacy alias families, kernel probes, the payment webhook). The list may shrink - removing an
 * entry is progress - and any addition is the defect.
 */
describe('G22: no new endpoint without a client', () => {
  /**
   * Which snapshot endpoints have no caller, as `METHOD /path`.
   *
   * A call site covers an endpoint when its path matches **and** either it named the same method or
   * it named none at all (see `methodOf`). The second half is what keeps the check honest rather
   * than pedantic: a `wx.request` whose method lives on another line is not evidence of absence.
   */
  function orphanedEndpoints(): string[] {
    const calls = clientCalls();
    const pathsCalled = new Set(calls.flatMap((call) => call.candidates));
    const methodCalled = new Set(
      calls
        .filter((call) => call.method !== 'UNKNOWN')
        .flatMap((call) => call.candidates.map((candidate) => `${call.method} ${candidate}`)),
    );

    return snapshot.endpoints
      .map((endpoint) => {
        const [method, rawPath] = endpoint.split(' ', 2);
        return `${method.toUpperCase()} ${normalise(rawPath)}`;
      })
      .filter((endpoint) => {
        const [method, endpointPath] = endpoint.split(' ', 2);
        if (!pathsCalled.has(endpointPath)) return true;
        return !methodCalled.has(`${method} ${endpointPath}`);
      })
      .sort();
  }

  it('adds no endpoint beyond the frozen inventory', () => {
    const orphans = orphanedEndpoints();
    const allowance = new Set(UNREACHABLE_ALLOWANCE);
    const unlisted = orphans.filter((endpoint) => !allowance.has(endpoint));

    expect(
      unlisted,
      `endpoints with no client caller that are not in the inventory:\n${unlisted.join('\n')}\n\n` +
        'Either wire it to a screen, or delete the route, or add it to UNREACHABLE_ALLOWANCE with a ' +
        'comment saying why it can never have a caller.',
    ).toEqual([]);
  });

  it('keeps the inventory honest: entries that gained a caller are removed from it', () => {
    const orphans = new Set(orphanedEndpoints());
    const stale = UNREACHABLE_ALLOWANCE.filter((endpoint) => !orphans.has(endpoint));

    expect(
      stale,
      `these are now reachable (or gone), so they must leave the inventory:\n${stale.join('\n')}`,
    ).toEqual([]);
  });
});
