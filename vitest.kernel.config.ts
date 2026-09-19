import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Kernel test project: node environment, no DOM, no MSW.
 *
 * Aliases mirror the root tsconfig `paths` so tests resolve the workspace packages
 * exactly as the runtime does (`tsx` honours tsconfig paths, and the production
 * esbuild bundle resolves them too).
 *
 * Array form and ordering matter: `@thinkclass/contracts/domains/x` must be
 * matched before the bare `@thinkclass/contracts`, otherwise the replacement
 * produces `<index.ts>/domains/x`.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: '@thinkclass/contracts/domains', replacement: path.resolve(__dirname, 'packages/contracts/src/domains') },
      { find: '@thinkclass/contracts', replacement: path.resolve(__dirname, 'packages/contracts/src/index.ts') },
      { find: '@thinkclass/kernel', replacement: path.resolve(__dirname, 'packages/kernel/src/index.ts') },
    ],
  },
  test: {
    name: 'kernel',
    environment: 'node',
    include: ['tests/kernel/**/*.test.ts'],
    globals: false,
    testTimeout: 30_000,
  },
});
