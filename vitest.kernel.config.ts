import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Kernel test project: node environment, no DOM, no MSW.
 *
 * Aliases mirror the `paths` entries in the root tsconfig so tests resolve the
 * workspace packages exactly as the runtime does (`tsx` honours tsconfig paths,
 * and the production esbuild bundle resolves them too).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@thinkclass/kernel': path.resolve(__dirname, 'packages/kernel/src/index.ts'),
      '@thinkclass/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
    },
  },
  test: {
    name: 'kernel',
    environment: 'node',
    include: ['tests/kernel/**/*.test.ts'],
    globals: false,
    testTimeout: 30_000,
  },
});
