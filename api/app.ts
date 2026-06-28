/**
 * NestJS API server bootstrap.
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

export async function createApp(): Promise<Express> {
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
 * Keep the historical default export as an Express-compatible request handler.
 */
const app = await createApp()

export default app
