/**
 * The plugin host.
 *
 * Orchestrates the full boot sequence:
 *
 *   discover -> resolve -> check required -> migrate -> import -> setup
 *            -> assemble routes -> onStart -> record
 *
 * Two decisions are worth stating explicitly, because both are consequences of
 * spike R10 rather than preferences:
 *
 *   - **The plugin set is an input to boot.** NestJS can assemble controllers from
 *     a runtime-built module graph, but `container.addModule()` registers no
 *     controllers and there is no public removal path. So install / enable /
 *     disable / uninstall re-resolve the graph and restart, instead of mutating a
 *     running router.
 *   - **A `required` plugin that cannot activate fails the boot.** A foundation
 *     plugin is not optional by definition; starting without it would produce a
 *     process that accepts traffic and then fails every request.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Module, type ArgumentsHost, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Express, Response as ExpressResponse } from 'express';

import type { PluginManifest, PublicPluginDescriptor } from '@thinkclass/contracts';
import type { Database, EventBus, KernelConfig, Logger, PermissionEngine, SessionService } from '@thinkclass/kernel';
import { KERNEL_API_VERSION, renderError, runMigrations } from '@thinkclass/kernel';
import {
  PLUGIN_CONTEXT,
  PLUGIN_MANIFEST,
  isPluginDefinition,
  type KernelContext,
  type PluginDefinition,
} from '@thinkclass/plugin-sdk';

import { createPluginBoundary, type PluginBoundary, type PluginHealthSnapshot } from './boundary.js';
import { createPluginContext, stopCallbacksOf, type MountedRouter } from './contextFactory.js';
import { discoverPlugins, type DiscoveredPlugin, type RejectedPlugin } from './discovery.js';
import { describeViolations, runPluginMigrations, type PluginMigrationOutcome } from './migrationRunner.js';
import { missingRequiredPlugins, resolvePlugins } from './resolver.js';
import { createServiceRegistry, type ServiceRegistry } from './serviceRegistry.js';
import { createPluginStateStore, hashManifest, pluginsMigration, type PluginStateStore } from './stateStore.js';

export interface PluginHostOptions {
  app: Express;
  db: Database;
  sessions: SessionService;
  events: EventBus;
  permissions: PermissionEngine;
  logger: Logger;
  config: KernelConfig;
  /** Extra directories to scan, appended to config.pluginDirs. */
  pluginDirs?: string[];
  /** Plugin ids to skip. */
  disabled?: Iterable<string>;
}

export interface ActivePlugin {
  manifest: PluginManifest;
  directory: string;
  context: KernelContext;
  definition: PluginDefinition;
}

export interface PluginRejection {
  id: string;
  reason: string;
  detail: string;
}

export interface PluginHost {
  /** Plugins that started, in activation order. */
  active: ActivePlugin[];
  rejected: RejectedPlugin[];
  /** Human-readable reasons for plugins that did not activate. */
  rejections: PluginRejection[];
  migrationOutcomes: PluginMigrationOutcome[];
  services: ServiceRegistry;
  boundary: PluginBoundary;
  stateStore: PluginStateStore;
  health(): PluginHealthSnapshot[];
  /** Projection the frontend consumes. */
  publicDescriptors(): PublicPluginDescriptor[];
  summary(): { total: number; active: number; degraded: number };
  stop(): Promise<void>;
}

/** Declarations this kernel build cannot honour. Fail closed rather than ignore. */
function unsupportedDeclarations(manifest: PluginManifest): string[] {
  const problems: string[] = [];
  if ((manifest.provides?.jobs ?? []).length > 0) {
    problems.push('declares scheduled jobs, but this kernel build has no job scheduler');
  }
  if ((manifest.data.capabilities ?? []).includes('child_process') && manifest.isolation !== 'worker') {
    problems.push('requests the child_process capability, which requires isolation level "worker"');
  }
  return problems;
}

