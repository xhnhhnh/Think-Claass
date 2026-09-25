import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * End-to-end project: the composed application, exercised over real HTTP.
 *
 * This project exists because of a measured gap between the other two:
 *
 *   - `tests/**` (the backend project) boots real kernels, but only ever touches the handful of
 *     routes a given suite is about. Nothing walked the whole surface.
 *   - `src/**` (the app project) runs the real frontend page code, but against MSW handlers that
 *     answer **200 for everything**, so a client and a server that disagree about a contract both
 *     look green.
 *
 * Between them, a route could be scoped wrong, answer the wrong status, or answer a different shape
 * than the page reads, and no test would notice - which is exactly how the defects this suite now
 * covers survived a green suite of 133 files / 1128 tests.
 *
 * The suites here boot `api/app.ts` (the composition that actually ships), seed it through its own
 * HTTP surface, and then assert per route: anonymous is refused, each role gets what
 * `docs/security/route-authorization-matrix.md` says, and no route answers 500.
 *
 * Node environment, no DOM, no MSW - same as the backend project, and for the same reason: a mock
 * in the path would defeat the point.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: '@thinkclass/contracts/domains', replacement: path.resolve(__dirname, 'packages/contracts/src/domains') },
      { find: '@thinkclass/contracts', replacement: path.resolve(__dirname, 'packages/contracts/src/index.ts') },
      { find: '@thinkclass/kernel', replacement: path.resolve(__dirname, 'packages/kernel/src/index.ts') },
      { find: '@thinkclass/plugin-sdk', replacement: path.resolve(__dirname, 'packages/plugin-sdk/src/index.ts') },
      { find: '@thinkclass/plugin-runtime', replacement: path.resolve(__dirname, 'packages/plugin-runtime/src/index.ts') },
    ],
  },
  test: {
    name: 'e2e',
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    globals: false,
    testTimeout: 60_000,
    /**
     * Booting the composed application once is 1-3 seconds; applying the legacy boot schema to a
     * fresh file is the slow part. The budget is a bound on a hang, not an expectation.
     */
    hookTimeout: 180_000,
    /** The same test-only key the other projects use; nowhere is a deployment key written down. */
    env: { ENCRYPTION_KEY: 'vitest-only-encryption-key-00000' },
  },
});
