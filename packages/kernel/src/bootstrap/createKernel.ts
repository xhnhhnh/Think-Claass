/**
 * Kernel bootstrap.
 *
 * `createKernel()` assembles the minimal core and returns a ready express app. It
 * knows nothing about classes, students, pets or points: everything domain-shaped
 * arrives later as a plugin. With `pluginsEnabled: false` (the P1 default) the
 * kernel boots and serves `/api/health` plus `/api/kernel/*` with zero plugins.
 */

import fs from 'node:fs';
import path from 'node:path';

import express, { type Express } from 'express';

import { KERNEL_API_VERSION, loadConfig, type KernelConfig } from '../config/loadConfig.js';
import { createLogger, type Logger } from '../logging/logger.js';
import { createEventBus, type EventBus } from '../events/eventBus.js';
import { createPermissionEngine, type PermissionEngine } from '../permissions/permissionEngine.js';
import { createSessionService, sessionsMigration, type SessionService } from '../auth/session.js';
import type { AuthProvider } from '../auth/authProvider.js';
import { openDatabase, type Database } from '../storage/connection.js';
import { createSettingsStore, settingsMigration, type SettingsStore } from '../storage/settingsStore.js';
import {
  capabilityAssignmentsMigration,
  createSqliteAssignmentStore,
} from '../permissions/capabilityStore.js';
import {
  AUDIT_LOGS_MIGRATION_ID,
  auditLogsMigration,
  createAuditLog,
  createAuditRegistry,
  type AuditLog,
  type AuditRegistry,
} from '../logging/auditLog.js';
import { runMigrations, type Migration, type MigrationResult } from '../storage/migrations.js';
import { createErrorMiddleware } from '../http/errorEnvelope.js';
import { createRequestContextMiddleware } from '../http/requestContext.js';
import { createKernelRouter, createEmptyPluginHost, type PluginHostView } from '../http/kernelRoutes.js';

/**
 * Kernel-owned schema. Plugin migrations are appended by the plugin runtime and run
 * through the same ledger.
 *
 * Ids are ordered so that a fresh database applies them predictably; the ledger
 * means an already-migrated database simply skips what it has.
 *
 * The application's own tables are NOT here. An earlier attempt put the legacy boot
 * schema in this list so both compositions would share one definition, and guardrail G5
 * correctly rejected it: `enable_economy`, `pets`, `dungeon_runs` and the rest are domain
 * knowledge. The kernel stays domain-free and the application supplies its schema through
 * `CreateKernelOptions.migrations` - the injection point that already existed for exactly
 * this - which still gives both compositions one definition to maintain (see
 * api/schema/legacyBootSchema.ts).
 */
export const kernelMigrations: Migration[] = [
  settingsMigration,
  sessionsMigration as unknown as Migration,
  capabilityAssignmentsMigration,
  auditLogsMigration,
];

export interface Kernel {
  app: Express;
  config: KernelConfig;
  logger: Logger;
  db: Database;
  settings: SettingsStore;
  events: EventBus;
  permissions: PermissionEngine;
  sessions: SessionService;
  audit: AuditLog;
  auditRegistry: AuditRegistry;
  plugins: PluginHostView;
  migrations: MigrationResult;
  startedAt: number;
  /** Release resources. Safe to call more than once. */
  shutdown(): Promise<void>;
}

/**
 * Handed to the `mountPlugins` hook.
 *
 * The kernel deliberately does not import the plugin runtime - the runtime imports
 * the kernel, and a reverse edge would be a cycle. The application wires the two
 * together by supplying this hook, which also keeps the dependency direction
 * `apps -> plugin-runtime -> kernel` intact.
 */
export interface KernelRuntimeHooks {
  app: Express;
  db: Database;
  sessions: SessionService;
  settings: SettingsStore;
  events: EventBus;
  permissions: PermissionEngine;
  logger: Logger;
  config: KernelConfig;
}

export interface CreateKernelOptions {
  rootDir?: string;
  overrides?: Partial<KernelConfig>;
  logger?: Logger;
  /** Extra migrations (plugins) appended to the kernel set. */
  migrations?: Migration[];
  /** Replace the plugin host. P3 supplies the real runtime here. */
  pluginHost?: PluginHostView;
  /**
   * Mount plugins. Called after the kernel's own routes and before the built
   * frontend, so plugin routes can never be shadowed by a static file. Returns the
   * host view the kernel reports, or null to keep the empty one.
   */
  mountPlugins?: (hooks: KernelRuntimeHooks) => Promise<PluginHostView | null>;
  /** Use an in-memory database; used by tests. */
  inMemoryDatabase?: boolean;
  /**
   * Credential verification for the kernel's own login route.
   *
   * Since P4.3b.7 this is a *holder* rather than a value: the identity plugin implements
   * `AuthProvider` in its own repository and registers it during `setup`, which happens after this
   * kernel is built. `api/app.ts` owns the holder and hands the same object to the plugin host, so
   * the kernel router sees the registration without the kernel importing a plugin (guardrail G2).
   */
  authProvider?: { current: AuthProvider | null };
}

/**
 * The most recently created kernel.
 *
 * A migration bridge, not a design goal: `api/modules/auth/auth.service.ts` is a
 * Nest provider instantiated by a static factory, so it has no constructor seam
 * through which to receive the session service. P3 removes this by making the
 * identity plugin a real context consumer.
 */
let activeKernel: Kernel | null = null;

export function getActiveKernel(): Kernel | null {
  return activeKernel;
}

