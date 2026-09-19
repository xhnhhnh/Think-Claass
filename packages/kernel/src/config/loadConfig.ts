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
  /** Admin console base path. Replaces the build-time `sed` rewrite. */
  adminPath: string;
  /**
   * When true, unverified `x-user-role` / `x-user-id` headers are accepted.
   * Exists only to bridge the migration; must be false in production.
   */
  allowLegacyHeaderAuth: boolean;
  /** Session lifetime in milliseconds. */
  sessionTtlMs: number;
  /** Root log level. */
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  /** Enable the plugin host. When false the kernel boots with zero plugins. */
  pluginsEnabled: boolean;
  /** Directories scanned for plugins, in precedence order. */
  pluginDirs: string[];
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
    adminPath: env.VITE_ADMIN_PATH || env.ADMIN_PATH || DEFAULTS.adminPath,
    allowLegacyHeaderAuth: envFlag(env.ALLOW_LEGACY_HEADER_AUTH, true),
    sessionTtlMs: envInt(env.SESSION_TTL_MS, DEFAULTS.sessionTtlMs),
    logLevel: (env.LOG_LEVEL as KernelConfig['logLevel']) || (nodeEnv === 'test' ? 'silent' : 'info'),
    pluginsEnabled: envFlag(env.PLUGINS_ENABLED, false),
    pluginDirs: (env.PLUGIN_DIRS ?? 'plugins,plugins-ext')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => path.resolve(rootDir, d)),
  };

  return { ...config, ...options.overrides };
}
