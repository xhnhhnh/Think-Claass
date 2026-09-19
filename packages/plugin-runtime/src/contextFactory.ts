/**
 * Builds the frozen `KernelContext` a plugin receives.
 *
 * Two properties matter here:
 *
 *   1. **Frozen and per-plugin.** A plugin cannot mutate its context to grant
 *      itself something, and cannot see another plugin's context.
 *   2. **Declared-then-permitted.** Events a plugin emits, topics it subscribes
 *      to, tables it touches and capabilities it uses are all checked against its
 *      manifest before the operation happens, so an under-declared plugin fails at
 *      the call site rather than silently exceeding its contract.
 */

import childProcess from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';

import type { EventTopic, PermissionDeclaration, ServiceContracts, ServiceName } from '@thinkclass/contracts';
import type {
  Database,
  KernelConfig,
  Logger,
  PermissionEngine,
  SessionService,
  EventBus,
  SettingsStore,
  AuthProvider,
  AuditLog,
} from '@thinkclass/kernel';
import { ApiError, forbidden } from '@thinkclass/kernel';
import type { DbApi, KernelContext } from '@thinkclass/plugin-sdk';
import { tablePrefixOf } from '@thinkclass/plugin-sdk';

import type { PluginBoundary } from './boundary.js';
import type { CleanupRegistry } from './cleanupRegistry.js';
import { createDbApi } from './dbApi.js';
import type { DiscoveredPlugin } from './discovery.js';
import type { ServiceRegistry } from './serviceRegistry.js';

/** A router registration collected from `ctx.routes.mount()`. */
export interface MountedRouter {
  pluginId: string;
  base: string;
  compat: string[];
  router: unknown;
}

export interface ContextFactoryDeps {
  db: Database;
  sessions: SessionService;
  events: EventBus;
  permissions: PermissionEngine;
  services: ServiceRegistry;
  boundary: PluginBoundary;
  logger: Logger;
  config: KernelConfig;
  /**
   * Kernel-owned settings, for the read-only platform accessor (`ctx.settings.getPlatform`).
   *
   * Optional so a hand-built context in a test can omit it; the accessor then answers
   * `undefined` rather than inventing a value, which is the same posture as an absent row.
   */
  settings?: SettingsStore;
  /**
   * Where a plugin registers its credential verifier for the kernel's own login route.
   *
   * A mutable holder rather than a plain value because the kernel is created before plugins are
   * mounted: `api/app.ts` passes the holder into `createKernel`, the identity plugin fills it
   * during `setup`, and the kernel router reads `current` per request. Without the indirection the
   * kernel would capture `undefined` at boot and `/api/kernel/auth/login` would answer 503 forever.
   */
  authProvider?: { current: AuthProvider | null };
  /**
   * The kernel's audit log, published to plugins as `ctx.audit`.
   *
   * Optional so a hand-built context in a test can omit it; the accessor then throws a clear error
   * rather than silently dropping an entry an account deletion depends on.
   */
  audit?: AuditLog;
  /**
   * Database file maintenance, injected by the host application.
   *
   * Only the host can replace the SQLite file under a running process and replay the application's
   * schema, so `plugins/admin` reaches it through `ctx.maintenance`. Omitted by hand-built test
   * hosts, in which case the accessor throws instead of pretending the operation happened.
   */
  maintenance?: KernelContext['maintenance'];
  /**
   * The account-deletion registry.
   *
   * Built by the host (one per process) and injected into every context: a plugin registers its own
   * rule with it, and `DELETE /api/admin/users/:id` runs all of them in one transaction. The
   * registry itself knows no table names - see cleanupRegistry.ts.
   */
  cleanup: CleanupRegistry;
  /** Collected route registrations, mounted by the host. */
  mountedRouters: MountedRouter[];
  /** Topic pattern matcher for declared event subscriptions. */
  strict: boolean;
}

/** Does `pattern` (possibly a `prefix.*` wildcard) cover `topic`? */
function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === '*' || pattern === topic) return true;
  if (pattern.endsWith('.*')) return topic.startsWith(pattern.slice(0, -1));
  return false;
}

