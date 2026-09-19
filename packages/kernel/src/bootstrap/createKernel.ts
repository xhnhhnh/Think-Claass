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
import { openDatabase, type Database } from '../storage/connection.js';
import { runMigrations, type Migration, type MigrationResult } from '../storage/migrations.js';
import { createErrorMiddleware } from '../http/errorEnvelope.js';
import { createRequestContextMiddleware } from '../http/requestContext.js';
import { createKernelRouter, createEmptyPluginHost, type PluginHostView } from '../http/kernelRoutes.js';

/**
 * Kernel-owned schema. Plugin migrations are appended by the plugin runtime in P3
 * and run through the same ledger.
 */
export const kernelMigrations: Migration[] = [sessionsMigration as unknown as Migration];

export interface Kernel {
  app: Express;
  config: KernelConfig;
  logger: Logger;
  db: Database;
  events: EventBus;
  permissions: PermissionEngine;
  sessions: SessionService;
  plugins: PluginHostView;
  migrations: MigrationResult;
  startedAt: number;
  /** Release resources. Safe to call more than once. */
  shutdown(): Promise<void>;
}

export interface CreateKernelOptions {
  rootDir?: string;
  overrides?: Partial<KernelConfig>;
  logger?: Logger;
  /** Extra migrations (plugins) appended to the kernel set. */
  migrations?: Migration[];
  /** Replace the plugin host. P3 supplies the real runtime here. */
  pluginHost?: PluginHostView;
  /** Use an in-memory database; used by tests. */
  inMemoryDatabase?: boolean;
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
  const permissions = createPermissionEngine({ logger: logger.child('permissions') });
  const sessions = createSessionService({ db, logger: logger.child('sessions') });

  // --- plugin host ---------------------------------------------------------
  const plugins = options.pluginHost ?? createEmptyPluginHost();
  if (!config.pluginsEnabled && options.pluginHost === undefined) {
    logger.info('plugin host disabled; booting with zero plugins');
  }

  // --- http ----------------------------------------------------------------
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(createRequestContextMiddleware({ config, sessions, logger: logger.child('auth') }));

  // Serve uploads and the built frontend when present. The admin base path is
  // injected into index.html at request time, replacing the install-time
  // `sed -i "s|/beiadmin|...|g"` rewrite of built assets.
  app.use('/uploads', express.static(config.uploadsDir));
  if (fs.existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir));
  }

  app.use(createKernelRouter({ config, startedAt, plugins, events, permissions, sessions }));

  // SPA fallback for anything that is not an API route and not a real file.
  if (fs.existsSync(config.staticDir)) {
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

  return { app, config, logger, db, events, permissions, sessions, plugins, migrations, startedAt, shutdown };
}