async function importBackendModule(plugin: DiscoveredPlugin): Promise<unknown> {
  const entry = plugin.manifest.entry.backend;
  if (!entry) throw new Error(`plugin "${plugin.manifest.id}" declares no backend entry`);

  const absolute = path.resolve(plugin.directory, entry);
  if (!absolute.startsWith(plugin.directory)) {
    throw new Error(`plugin "${plugin.manifest.id}" backend entry escapes its directory`);
  }

  const module = (await import(pathToFileURL(absolute).href)) as Record<string, unknown>;
  return module.default ?? module.plugin ?? module;
}

/** Manifest details for a state-store row. */
function describe(plugin: DiscoveredPlugin) {
  return {
    id: plugin.manifest.id,
    version: plugin.manifest.version,
    tier: plugin.manifest.tier,
    required: plugin.manifest.required,
    directory: plugin.directory,
  };
}

// ---------------------------------------------------------------------------

export async function createPluginHost(options: PluginHostOptions): Promise<PluginHost> {
  const { app, db, sessions, events, permissions, logger, config } = options;
  const strict = config.env !== 'production';

  // The runtime owns its own bookkeeping table, so it migrates it through the same
  // versioned runner the plugins use rather than assuming it exists.
  runMigrations(db, [pluginsMigration], { logger: logger.child('migrations') });

  const stateStore = createPluginStateStore(db);
  const services = createServiceRegistry(logger.child('services'));
  const boundary = createPluginBoundary({
    logger: logger.child('boundary'),
    onDegrade: (snapshot) => {
      stateStore.setState(snapshot.pluginId, 'degraded', snapshot.lastError);
      events.emit(
        'kernel.plugin.degraded',
        {
          pluginId: snapshot.pluginId,
          errorCount: snapshot.errors,
          windowSize: snapshot.windowSize,
          lastError: snapshot.lastError ?? '',
        },
        { source: 'kernel' },
      );
    },
  });

  /**
   * Deduplicate the scan list.
   *
   * `config.pluginDirs` already defaults to `<root>/plugins,<root>/plugins-ext`, so
   * appending an explicit directory would scan the same tree twice and every plugin
   * would be rejected as a duplicate id - which is exactly what happened the first
   * time this ran end to end. Resolving first also catches the same directory
   * reached through a different spelling.
   */
  const dirs = [...new Set([...config.pluginDirs, ...(options.pluginDirs ?? [])].map((dir) => path.resolve(dir)))];
  const discovery = discoverPlugins({ dirs, kernelApiVersion: KERNEL_API_VERSION, logger });

  const rejections: PluginRejection[] = [];

  // Manifests that failed validation never reach resolution, but they must still be
  // reported - a plugin that silently disappears is the hardest kind to debug.
  for (const rejected of discovery.rejected) {
    if (!rejected.manifestId) continue;
    rejections.push({
      id: rejected.manifestId,
      reason: 'invalid-manifest',
      detail: rejected.fatal ?? rejected.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
    });
  }

  if (discovery.discovered.length === 0 && discovery.rejected.length === 0) {
    logger.info('no plugins found', { dirs: dirs.filter((d) => d) });
    return buildHost({ active: [], rejected: [], rejections, migrationOutcomes: [], services, boundary, stateStore });
  }

  // -- resolution ----------------------------------------------------------
  const resolution = resolvePlugins(discovery.discovered, {
    kernelApiVersion: KERNEL_API_VERSION,
    disabled: options.disabled,
  });
  for (const rejection of resolution.rejected) {
    rejections.push({ id: rejection.id, reason: rejection.reason, detail: rejection.detail });
  }

  // -- required plugins must be satisfiable ---------------------------------
  const missingRequired = missingRequiredPlugins(discovery.discovered, resolution);
  if (missingRequired.length > 0) {
    const detail = missingRequired.map((entry) => `${entry.id} (${entry.reason})`).join(', ');
    throw new Error(`required plugins could not be activated: ${detail}`);
  }

  // -- migrations ----------------------------------------------------------
  const migrationOutcomes: PluginMigrationOutcome[] = [];
  const migrationsFailed = new Set<string>();
  for (const plugin of resolution.active) {
    const outcome = runPluginMigrations({ db, plugin, logger: logger.child('migrations') });
    migrationOutcomes.push(outcome);
    if (outcome.error || outcome.violations.length > 0) migrationsFailed.add(plugin.manifest.id);
  }
  const violationLines = describeViolations(migrationOutcomes.filter((o) => o.violations.length > 0));
  if (violationLines.length > 0) {
    logger.error('plugin migrations rejected for table-ownership violations', { violations: violationLines });
  }

  // -- import, setup --------------------------------------------------------
  const active: ActivePlugin[] = [];
  const mountedRouters: MountedRouter[] = [];

  for (const plugin of resolution.active) {
    const { manifest } = plugin;
    const manifestHash = hashManifest(manifest);

    const fail = (state: string, reason: string, detail: string): void => {
      rejections.push({ id: manifest.id, reason, detail });
      stateStore.record({ ...describe(plugin), state, reason: detail, manifestHash });
      boundary.setState(manifest.id, state);
    };

    if (migrationsFailed.has(manifest.id)) {
      fail('failed', 'migration', 'schema migration was rejected or failed; see the migration report');
      continue;
    }

    const unsupported = unsupportedDeclarations(manifest);
    if (unsupported.length > 0) {
      fail('invalid', 'unsupported', unsupported.join('; '));
      continue;
    }

    let definition: unknown;
    try {
      definition = await importBackendModule(plugin);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error('plugin backend failed to import', { pluginId: manifest.id, error: detail });
      fail('failed', 'import-failed', detail);
      continue;
    }

    if (!isPluginDefinition(definition)) {
      fail(
        'invalid',
        'invalid-definition',
        'backend module did not export a definePlugin() result; export it as `export default definePlugin({...})`',
      );
      continue;
    }

    const context = createPluginContext(plugin, {
      db,
      sessions,
      events,
      permissions,
      services,
      boundary,
      logger,
      config,
      mountedRouters,
      strict,
    });

    // Permissions before setup: a plugin's own setup may check them, and the
    // catalogue should be complete before any request is served.
    if ((manifest.provides?.permissions ?? []).length > 0) {
      permissions.register(manifest.provides.permissions ?? [], manifest.id);
    }

    if (definition.setup) {
      const outcome = await boundary.run(manifest.id, 'setup', async () => definition.setup?.(context));
      if (!outcome.ok) {
        services.revoke(manifest.slug);
        permissions.unregister(manifest.id);
        fail('failed', 'setup-failed', outcome.error);
        continue;
      }
    }

    active.push({ manifest, directory: plugin.directory, context, definition });
    boundary.setState(manifest.id, 'enabled');
    stateStore.record({ ...describe(plugin), state: 'enabled', manifestHash });
  }

  // -- assemble HTTP surface -----------------------------------------------
  // Express routers mount before Nest so they sit ahead of Nest's not-found handler.
  for (const entry of mountedRouters) {
    app.use(entry.base, entry.router as never);
    for (const compat of entry.compat) app.use(compat, entry.router as never);
    logger.debug('plugin router mounted', { pluginId: entry.pluginId, base: entry.base });
  }
  await mountPluginControllers(app, active, logger);

  // -- onStart --------------------------------------------------------------
  for (const entry of active) {
    if (entry.definition.onStart) {
      await boundary.run(entry.manifest.id, 'onStart', async () => entry.definition.onStart?.(entry.context));
    }
    boundary.setState(entry.manifest.id, 'active');
    stateStore.setState(entry.manifest.id, 'active');
    logger.info('plugin activated', { pluginId: entry.manifest.id, version: entry.manifest.version });
  }

  // -- bookkeeping ----------------------------------------------------------
  stateStore.prune(discovery.discovered.map((p) => p.manifest.id));

  logger.info('plugin host ready', {
    discovered: discovery.discovered.length,
    active: active.length,
    rejected: rejections.length,
  });

  return buildHost({ active, rejected: discovery.rejected, rejections, migrationOutcomes, services, boundary, stateStore });
}

