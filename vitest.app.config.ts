import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Application test project: React frontend (`src/**`) and the legacy `api/**`
 * suites, running under jsdom with MSW installed by `src/setupTests.ts`.
 *
 * The `@thinkclass/*` aliases mirror the root tsconfig `paths` so application code
 * can import workspace packages exactly as it does at runtime.
 *
 * Run standalone with `npm run test:app`.
 */
export default defineConfig({
  plugins: [react()],
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
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@thinkclass/contracts': path.resolve(__dirname, './packages/contracts/src/index.ts'),
      '@thinkclass/kernel': path.resolve(__dirname, './packages/kernel/src/index.ts'),
    },
  },
});
