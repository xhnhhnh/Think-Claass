import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Backend test project: the kernel, the plugin runtime, and the plugins themselves.
 * Node environment, no DOM, no MSW.
 *
 * Aliases mirror the root tsconfig `paths` so tests resolve workspace packages
 * exactly as the runtime does (`tsx` honours tsconfig paths, and the production
 * esbuild bundle resolves them too).
 *
 * Array form and ordering matter: `@thinkclass/contracts/domains` must be matched
 * before the bare `@thinkclass/contracts`, otherwise the replacement produces
 * `<index.ts>/domains`.
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
    name: 'backend',
    environment: 'node',
    include: ['tests/kernel/**/*.test.ts', 'tests/plugins/**/*.test.ts'],
    globals: false,
    testTimeout: 30_000,
  },
});
