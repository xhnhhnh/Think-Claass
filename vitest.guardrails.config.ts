import path from 'node:path';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Guardrail suite config.
 *
 * Deliberately separate from `vitest.config.ts`:
 *  - node environment (these are static-analysis checks, not DOM tests)
 *  - no setupFiles, so MSW does not run
 *  - only picks up tests/guardrails/**
 *
 * `tsconfigPaths()` was added for the UI-R guardrails, and it is a quality fix rather than
 * a convenience. Without it the guardrail suite had no `@/` alias, so a check that needed
 * to know something about the route table had to read the file as **text** and re-derive
 * its contents with regular expressions. The first version of `ui-route-coverage.test.ts`
 * did exactly that and got the answer wrong three different ways: it missed entries whose
 * `icon` prop was JSX, it mis-grouped dock tabs because the component path does not name
 * the console, and it reported four shells as orphaned because layouts are registered
 * through `layout:` rather than `component:`. None of those were defects in the table.
 *
 * Importing the real module is both shorter and strictly stronger: it cannot disagree with
 * the application about what the table says, because it *is* the table.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'guardrails',
    environment: 'node',
    include: ['tests/guardrails/**/*.test.ts'],
    globals: true,
    testTimeout: 60_000,
    /**
     * The `@/` alias, spelled out.
     *
     * `tsconfigPaths()` resolves it for vite's plugin pipeline but not for the guardrail
     * project's own module resolution, and `test.alias` is what applies to the test file's
     * import specifiers. Declared here as an array, like the app project's config, because
     * the `domains` subpath has to be matched before the bare package specifier.
     */
    alias: [
      { find: '@thinkclass/contracts/domains', replacement: path.resolve(__dirname, 'packages/contracts/src/domains') },
      { find: '@thinkclass/contracts', replacement: path.resolve(__dirname, 'packages/contracts/src/index.ts') },
      { find: '@thinkclass/kernel', replacement: path.resolve(__dirname, 'packages/kernel/src/index.ts') },
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
});