/**
 * Build one Nest module per plugin and mount them together.
 *
 * The `Module()` decorator is side-effecting and returns `undefined`, so the class
 * is kept in a variable - using the decorator's return value yields `undefined` and
 * surfaces much later as an unrelated TypeError inside Nest's scanner (spike R10).
 */
async function mountPluginControllers(app: Express, active: ActivePlugin[], logger: Logger): Promise<void> {
  const pluginModules: Type<unknown>[] = [];

  for (const entry of active) {
    const controllers = entry.definition.controllers ?? [];
    const providers = entry.definition.providers ?? [];
    if (controllers.length === 0 && providers.length === 0) continue;

    const ModuleClass = class {};
    Object.defineProperty(ModuleClass, 'name', { value: `${entry.manifest.slug}_plugin_module` });
    Module({
      controllers,
      providers: [
        ...providers,
        // The only channel through which plugin code reaches the kernel.
        { provide: PLUGIN_CONTEXT, useValue: entry.context },
        { provide: PLUGIN_MANIFEST, useValue: entry.manifest },
      ],
    })(ModuleClass); // side effect only - returns undefined
    pluginModules.push(ModuleClass);
  }

  if (pluginModules.length === 0) return;

  const RootModule = class {};
  Object.defineProperty(RootModule, 'name', { value: 'thinkclass_plugins_root' });
  Module({ imports: pluginModules })(RootModule); // side effect only

  const nest = await NestFactory.create(RootModule, new ExpressAdapter(app), {
    bodyParser: false,
    logger: false,
    // Nest otherwise calls process.exit(1) and hides the cause (spike R10).
    abortOnError: false,
  });

  /**
   * Render plugin errors through the kernel's envelope.
   *
   * Nest's default filter duck-types any error carrying `status`, so a plugin that
   * throws the kernel's `ApiError` already got the right HTTP status - but Nest's
   * own `{ statusCode, message }` shape, which dropped the `code` field and
   * diverged from every non-plugin endpoint. One error shape for the whole system
   * is worth a filter.
   */
  nest.useGlobalFilters({
    catch(exception: unknown, host: ArgumentsHost) {
      const response = host.switchToHttp().getResponse<ExpressResponse>();
      const { status, body } = renderError(exception);
      if (response.headersSent) return;
      response.status(status).json(body);
    },
  });

  await nest.init();
  logger.info('plugin controllers mounted', { modules: pluginModules.length });
}

