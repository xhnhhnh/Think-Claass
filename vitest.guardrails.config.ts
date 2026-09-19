import { defineConfig } from 'vitest/config';

/**
 * Guardrail suite config.
 *
 * Deliberately separate from `vitest.config.ts`:
 *  - node environment (these are static-analysis checks, not DOM tests)
 *  - no setupFiles, so MSW does not run
 *  - only picks up tests/guardrails/**
 *
 * P1 will fold this into `vitest.workspace.ts` as the `guardrails` project.
 */
export default defineConfig({
  test: {
    name: 'guardrails',
    environment: 'node',
    include: ['tests/guardrails/**/*.test.ts'],
    globals: true,
    testTimeout: 60_000,
  },
});
