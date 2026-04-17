/**
 * This is a API server
 */

import { errorHandler } from './utils/errorHandler.js';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { initDb } from './db.js'
import { operationLogger } from './utils/logMiddleware.js'
import { registerApiRoutes } from './routes/registerModules.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

// Initialize database
initDb()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 注入操作日志中间件
app.use(operationLogger)

registerApiRoutes(app)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * Serve static files from the React app
 */
const distPath = path.join(__dirname, '../dist')
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))
app.use(express.static(distPath))

app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

/**
 * error handler middleware
 */
app.use(errorHandler)

export default app
