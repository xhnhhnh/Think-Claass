/**
 * The kernel context handed to every plugin.
 *
 * This is the ONLY surface a plugin may use. It is frozen per plugin, carries the
 * plugin's identity, and is the mechanism that makes the architecture enforceable:
 * a plugin cannot import another plugin's internals, cannot reach the kernel's
 * private modules, and cannot touch a capability its manifest did not declare.
 *
 * Type-only imports from the kernel: `plugin-sdk` has no runtime dependency on it,
 * so a plugin bundle that only needs the SDK does not pull the kernel in.
 */

import type {
  Actor,
  Disposable,
  EventMeta,
  EventPayload,
  EventTopic,
  PermissionDeclaration,
  PluginTier,
  ScopeRef,
  ServiceContracts,
  ServiceName,
} from '@thinkclass/contracts';
import type { Database, Logger, SessionService } from '@thinkclass/kernel';

/** A parameter accepted by the database helpers. */
export type SqlParam = string | number | bigint | null | Uint8Array;

export interface DbRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Namespaced database access.
 *
 * Deliberately not the raw better-sqlite3 handle: writes are checked against the
 * plugin's declared table ownership while `env` is not production, so a plugin
 * cannot quietly write into another plugin's - or the kernel's - tables.
 */
export interface DbApi {
  query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): T[];
  get<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): T | undefined;
  run(sql: string, params?: SqlParam[]): DbRunResult;
  /** Run `fn` in a transaction; nested calls join the outer transaction. */
  tx<T>(fn: (tx: DbApi) => T): T;
  /** Escape hatch for migrations and maintenance, still ownership-checked. */
  exec(sql: string): void;
}

export interface PluginIdentity {
  id: string;
  slug: string;
  version: string;
  tier: PluginTier;
  /** Absolute path to the plugin directory. */
  directory: string;
}

export interface ConfigApi {
  get<T = unknown>(key: string, fallback?: T): T;
  /** Read-only view of the kernel configuration a plugin may see. */
  readonly env: string;
  readonly rootDir: string;
}

export interface EventsApi {
  emit<T extends EventTopic>(topic: T, payload: EventPayload<T>): void;
  on<T extends EventTopic>(
    topic: T | '*' | `${string}.*`,
    handler: (payload: EventPayload<T>, meta: EventMeta) => void | Promise<void>,
  ): Disposable;
}

export interface PermissionsApi {
  /** Declare permissions. Most plugins declare them in the manifest instead. */
  register(declarations: PermissionDeclaration[]): void;
  can(actor: Actor, key: string, scope?: ScopeRef): boolean;
  require(actor: Actor, key: string, scope?: ScopeRef): void;
}

export interface RoutesApi {
  /**
   * Mount an express router under a path. The path must be declared in the
   * manifest's `provides.routes`; anything else is rejected.
   */
  mount(base: string, router: unknown, options?: { compat?: string[] }): Disposable;
}

export interface MigrationsApi {
  /**
   * Run the migrations declared in the manifest, in id order. Usually called by
   * the runtime; exposed so a plugin can apply its own schema during setup.
   */
  run(): { applied: string[]; skipped: string[] };
}

export interface SettingsApi {
  define(declarations: Array<{ key: string; type: string; default: unknown; label: string }>): void;
  get<T = unknown>(key: string): T;
  set(key: string, value: unknown): void;
}

export interface JobsApi {
  /** Declare a scheduled job. Scheduling itself is provided by the runtime. */
  schedule(name: string): Disposable;
}

export interface CapabilityApi {
  /**
   * Filesystem access, or null when the manifest did not declare the `fs`
   * capability. Plugins must null-check: an undeclared capability is unavailable,
   * not merely discouraged.
   */
  readonly fs: typeof import('node:fs') | null;
  readonly net: typeof import('node:net') | null;
  readonly childProcess: typeof import('node:child_process') | null;
}

export interface KernelContext {
  readonly plugin: PluginIdentity;
  readonly log: Logger;
  readonly config: ConfigApi;
  readonly events: EventsApi;
  readonly permissions: PermissionsApi;
  readonly routes: RoutesApi;
  readonly migrations: MigrationsApi;
  readonly settings: SettingsApi;
  readonly jobs: JobsApi;
  readonly capabilities: CapabilityApi;

  /**
   * Namespaced, ownership-checked database access. This is the default and what
   * plugins should use: statements are validated against the tables the manifest
   * declared.
   */
  readonly db: DbApi;
  /**
   * Raw better-sqlite3 handle, for maintenance and diagnostics. It bypasses the
   * ownership checks, so reaching for it in ordinary feature code is a smell.
   */
  readonly rawDb: Database;
  /** Sessions, for plugins that mint their own (the identity plugin does). */
  readonly sessions: SessionService;

  /** Publish an implementation under a namespaced service name. */
  provide<N extends ServiceName>(name: N, implementation: ServiceContracts[N]): void;
  /** Resolve another plugin's published service. Throws when it is unavailable. */
  use<N extends ServiceName>(name: N): ServiceContracts[N];
  /** Resolve an optional service without throwing. */
  tryUse<N extends ServiceName>(name: N): ServiceContracts[N] | null;

  /** Register a callback run during plugin stop, before routes are unmounted. */
  onStop(callback: () => void | Promise<void>): void;
}

/** Injection token a Nest controller or provider uses to receive its context. */
export const PLUGIN_CONTEXT = 'THINKCLASS_PLUGIN_CONTEXT';

/** Injection token carrying the plugin's manifest. */
export const PLUGIN_MANIFEST = 'THINKCLASS_PLUGIN_MANIFEST';
