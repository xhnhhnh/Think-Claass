/**
 * Runtime configuration, injected into the served HTML.
 *
 * The kernel already writes a `window.__TC_CONFIG__` script tag into every `index.html` it
 * serves (`kernel/bootstrap/createKernel.ts`), carrying the admin path, the API base, whether
 * the plugin runtime is on, and the environment. Nothing in the frontend read it, so the admin
 * path was frozen at build time by `VITE_ADMIN_PATH` and changing it on an existing deployment
 * meant rewriting the built bundle:
 *
 *     find dist -type f \( -name "*.js" -o -name "*.html" \) -exec sed -i "s|/beiadmin|...|g" {} +
 *
 * That rewrites the literal string `/beiadmin` anywhere it appears in any chunk, and it cannot
 * be undone - which is why this module exists. Reading the injected value makes the deployment
 * path a per-deployment setting rather than a build-time constant.
 *
 * Every accessor falls back to the build-time environment, so the app still works when it is
 * served without the injection (a static preview, or the test environment).
 */

export interface RuntimeConfig {
  adminPath?: string;
  apiBase?: string;
  pluginRuntime?: boolean;
  env?: string;
}

declare global {
  interface Window {
    __TC_CONFIG__?: RuntimeConfig;
  }
}

/** The injected configuration, or an empty object when the page was not served by the kernel. */
export function runtimeConfig(): RuntimeConfig {
  return (typeof window !== 'undefined' && window.__TC_CONFIG__) || {};
}

/**
 * Base path of the admin console.
 *
 * The injected value wins; `VITE_ADMIN_PATH` remains the build-time default so a build with no
 * server (tests, `vite preview`) behaves exactly as before.
 */
export function adminPath(): string {
  const injected = runtimeConfig().adminPath;
  if (typeof injected === 'string' && injected.trim() !== '') return injected;
  return import.meta.env.VITE_ADMIN_PATH || '/beiadmin';
}

/** Whether this deployment runs the plugin runtime, as reported by the server. */
export function pluginRuntimeEnabled(): boolean {
  const injected = runtimeConfig().pluginRuntime;
  if (typeof injected === 'boolean') return injected;
  return false;
}

/**
 * Backwards-compatible constant.
 *
 * Kept because it reads well at call sites that only need the default, but prefer `adminPath()`
 * anywhere the value decides routing - a constant is evaluated once at module load and cannot
 * reflect what the server injected.
 */
export const ADMIN_PATH = adminPath();
