/**
 * Kernel configuration.
 *
 * Layered resolution: explicit overrides (tests) > environment > defaults.
 * Nothing here knows about a business domain; plugin settings live in the
 * settings store and are declared by plugin manifests.
 */

import path from 'node:path';

/** Version of the kernel's public API surface. Plugins declare a range of this. */
export const KERNEL_API_VERSION = 1;

export interface KernelConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  /** Absolute path to the repository/deployment root. */
  rootDir: string;
  /** Absolute path to the SQLite database file. */
  databaseFile: string;
  /** Absolute path to the built frontend, served statically when it exists. */
  staticDir: string;
  /** Absolute path to the uploads directory. */
  uploadsDir: string;
  /**
   * Open SQLite **without** WAL (`DATABASE_SKIP_WAL=1`).
   *
   * Defaults to false, because WAL is the right journal for a local disk: readers do not block the
   * writer and the common case is a single process on one machine.
   *
   * It has to be switchable because the deployment moved: the WeChat mini program's backend runs as a
   * container with the database on a mounted network filesystem (CFS), and WAL depends on a shared
   * memory file plus POSIX locks that those mounts do not reliably provide. Silently corrupting a
   * school's data is the failure this switch exists to avoid, and `PRAGMA journal_mode` is the way to
   * verify which one is in force.
   */
  databaseSkipWal: boolean;
  /** Admin console base path. Replaces the build-time `sed` rewrite. */
  adminPath: string;
  /**
   * When true, unverified `x-user-role` / `x-user-id` headers are accepted as identity.
   *
   * Defaults to **false**. These headers are entirely client-supplied and cannot be verified, so
   * with this on any caller becomes any user by editing two headers - including `superadmin`. That
   * is not a theoretical weakness: it defeats every per-endpoint authorization check in the
   * application at once, which is why it has to default to closed rather than open.
   *
   * It previously defaulted to `true` as a migration bridge "so the frontend can be switched over
   * without a flag day" (`packages/kernel/src/http/requestContext.ts`). That flag day has passed:
   * both login paths store a Bearer token (`LoginPage.tsx`, `AdminLoginPage.tsx`), and the
   * register/activate paths deliberately force a re-login, so no session established today depends
   * on the bridge. Setting it to `1` remains possible for a deployment that genuinely still needs
   * it, and every bridged request is logged as such.
   *
   * Consequence of the flip, stated so it is not a surprise: a browser holding a session persisted
   * *before* tokens existed has a `user` but no `token`, so it is now anonymous and must log in
   * again once.
   */
  allowLegacyHeaderAuth: boolean;
  /** Session lifetime in milliseconds. */
  sessionTtlMs: number;
  /** Root log level. */
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  /**
   * Enable the plugin host. Defaults to true: since every domain is a plugin, the host being
   * off means an application with no business routes. Turning it off is only meaningful
   * together with `KERNEL_ENABLED=1` (a kernel-only deployment).
   */
  pluginsEnabled: boolean;
  /** Directories scanned for plugins, in precedence order. */
  pluginDirs: string[];
  /**
   * Reverses at-rest encryption for values the application stores encrypted.
   *
   * Student names are AES-encrypted in the database (`api/services/studentService.ts`),
   * and the key lives with the application, not in the kernel. The host injects the
   * decryptor here so a foundation plugin can publish *readable* values through its
   * port without importing `api/**` or re-implementing a security-sensitive helper.
   *
   * A function in config is unusual, and it is the narrowest seam available: the
   * alternative was per-plugin host services, which the runtime has no plumbing for.
   * It is optional, and its absence means identity - correct for a database whose rows
   * were never encrypted, and for tests.
   */
  decryptName?: (value: string) => string;
}

const DEFAULTS = {
  port: 3001,
  adminPath: '/beiadmin',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
} as const;

function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function envInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface LoadConfigOptions {
  rootDir?: string;
  overrides?: Partial<KernelConfig>;
  env?: NodeJS.ProcessEnv;
}

export function loadConfig(options: LoadConfigOptions = {}): KernelConfig {
  const env = options.env ?? process.env;
  const rootDir = path.resolve(options.rootDir ?? env.THINK_CLASS_ROOT ?? process.cwd());

  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';

  const config: KernelConfig = {
    env: nodeEnv,
    port: envInt(env.PORT, DEFAULTS.port),
    rootDir,
    databaseFile: path.resolve(rootDir, env.DATABASE_FILE ?? 'database.sqlite'),
    staticDir: path.resolve(rootDir, env.STATIC_DIR ?? 'dist'),
    uploadsDir: path.resolve(rootDir, env.UPLOADS_DIR ?? 'uploads'),
    databaseSkipWal: envFlag(env.DATABASE_SKIP_WAL, false),
    adminPath: env.VITE_ADMIN_PATH || env.ADMIN_PATH || DEFAULTS.adminPath,
    allowLegacyHeaderAuth: envFlag(env.ALLOW_LEGACY_HEADER_AUTH, false),
    sessionTtlMs: envInt(env.SESSION_TTL_MS, DEFAULTS.sessionTtlMs),
    logLevel: (env.LOG_LEVEL as KernelConfig['logLevel']) || (nodeEnv === 'test' ? 'silent' : 'info'),
    /**
     * Defaults to **true**, and that default is load-bearing rather than a preference.
     *
     * `api/app.module.ts` declares `imports: []` - every business domain moved into a plugin - so
     * the plugin host is the legacy composition's *only* source of modules. With the host off, that
     * composition boots an application with zero business routes and answers 404 for `/api/students`,
     * `/api/classes`, `/api/auth/login` and every sibling. Because nothing in `scripts/deploy-common.sh`,
     * `install.sh`, `update.sh`, `pack.sh`, `nodemon.json` or `package.json` sets this variable, the
     * default WAS the deployed configuration: a fresh install served no business route at all, and
     * `/api/health` reported `plugins: { total: 0 }` as its only symptom.
     *
     * Kernel-only deployment is still supported - it is the explicit pair
     * `KERNEL_ENABLED=1 PLUGINS_ENABLED=0`, which is what `docs/migration/HANDOFF.md` already
     * prescribed. `api/app.ts` refuses legacy + plugins-off outright, because that pairing describes
     * nothing that can serve a request.
     */
    pluginsEnabled: envFlag(env.PLUGINS_ENABLED, true),
    pluginDirs: (env.PLUGIN_DIRS ?? 'plugins,plugins-ext')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => path.resolve(rootDir, d)),
  };

  return { ...config, ...options.overrides };
}
