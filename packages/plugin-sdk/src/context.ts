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
  ScopeType,
  ServiceContracts,
  ServiceName,
} from '@thinkclass/contracts';
import type { AuthProvider, Database, Logger, SessionService } from '@thinkclass/kernel';

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
  /**
   * How long a session token lives, in milliseconds.
   *
   * The kernel owns session policy, and a plugin that mints a session
   * (`identity` is the one that does) has to use the same TTL the middleware expects - so the
   * value is published rather than re-derived from an environment variable on the plugin side.
   */
  readonly sessionTtlMs: number;
  /**
   * Reverses at-rest encryption for application-encrypted values, when the host
   * provides one. `undefined` means the database stores plaintext (or the caller does
   * not need decryption).
   */
  readonly decryptName?: (value: string) => string;
}

export interface EventsApi {  emit<T extends EventTopic>(topic: T, payload: EventPayload<T>): void;
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
  /**
   * The explicit assignment for one scope, or `undefined` when that scope never set
   * the key.
   *
   * `can()` answers "may this actor do it" by walking the actor's whole scope chain
   * and falling back to the declared default - which cannot express "this class has
   * never been configured". The distinction matters when a legacy column is still the
   * source of truth for unconfigured scopes: the assignment must win where it exists,
   * and the column must win where it does not.
   *
   * Read-only on purpose: a plugin reads assignments, it does not get the store.
   */
  assignedTo(scopeType: ScopeType, scopeId: number, key: string): boolean | undefined;
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

export interface AuthApi {
  /**
   * Register the credential verifier the kernel's own login route uses.
   *
   * `POST /api/kernel/auth/login` predates the plugin runtime: it was served by
   * `api/modules/auth/legacyAuthProvider.ts`, a temporary adapter whose only purpose was to
   * implement the kernel's `AuthProvider` port until the identity domain moved into a plugin.
   * The kernel cannot import a plugin (G2) and the route lives in the kernel router, so the
   * plugin hands its verifier *in* instead - the same inversion `decryptName` uses.
   *
   * Last registration wins, and the kernel route reads the registered provider per request, so a
   * plugin that is stopped mid-run degrades the route to 503 rather than leaving a dangling
   * closure. One provider is expected; a second `registerProvider` call replaces the first.
   */
  registerProvider(provider: AuthProvider): void;
}

export interface SettingsApi {
  define(declarations: Array<{ key: string; type: string; default: unknown; label: string }>): void;
  get<T = unknown>(key: string): T;
  set(key: string, value: unknown): void;
  /**
   * Read a platform-level setting - one the kernel owns, not this plugin's namespace.
   *
   * `get()`/`set()` are namespaced (`plugin.<slug>.<key>`), which is what stops one plugin from
   * reading another's settings. The cost is that a plugin needing a platform policy value had no
   * way to read it: `allow_teacher_registration` decides whether the identity domain's
   * registration route is open, and before this accessor the pre-migration code read it through
   * Prisma, from inside what is supposed to be a plugin.
   *
   * Generic by design - it names no keys, so the kernel still knows no business vocabulary
   * (guardrail G5). Read-only: a plugin writes only its own namespace, through `set`.
   *
   * `undefined` means "no such row", not "false", so an unset policy is distinguishable from a
   * disabled one.
   */
  getPlatform?<T = unknown>(key: string): T | undefined;
  /**
   * Write a platform-level setting - the other half of `getPlatform`, and the reason it exists.
   *
   * The admin console is the surface that edits platform policy (`GET|PUT /api/admin/system/settings`)
   * and the `settings` table is kernel-owned storage, so before this accessor the only way to save
   * one was `prisma.settings.upsert` from inside `api/modules/admin` - a plugin writing kernel
   * storage through a second data path. Like `getPlatform` it names no keys: the canonical key list
   * and the masking rules stay in the plugin, which is where the business vocabulary belongs.
   *
   * Throws when the host has no settings store (hand-built test hosts); a silent no-op would turn
   * "settings were not saved" into a success response.
   */
  setPlatform?(key: string, value: string | null): void;
}

export interface JobsApi {
  /** Declare a scheduled job. Scheduling itself is provided by the runtime. */
  schedule(name: string): Disposable;
}

/**
 * The account being erased, as named id sets.
 *
 * A *shape*, not a business rule: it says which rows identify the account, and every plugin's
 * cleanup rule decides for itself which of its tables carry those columns. See
 * `docs/migration/admin-cascade-decision.md` - `DELETE /api/admin/users/:id` used to delete from 58
 * tables through Prisma, which was atomic but bypassed every ownership check the plugin runtime
 * enforces. The named sets are what replace the 58 hard-coded table names.
 *
 * Ids are finite numbers, deduplicated and sorted by the runtime before a rule sees them.
 */
export interface CleanupSubject {
  /** The account being deleted. */
  teacherIds: number[];
  /** Classes that account owns, resolved by the domain that owns `classes`. */
  classIds: number[];
  /** Students in those classes, resolved by the domain that owns `students`. */
  studentIds: number[];
  /** Login rows of the teacher and those students, resolved by the domain that owns `users`. */
  userIds: number[];
}

export interface CleanupRule {
  /**
   * Tables this rule deletes from.
   *
   * Every entry must already be declared by the plugin (`data.tables` or `data.adopted`); the
   * runtime refuses a rule that reaches outside its own declaration, so "declaration is
   * permission" keeps holding for the one operation that used to escape it. Exactly one plugin may
   * claim a table, which is also how the `redemption_tickets` shared-write exception gets a single
   * cleanup owner.
   */
  tables: string[];
  /**
   * Delete this plugin's rows for `subject`.
   *
   * **Must be synchronous.** The runtime runs every rule inside one better-sqlite3 transaction,
   * and better-sqlite3 transaction callbacks cannot await: an `async` rule would put its later
   * statements *outside* the transaction while appearing to be inside it - the failure mode this
   * whole mechanism exists to prevent. The runtime asserts the return value is not a thenable and
   * throws if it is.
   */
  run(tx: DbApi, subject: CleanupSubject): void;
}

export interface CleanupApi {
  /** Declare this plugin's cleanup rule. Call during `setup()`. */
  register(rule: CleanupRule): void;
  /**
   * Run every registered rule for `subject` in one transaction, children before parents.
   *
   * Order comes from the schema's foreign-key graph, not from a hand-maintained table: a rule that
   * derives ids from another plugin's table (the collaboration rule reads `assignments` to find
   * `peer_reviews`) must run before that table's owner deletes it, and the foreign key between
   * them is exactly that statement. A cycle - or a rule that deletes from a table nobody declared -
   * throws rather than producing orphans.
   */
  run(subject: CleanupSubject): void;
}

/**
 * The kernel's audit log, for callers that must write an entry as part of their own transaction.
 *
 * `events.emit('kernel.request.audit')` is detached by design (it is the request middleware's
 * path), so a plugin could not previously record an entry in the same unit of work as the change
 * it describes. `operation_logs` is kernel-owned storage, so the write is published here rather
 * than performed by the plugin.
 */
export interface AuditApi {
  record(entry: {
    action: string;
    detail?: string | null;
    /** Written to `user_id`. */
    actorId?: number | null;
    /** Written to `teacher_id`; defaults to `actorId`. */
    teacherId?: number | null;
    role?: string | null;
    ip?: string | null;
  }): void;
  /** Delete the entries attributed to these accounts; see `AuditLog.purgeFor`. */
  purgeFor(ids: { teacherIds?: number[]; userIds?: number[] }): number;
}

/**
 * Database maintenance: export, import and reset - the three admin operations that are about the
 * *file*, not about any table.
 *
 * They cannot be a plugin's own code. Import replaces the SQLite file under the running process and
 * reset drops every table and replays the application's schema; both need the application's
 * connection lifecycle (`initDb`, the WAL sidecars, the open handles), which lives in the host, not
 * in the kernel and certainly not in a plugin. The host injects this, the same way it injects
 * `decryptName` and the auth provider - and the plugin keeps what belongs to it: the route, the
 * envelope and the superadmin round-trip around the reset.
 */
export interface DatabaseMaintenanceApi {
  /** Absolute path of the live database file, plus the name a download should carry. */
  exportDatabase(): Promise<{ filePath: string; fileName: string }>;
  /** Replace the live database with an uploaded SQLite file; rolls back when it cannot. */
  importDatabase(uploadedFilePath: string): Promise<{ message: string; reloaded: boolean; backupRestored: boolean }>;
  /** Drop every table and re-create the application schema. */
  resetDatabase(): Promise<void>;
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
  /** Hand the kernel's login route the credential verifier for this domain. */
  readonly auth: AuthApi;
  /**
   * Register this plugin's cleanup rule, and run every registered rule for one account deletion.
   *
   * The mechanism behind `DELETE /api/admin/users/:id`; see `CleanupRule` and the ruling in
   * `docs/migration/admin-cascade-decision.md`.
   */
  readonly cleanup: CleanupApi;
  /** The kernel's audit log, for writes that must share the caller's transaction. */
  readonly audit: AuditApi;
  /**
   * Database file maintenance, when the host provides it.
   *
   * Always present on the context: a host that injects nothing gets an accessor that throws a clear
   * error, because "the import silently did nothing" is worse than a 500 on the one route that
   * replaces the database.
   */
  readonly maintenance: DatabaseMaintenanceApi;

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
