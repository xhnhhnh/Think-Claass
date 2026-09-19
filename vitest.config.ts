import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config - one command runs every layer of the repository:
 *
 *   app        - the React frontend and legacy api/** suites (jsdom + MSW)
 *   kernel     - the minimal core (node)
 *   guardrails - the migration ratchets (node, static analysis)
 *
 * Vitest 4 replaced the old `vitest.workspace.ts` file with `test.projects`
 * declared here; a workspace file is silently ignored, which is how the suites
 * first appeared to run while two of the three projects were skipped.
 *
 * Each project keeps its own config so targeted runs stay possible:
 *   npm run test:app / npm run test:kernel / npm run guard
 */
export default defineConfig({
  test: {
    projects: ['./vitest.app.config.ts', './vitest.backend.config.ts', './vitest.guardrails.config.ts'],
  },
});