export async function createKernel(options: CreateKernelOptions = {}): Promise<Kernel> {
  const startedAt = Date.now();
  const config = loadConfig({ rootDir: options.rootDir, overrides: options.overrides });
  const logger = options.logger ?? createLogger('kernel', { level: config.logLevel });

  logger.info('kernel starting', {
    env: config.env,
    rootDir: config.rootDir,
    apiVersion: KERNEL_API_VERSION,
    pluginsEnabled: config.pluginsEnabled,
  });

  // --- storage -------------------------------------------------------------
  const db = openDatabase(options.inMemoryDatabase ? ':memory:' : config.databaseFile, {
    wal: !options.inMemoryDatabase,
    logger,
  });
  const migrations = runMigrations(db, [...kernelMigrations, ...(options.migrations ?? [])], { logger });

  // --- core services -------------------------------------------------------
  const events = createEventBus({ logger: logger.child('events') });
  // Capability assignments are persisted, so a decision made for one class scope
  // survives a restart - unlike the in-memory default used by unit tests.
  const permissions = createPermissionEngine({
    store: createSqliteAssignmentStore(db),
    logger: logger.child('permissions'),
  });
  const sessions = createSessionService({ db, logger: logger.child('sessions') });
  const settings = createSettingsStore(db);

  // Audit: a registry of declarative descriptors plus a sink. Any module or plugin
  // may add a descriptor or emit `kernel.request.audit`; the kernel persists both.
  const auditRegistry = createAuditRegistry();
  const auditLog = createAuditLog({ db, logger: logger.child('audit') });
  events.on('kernel.request.audit', (payload) => {
    auditLog.record({
      action: payload.action,
      detail: payload.detail ?? null,
      actorId: payload.actorId,
      role: payload.role,
      ip: payload.ip ?? null,
      requestId: payload.requestId ?? null,
    });
  });

  // --- plugin host ---------------------------------------------------------
  /**
   * The host is created lazily, after the kernel's own routes exist, because it
   * mounts plugin routes onto this same express app. `pluginsRef` lets the kernel
   * routes be registered first while still reporting the final plugin set.
   */
  const pluginsRef: { current: PluginHostView } = { current: options.pluginHost ?? createEmptyPluginHost() };
  const pluginsView: PluginHostView = {
    publicDescriptors: () => pluginsRef.current.publicDescriptors(),
    summary: () => pluginsRef.current.summary(),
  };

  // --- http ----------------------------------------------------------------
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(createRequestContextMiddleware({ config, sessions, logger: logger.child('auth') }));

  // Uploads only. The built frontend is served *after* plugins so that a plugin
  // route can never be shadowed by a static file or the SPA fallback.
  app.use('/uploads', express.static(config.uploadsDir));

  app.use(
    createKernelRouter({
      config,
      startedAt,
      plugins: pluginsView,
      events,
      permissions,
      sessions,
      settings,
      authProvider: options.authProvider,
    }),
  );

  const runtimeHooks: KernelRuntimeHooks = {
    app,
    db,
    sessions,
    settings,
    events,
    permissions,
    logger,
    config,
  };

  /**
   * Middleware order is load-bearing here, and two constraints pull in opposite
   * directions:
   *
   *  - the SPA fallback must be registered BEFORE the plugin host, because Nest's
   *    `init()` installs its own catch-all not-found handler which would otherwise
   *    answer every non-API path before the SPA ever sees it;
   *  - plugin routes must be reachable, which they are because the SPA handler
   *    passes `/api` through.
   *
   * The frontend is only served when a build exists, so a kernel-only deployment
   * skips both branches.
   */
  if (fs.existsSync(config.staticDir)) {
    /**
     * `index: false` is load-bearing.
     *
     * With the default settings `express.static` answers `/` from `index.html` itself, so the
     * handler below - the only place that injects `window.__TC_CONFIG__` - never ran. The
     * marker stayed a literal HTML comment in the served page and the frontend fell back to its
     * build-time defaults, which is why the admin path still had to be rewritten in the built
     * assets. Turning the automatic index off hands `/` to the handler.
     */
    app.use(express.static(config.staticDir, { index: false }));
    const indexHtml = path.join(config.staticDir, 'index.html');
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      if (!fs.existsSync(indexHtml)) return next();
      const html = fs.readFileSync(indexHtml, 'utf8').replace(
        '<!--__TC_CONFIG__-->',
        `<script>window.__TC_CONFIG__=${JSON.stringify({
          adminPath: config.adminPath,
          apiBase: '/api',
          pluginRuntime: config.pluginsEnabled,
          env: config.env,
        })}</script>`,
      );
      res.type('html').send(html);
    });
  }

  if (options.mountPlugins) {
    const host = await options.mountPlugins(runtimeHooks);
    if (host) pluginsRef.current = host;
  } else if (!config.pluginsEnabled) {
    logger.info('plugin host disabled; booting with zero plugins');
  }

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: '接口不存在', code: 'NOT_FOUND' });
  });
  app.use(
    createErrorMiddleware({
      logger: logger.child('http'),
      exposeInternalErrors: config.env !== 'production',
    }),
  );

  let closed = false;
  const shutdown = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    logger.info('kernel shutting down');
    await events.drain();
    try {
      db.close();
    } catch (error) {
      logger.warn('database close failed', { error: error instanceof Error ? error.message : String(error) });
    }
  };

  logger.info('kernel ready', {
    migrationsApplied: migrations.applied.length,
    bootMs: Date.now() - startedAt,
  });

  const kernel: Kernel = {
    app,
    config,
    logger,
    db,
    settings,
    events,
    permissions,
    sessions,
    audit: auditLog,
    auditRegistry,
    plugins: pluginsRef.current,
    migrations,
    startedAt,
    shutdown,
  };
  activeKernel = kernel;
  return kernel;
}
