import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

/**
 * Application test project: React frontend (`src/**`) and the legacy `api/**`
 * suites, running under jsdom with MSW installed by `src/setupTests.ts`.
 *
 * The `@thinkclass/*` aliases mirror the root tsconfig `paths` so application code
 * can import workspace packages exactly as it does at runtime.
 *
 * `tsconfigPaths()` matches the production build: without it the `@/` alias is unknown to
 * Vite's static analysis, so `import.meta.glob('@/features/...')` in the route registry
 * resolves to nothing under test while working in the build - the registry would look
 * correct in production and empty in CI.
 *
 * Run standalone with `npm run test:app`.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    name: 'app',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    // Scope matters: without it this project also collects tests/kernel/** and
    // tests/guardrails/**, runs them under jsdom, and MSW then intercepts the real
    // fetch calls those suites rely on.
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/qa-full-site.spec.ts', '**/*.pw.spec.ts', '**/*.e2e.ts'],
    /**
     * The at-rest key `api/db.ts` encrypts student names with.
     *
     * P4.3b.15 removed the hard-coded default from the source (it was published in the repository,
     * which is the same as not encrypting), so the key is now required. Tests that never touch an
     * encrypted name do not need it, and the ones that do get this one - deliberately a test value,
     * never a deployment key.
     */
    env: { ENCRYPTION_KEY: 'vitest-only-encryption-key-00000' },
    // Array form and ordering matter: the `domains` subpath must be matched before
    // the bare package specifier.
    alias: [
      { find: '@thinkclass/contracts/domains', replacement: path.resolve(__dirname, 'packages/contracts/src/domains') },
      { find: '@thinkclass/contracts', replacement: path.resolve(__dirname, 'packages/contracts/src/index.ts') },
      { find: '@thinkclass/kernel', replacement: path.resolve(__dirname, 'packages/kernel/src/index.ts') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
});
