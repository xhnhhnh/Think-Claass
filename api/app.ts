/**
 * API server bootstrap.
 *
 * Two compositions coexist during the migration:
 *
 *   KERNEL_ENABLED=1  ->  the minimal kernel serves /api/health + /api/kernel/*
 *   otherwise         ->  the legacy Nest composition (14 static modules)
 *
 * In BOTH cases a kernel instance is created first, because it owns the
 * infrastructure the legacy app now depends on: configuration, logging, the event
 * bus, the permission engine and session tokens. The legacy composition mounts the
 * kernel's request-context middleware and its auth routes onto its own express
 * app, which is what turns `x-user-role` / `x-user-id` from trusted assertions into
 * a bridge that `ALLOW_LEGACY_HEADER_AUTH=0` switches off.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import {
  createKernel,
  createKernelRouter,
  createRequestContextMiddleware,
  type Kernel,
} from '@thinkclass/kernel';
import { initDb } from './db.js'
import { operationLogger } from './utils/logMiddleware.js'
import { AppModule } from './app.module.js';
import { createLegacyAuthProvider } from './modules/auth/legacyAuthProvider.js';

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function registerStaticAssets(server: Express) {
  const distPath = path.join(__dirname, '../dist')

  server.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))
  server.use(express.static(distPath))

  server.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      next()
      return
    }

    res.sendFile(path.join(distPath, 'index.html'))
  })
}

/** True when the minimal kernel composition should be used. */
export function isKernelEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(String(env.KERNEL_ENABLED ?? '').trim())
}

/** The kernel instance created for this process. */
let bootedKernel: Kernel | null = null;

export function getKernel(): Kernel | null {
  return bootedKernel;
}

/**
 * Mount the kernel-owned infrastructure that the legacy composition relies on.
 *
 * Identity resolution must run before any route so that `getRequestActor()` sees a
 * verified actor rather than raw headers.
 */
function mountKernelInfrastructure(server: Express, kernel: Kernel): void {
  server.use(
    createRequestContextMiddleware({
      config: kernel.config,
      sessions: kernel.sessions,
      logger: kernel.logger.child('auth'),
    }),
  );
  server.use(
    createKernelRouter({
      config: kernel.config,
      startedAt: kernel.startedAt,
      plugins: kernel.plugins,
      events: kernel.events,
      permissions: kernel.permissions,
      sessions: kernel.sessions,
      authProvider: createLegacyAuthProvider(),
    }),
  );
}

/**
 * Legacy composition: Nest assembled from 14 statically imported modules, reading
 * the raw better-sqlite3 layer in `api/db.ts`.
 */
export async function createLegacyApp(kernel: Kernel): Promise<Express> {
  // Initialise the legacy schema (business tables) via the historical boot DDL.
  initDb()

  const server: Express = express()
  const nest = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    {
      bodyParser: false,
      // Nest otherwise calls process.exit(1) on a boot failure, which hides the
      // cause entirely (spike R10, finding 3).
      abortOnError: false,
    },
  )

  nest.enableCors()

  server.use(express.json({ limit: '10mb' }))
  server.use(express.urlencoded({ extended: true, limit: '10mb' }))

  mountKernelInfrastructure(server, kernel)

  // 注入操作日志中间件
  server.use(operationLogger)

  registerStaticAssets(server)

  await nest.init()

  return server
}

/** Kernel composition: the minimal core with zero plugins. */
export async function createKernelApp(): Promise<Express> {
  return (bootedKernel as Kernel).app
}

export async function createApp(): Promise<Express> {
  dotenv.config()

  // One kernel per process, whichever composition is selected.
  bootedKernel = await createKernel({ authProvider: createLegacyAuthProvider() })

  if (isKernelEnabled()) {
    return createKernelApp()
  }
  return createLegacyApp(bootedKernel)
}

/**
 * Keep the historical default export as an Express-compatible request handler.
 */
const app = await createApp()

export default app
