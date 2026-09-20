/**
 * `window.__TC_CONFIG__` must actually reach the browser, in the composition that ships.
 *
 * This is a static guard, and the reason it is static is worth writing down, because the bug it
 * pins is invisible to every other kind of test in this repository.
 *
 * `src/constants.ts` reads `window.__TC_CONFIG__` so that the admin path is a per-deployment
 * setting instead of a build-time constant, and P5.3a is recorded as having made that work. It
 * works in the *kernel* composition: `createKernel()` serves `index.html` itself and replaces the
 * `<!--__TC_CONFIG__-->` marker with a script tag.
 *
 * But a deployment runs the *legacy* composition, and its SPA fallback in `api/app.ts` answered
 * `res.sendFile(dist/index.html)` - shipping the file byte-for-byte, marker and all. So
 * `window.__TC_CONFIG__` was undefined in every real deployment, `runtimeConfig()` returned `{}`,
 * and both `adminPath()` and `pluginRuntimeEnabled()` fell back to their build-time values.
 *
 * Why nothing caught it:
 *
 *   - The frontend tests run under jsdom without a server, and `src/constants.ts` documents the
 *     fallback as intentional ("a static preview, or the test environment"), so `runtimeConfig()`
 *     returning `{}` is a *passing* case everywhere.
 *   - `tests/plugins/legacy-boot-probe.test.ts` boots the real server and asserts business routes,
 *     logins and permissions - it never asks who served `/` or what was in it.
 *   - A live `GET /` against the legacy composition returns HTTP 200 with a valid page. The only
 *     symptom is that a *different* deployment config would be ignored, which is unobservable from
 *     a single instance.
 *
 * A real-endpoint test would be better than a source assertion, but the legacy composition resolves
 * its static directory to `path.join(__dirname, '../dist')` at call time and is not parameterisable
 * - `createApp()` runs at import. So the choice was a source guard or nothing, and the failure mode
 * here is a *missing statement* in one function, which a source guard expresses exactly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/** The body of `registerStaticAssets`, from its signature to the closing brace at column 0. */
function registerStaticAssetsBody(source: string): string {
  const start = source.indexOf('function registerStaticAssets');
  expect(start, 'api/app.ts no longer declares registerStaticAssets - update this guard').toBeGreaterThan(-1);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, i + 1);
    }
  }
  throw new Error('unterminated registerStaticAssets');
}

describe('the served index.html carries the runtime config', () => {
  const app = read('api/app.ts');
  const body = registerStaticAssetsBody(app);

  it('replaces the marker in the legacy composition as well as the kernel one', () => {
    // The whole defect: this statement was absent, so the marker shipped as a literal comment.
    expect(body).toContain('__TC_CONFIG__');
    expect(body).toMatch(/\.replace\(/);
  });

  it('injects the four fields the frontend reads', () => {
    // `src/constants.ts` reads exactly these; a renamed or dropped field silently degrades to the
    // build-time fallback, which is the same failure with a different cause.
    for (const field of ['adminPath', 'apiBase', 'pluginRuntime', 'env']) {
      expect(body, `the injected payload no longer provides ${field}`).toContain(field);
    }
  });

  it('sends the rewritten HTML rather than the file verbatim', () => {
    // `res.sendFile` is the specific call that bypassed the replacement. It may legitimately appear
    // elsewhere in the file, but not as this handler's answer.
    expect(body).not.toMatch(/res\.sendFile\(/);
  });

  it('keeps index:false on the static middleware, or the handler never runs', () => {
    // With the default `express.static` settings the middleware answers `/` from index.html
    // itself, so the handler below never executes and the marker survives. The kernel's copy
    // documents the same trap; this asserts both copies still avoid it.
    expect(body).toMatch(/express\.static\(distPath,\s*\{\s*index:\s*false\s*\}\)/);

    const kernel = read('packages/kernel/src/bootstrap/createKernel.ts');
    expect(kernel).toMatch(/express\.static\(config\.staticDir,\s*\{\s*index:\s*false\s*\}\)/);
  });

  it('still passes /api through to the Nest handlers', () => {
    // Guarding the injection must not swallow the API routes registered after this handler.
    expect(body).toMatch(/startsWith\('\/api'\)/);
  });
});