function pathMatchesBase(path: string, base: string): boolean {
  return path === base || path.startsWith(base.endsWith('/') ? base : base + '/');
}

/**
 * The host-injected maintenance implementation, or a loud failure.
 *
 * Every method goes through this rather than returning `undefined`, because the three operations it
 * serves replace or rebuild the entire database: a silent no-op would answer "导入成功" while
 * changing nothing.
 */
function requireMaintenance(deps: ContextFactoryDeps): NonNullable<ContextFactoryDeps['maintenance']> {
  if (!deps.maintenance) {
    throw new ApiError(500, 'this host does not provide database maintenance', {
      code: 'MAINTENANCE_UNAVAILABLE',
    });
  }
  return deps.maintenance;
}

export function createPluginContext(plugin: DiscoveredPlugin, deps: ContextFactoryDeps): KernelContext {
  const { manifest, directory } = plugin;
  const log = deps.logger.child(`plugin:${manifest.id}`);

  const declaredEmits = new Set(manifest.provides?.events?.emits ?? []);
  const declaredSubscribes = manifest.provides?.events?.subscribes ?? [];
  const declaredSettings = manifest.provides?.settings ?? [];
  const declaredPermissionKeys = new Set((manifest.provides?.permissions ?? []).map((p) => p.key));

  // `adopted` tables are owned too, just still under their legacy names.
  const ownedTables = new Set([...(manifest.data.tables ?? []), ...(manifest.data.adopted ?? [])]);
  const readTables = new Set(manifest.data.reads ?? []);
  const capabilities = new Set(manifest.data.capabilities ?? []);

  function deny(message: string, code: string): never {
    if (deps.strict) throw new ApiError(500, message, { code });
    log.warn('declaration violation (not enforced in production)', { message });
    throw new ApiError(500, message, { code });
  }

  const dbApi: DbApi = createDbApi({
    db: deps.db,
    pluginId: manifest.id,
    ownedTables,
    readTables,
    strict: deps.strict,
    logger: log,
  });

  const stopCallbacks: Array<() => void | Promise<void>> = [];

  const context: KernelContext = {
    plugin: {
      id: manifest.id,
      slug: manifest.slug,
      version: manifest.version,
      tier: manifest.tier,
      directory,
    },

    log,

    config: {
      get<T = unknown>(key: string, fallback?: T): T {
        const value = process.env[key];
        return (value === undefined ? fallback : (value as unknown)) as T;
      },
      env: deps.config.env,
      rootDir: deps.config.rootDir,
      sessionTtlMs: deps.config.sessionTtlMs,
      // Re-exported so a foundation plugin can publish readable values without
      // importing application code. See `KernelConfig.decryptName`.
      ...(deps.config.decryptName ? { decryptName: deps.config.decryptName } : {}),
    },

    events: {
      emit(topic, payload) {
        if (!declaredEmits.has(topic)) {
          deny(
            `plugin "${manifest.id}" emitted "${topic}", which is not declared in manifest provides.events.emits`,
            'EVENT_NOT_DECLARED',
          );
        }
        deps.events.emit(topic as EventTopic, payload as never, { source: manifest.id });
      },

      on(pattern, handler) {
        const declared = declaredSubscribes.some((entry) => entry === pattern);
        if (!declared) {
          deny(
            `plugin "${manifest.id}" subscribed to "${pattern}", which is not declared in manifest provides.events.subscribes`,
            'EVENT_NOT_DECLARED',
          );
        }
        return deps.events.on(pattern as EventTopic, deps.boundary.guard(manifest.id, `event:${pattern}`, handler), {
          owner: manifest.id,
        });
      },
    },

    permissions: {
      register(declarations: PermissionDeclaration[]) {
        deps.permissions.register(declarations, manifest.id);
      },
      can(actor, key, scope) {
        return deps.permissions.can(actor, key, scope);
      },
      require(actor, key, scope) {
        if (!deps.permissions.can(actor, key, scope)) {
          throw forbidden(`缺少权限：${key}`);
        }
      },
      /**
       * Scoped to keys this plugin declared.
       *
       * Without that restriction a plugin could enumerate another plugin's capability
       * assignments, which is exactly the cross-plugin reach G1 forbids. `can()` needs
       * no such guard because it only ever reports a boolean about the calling actor.
       */
      assignedTo(scopeType, scopeId, key) {
        if (!declaredPermissionKeys.has(key)) {
          throw forbidden(`权限未声明：${key}`);
        }
        return deps.permissions.store.get(scopeType, scopeId, key);
      },
    },

    routes: {
      mount(base, router, options) {
        // The manifest is the contract; mounting an undeclared path is rejected so
        // the route table can be computed without executing plugin code.
        const declared = (manifest.provides?.routes ?? []).some(
          (route) => route.base === base || (route.compat ?? []).includes(base),
        );
        if (!declared) {
          deny(
            `plugin "${manifest.id}" mounted "${base}", which is not declared in manifest provides.routes`,
            'ROUTE_NOT_DECLARED',
          );
        }
        const compat = (options?.compat ?? []).filter((path) => pathMatchesBase(path, '/'));
        const entry: MountedRouter = { pluginId: manifest.id, base, compat, router };
        deps.mountedRouters.push(entry);
        log.debug('router mounted', { base, compat });
        return {
          dispose() {
            const index = deps.mountedRouters.indexOf(entry);
            if (index >= 0) deps.mountedRouters.splice(index, 1);
          },
        };
      },
    },

    migrations: {
      // Migrations are applied by the host before setup runs, so that a plugin's
      // schema exists by the time its own code touches it. Calling run() again is a
      // no-op thanks to the ledger.
      run() {
        return { applied: [], skipped: manifest.provides?.migrations?.map((m) => m.id) ?? [] };
      },
    },

    settings: {
      define(declarations) {
        for (const declaration of declarations) {
          declaredSettings.push({
            key: declaration.key,
            type: declaration.type as 'string' | 'number' | 'boolean' | 'json',
            default: declaration.default,
            scope: 'platform',
            label: declaration.label,
          });
        }
      },
      get<T = unknown>(key: string): T {
        const settingKey = `plugin.${manifest.slug}.${key}`;
        const row = deps.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(settingKey) as
          | { value: string | null }
          | undefined;
        if (row?.value !== undefined && row.value !== null) return row.value as unknown as T;
        return (declaredSettings.find((s) => s.key === key)?.default ?? null) as T;
      },
      set(key: string, value: unknown) {
        const settingKey = `plugin.${manifest.slug}.${key}`;
        deps.db
          .prepare(
            `INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          )
          .run(settingKey, value === null || value === undefined ? null : String(value));
      },
      /**
       * Read a *platform* setting - one the kernel owns, not this plugin's namespace.
       *
       * `get()` deliberately prefixes `plugin.<slug>.`, which is what keeps one plugin from
       * reading another's settings. That namespacing is also why a plugin that needs a
       * platform-level policy value (`allow_teacher_registration` decides whether the identity
       * domain's registration route is open) had no way to read it at all, and the pre-migration
       * code reached for Prisma instead.
       *
       * This accessor is generic on purpose: it knows no key names, so guardrail G5 (the kernel
       * has zero domain knowledge) still holds - the business vocabulary stays in the plugin.
       * It is read-only; a plugin writes only its own namespace, through `set`.
       *
       * `undefined` means "no such row", not "false", so a caller can tell an unset policy from a
       * disabled one. The host's `SettingsStore` already has exactly those semantics.
       */
      getPlatform<T = unknown>(key: string): T | undefined {
        return deps.settings?.get(key) as T | undefined;
      },
      /**
       * Write a *platform* setting - the counterpart of `getPlatform`.
       *
       * The `settings` table is kernel-owned storage (plugins only ever write their own
       * `plugin.<slug>.<key>` namespace through `set`), and the admin console is the surface that
       * edits platform policy. Without this the console had to write the table through Prisma,
       * which is a second data path into kernel storage from inside a plugin.
       */
      setPlatform(key: string, value: string | null): void {
        if (!deps.settings) {
          throw new ApiError(500, 'this host does not expose the platform settings store', {
            code: 'SETTINGS_STORE_UNAVAILABLE',
          });
        }
        deps.settings.set(key, value);
      },
    },

    /**
     * Credential verification for the kernel's own login route.
     *
     * The kernel cannot import a plugin, so the plugin registers *into* the kernel. The identity
     * plugin is the only expected caller; a second registration replaces the first, which is the
     * honest outcome for two domains claiming to own authentication.
     */
    auth: {
      registerProvider(provider: AuthProvider) {
        if (!deps.authProvider) {
          throw new ApiError(500, 'this host does not accept an auth provider registration', {
            code: 'AUTH_PROVIDER_UNSUPPORTED',
          });
        }
        if (deps.authProvider.current && deps.authProvider.current !== provider) {
          log.warn('auth provider replaced', { plugin: manifest.id });
        }
        deps.authProvider.current = provider;
        log.debug('auth provider registered', { plugin: manifest.id });
      },
    },

    jobs: {
      schedule(name) {
        // Declared jobs are rejected at boot until the scheduler exists (P6);
        // this is a guard for code that calls schedule() at runtime.
        log.warn('jobs are not scheduled by this kernel build', { name });
        return { dispose() {} };
      },
    },

    /**
     * Account-deletion cleanup.
     *
     * `register` validates the rule against this plugin's own declaration before it reaches the
     * registry, so an under-declared rule fails the plugin's `setup()` rather than deleting another
     * domain's rows.
     */
    cleanup: {
      register(rule) {
        deps.cleanup.register({ pluginId: manifest.id, rule, api: dbApi, ownedTables });
      },
      run(subject) {
        deps.cleanup.run(subject);
      },
    },

    /**
     * The kernel's audit log.
     *
     * Exists so a plugin can record an entry inside its own transaction - the pre-migration
     * `logAdminMutation` wrote `operation_logs` in the same Prisma transaction as the change it
     * described, and `events.emit` cannot reproduce that because the sink is detached.
     */
    audit: {
      record(entry) {
        if (!deps.audit) {
          throw new ApiError(500, 'this host does not expose the kernel audit log', {
            code: 'AUDIT_LOG_UNAVAILABLE',
          });
        }
        deps.audit.record(entry);
      },
      purgeFor(ids) {
        if (!deps.audit) {
          throw new ApiError(500, 'this host does not expose the kernel audit log', {
            code: 'AUDIT_LOG_UNAVAILABLE',
          });
        }
        return deps.audit.purgeFor(ids);
      },
    },

    /**
     * Database file maintenance.
     *
     * The host injects the implementation (it owns the connection lifecycle); without one the
     * accessor fails loudly rather than reporting a successful import that never happened.
     */
    maintenance: {
      exportDatabase() {
        return requireMaintenance(deps).exportDatabase();
      },
      importDatabase(uploadedFilePath: string) {
        return requireMaintenance(deps).importDatabase(uploadedFilePath);
      },
      resetDatabase() {
        return requireMaintenance(deps).resetDatabase();
      },
    },

    capabilities: {
      fs: capabilities.has('fs') ? fs : null,
      net: capabilities.has('net') ? net : null,
      childProcess: capabilities.has('child_process') ? childProcess : null,
    },

    db: dbApi,
    rawDb: deps.db,
    sessions: deps.sessions,

    provide(name, implementation) {
      deps.services.provide(manifest.slug, name, implementation);
    },

    use(name) {
      return deps.services.use(manifest.id, name);
    },

    tryUse(name) {
      return deps.services.tryUse(manifest.id, name);
    },

    onStop(callback) {
      stopCallbacks.push(callback);
    },
  };

  // Expose the stop callbacks through a non-enumerable channel so the host can run
  // them without widening the public context type.
  Object.defineProperty(context, '__stopCallbacks', { value: stopCallbacks, enumerable: false });

  return Object.freeze(context);
}

/** Stop callbacks attached to a context by `ctx.onStop()`. */
export function stopCallbacksOf(context: KernelContext): Array<() => void | Promise<void>> {
  const callbacks = (context as unknown as { __stopCallbacks?: Array<() => void | Promise<void>> }).__stopCallbacks;
  return callbacks ?? [];
}

/** Table prefix a plugin owns; re-exported for the host's bookkeeping. */
export function pluginTablePrefix(manifestSlug: string): string {
  return tablePrefixOf(manifestSlug);
}