interface BuildHostInput {
  active: ActivePlugin[];
  rejected: RejectedPlugin[];
  rejections: PluginRejection[];
  migrationOutcomes: PluginMigrationOutcome[];
  services: ServiceRegistry;
  boundary: PluginBoundary;
  stateStore: PluginStateStore;
}

function buildHost(input: BuildHostInput): PluginHost {
  const { active, rejected, rejections, migrationOutcomes, services, boundary, stateStore } = input;

  return {
    active,
    rejected,
    rejections,
    migrationOutcomes,
    services,
    boundary,
    stateStore,

    health: () => boundary.snapshot(),

    publicDescriptors(): PublicPluginDescriptor[] {
      return active.map((entry) => ({
        id: entry.manifest.id,
        name: entry.manifest.name,
        version: entry.manifest.version,
        frontend: entry.manifest.provides?.frontend ?? {},
        permissions: (entry.manifest.provides?.permissions ?? []).map((permission) => permission.key),
      }));
    },

    summary() {
      const health = boundary.snapshot();
      return {
        total: active.length + rejections.length,
        active: health.filter((h) => h.state === 'active').length,
        degraded: health.filter((h) => h.degraded).length,
      };
    },

    async stop() {
      for (const entry of [...active].reverse()) {
        const callbacks = stopCallbacksOf(entry.context);
        if (entry.definition.onStop) {
          await boundary.run(entry.manifest.id, 'onStop', async () => entry.definition.onStop?.(entry.context));
        }
        await boundary.run(entry.manifest.id, 'stopCallbacks', async () => {
          for (const callback of callbacks) await callback();
        });
        services.revoke(entry.manifest.slug);
        boundary.setState(entry.manifest.id, 'disabled');
        stateStore.setState(entry.manifest.id, 'disabled');
      }
    },
  };
}
