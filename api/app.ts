/**
 * API server bootstrap.
 *
 * Two compositions coexist during the migration:
 *
 *   KERNEL_ENABLED=1  ->  the minimal kernel boots and serves only
 *                         /api/health + /api/kernel/*  (zero plugins)
 *   otherwise         ->  the legacy Nest composition (14 static modules)
 *
 * Keeping both behind one switch is what allows the refactor to land phase by
 * phase without a flag day: the legacy path stays the rollback target for every
 * later phase until P4 has moved all modules into plugins.
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
import { initDb } from './db.js'
import { operationLogger } from './utils/logMiddleware.js'
import { AppModule } from './app.module.js';
import { createKernel, type Kernel } from '@thinkclass/kernel';

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

/** The kernel instance when the kernel composition is active. */
let activeKernel: Kernel | null = null;

export function getActiveKernel(): Kernel | null {
  return activeKernel;
}

/**
 * Legacy composition: Nest assembled from 14 statically imported modules, reading
 * the raw better-sqlite3 layer in `api/db.ts`.
 */
export async function createLegacyApp(): Promise<Express> {
  // load env
  dotenv.config()

  // Initialize database
  initDb()

  const server: Express = express()
  const nest = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
    { bodyParser: false },
  )

  nest.enableCors()

  server.use(express.json({ limit: '10mb' }))
  server.use(express.urlencoded({ extended: true, limit: '10mb' }))

  // 注入操作日志中间件
  server.use(operationLogger)

  registerStaticAssets(server)

  await nest.init()

  return server
}

/**
 * Kernel composition: the minimal core with zero plugins.
 *
 * Deferred import keeps `@nestjs/*` out of the kernel's dependency graph when the
 * kernel path is used.
 */
export async function createKernelApp(): Promise<Express> {
  dotenv.config()
  activeKernel = await createKernel();
  return activeKernel.app;
}

export async function createApp(): Promise<Express> {
  if (isKernelEnabled()) {
    return createKernelApp();
  }
  return createLegacyApp();
}

/**
 * Keep the historical default export as an Express-compatible request handler.
 */
const app = await createApp()

export default app
