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
    /**
     * The at-rest key the classroom plugin encrypts student names with.
     *
     * P4.3b.15 removed the published default from the source, so the key is required wherever a name
     * is encrypted or decrypted. This value is a test one; the boot probes spawn `api/server.ts`
     * with `...process.env`, so they inherit it and keep exercising the real code path.
     */
    env: { ENCRYPTION_KEY: 'vitest-only-encryption-key-00000' },
    /**
     * Booting a plugin host is the most expensive hook in the suite: discovery reads every
     * `plugin.json`, validation runs, ~20 plugin modules are imported through the esbuild transform,
     * migrations run and Nest assembles the module graph. Under `npm test` that happens while the app
     * and guardrail projects are also transforming files, and the default 10s hook budget turned a
     * scheduling delay into three failed suites - each of which passed on its own. 60s is a bound on
     * a hang, not an expectation: a healthy boot is 1-3 seconds.
     */
    hookTimeout: 60_000,
  },
});
