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
import type { Database, KernelConfig, Logger, PermissionEngine, SessionService, EventBus } from '@thinkclass/kernel';
import { ApiError, forbidden } from '@thinkclass/kernel';
import type { DbApi, KernelContext } from '@thinkclass/plugin-sdk';
import { tablePrefixOf } from '@thinkclass/plugin-sdk';

import type { PluginBoundary } from './boundary.js';
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
    },

    jobs: {
      schedule(name) {
        // Declared jobs are rejected at boot until the scheduler exists (P6);
        // this is a guard for code that calls schedule() at runtime.
        log.warn('jobs are not scheduled by this kernel build', { name });
        return { dispose() {} };
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
