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
import authRoutes from './routes/auth.js'
import studentRoutes from './routes/student.js'
import classRoutes from './routes/class.js'
import petRoutes from './routes/pet.js'
import shopRoutes from './routes/shop.js'
import presetRoutes from './routes/presets.js'
import groupRoutes from './routes/groups.js'
import praiseRoutes from './routes/praises.js'
import adminRoutes from './routes/admin.js'
import announcementRoutes from './routes/announcements.js'
import settingsRoutes from './routes/settings.js'
import certificateRoutes from './routes/certificates.js'
import messageRoutes from './routes/messages.js'
import familyTaskRoutes from './routes/familyTasks.js'
import classAnnouncementRoutes from './routes/classAnnouncements.js'
import systemRoutes from './routes/system.js'
import luckyDrawRoutes from './routes/lucky_draw.js'
import redemptionRoutes from './routes/redemption.js'
import openapiRoutes from './routes/openapi.js'
import challengeRoutes from './routes/challenge.js'
import websiteRoutes from './routes/website.js'
import assignmentRoutes from './routes/assignments.js'
import examRoutes from './routes/exams.js'
import attendanceRoutes from './routes/attendance.js'
import leaveRoutes from './routes/leaves.js'
import teamQuestRoutes from './routes/teamQuests.js'
import peerReviewRoutes from './routes/peerReviews.js'
import auditLogRoutes from './routes/auditLogs.js'
import parentBuffRoutes from './routes/parentBuff.js'
import taskTreeRoutes from './routes/taskTree.js'
import danmakuRoutes from './routes/danmaku.js'
import battleRoutes from './routes/battles.js'
import slgRoutes from './routes/slg.js'
import gachaRoutes from './routes/gacha.js'
import economyRoutes from './routes/economy.js'
import dungeonRoutes from './routes/dungeon.js'
import { initDb } from './db.js'
import { operationLogger } from './utils/logMiddleware.js'

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

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/students', studentRoutes)
app.use('/api/classes', classRoutes)
app.use('/api/class', classRoutes) // Alias for /api/class
app.use('/api/pets', petRoutes)
app.use('/api/shop', shopRoutes)
app.use('/api/presets', presetRoutes)
app.use('/api/groups', groupRoutes)
app.use('/api/praises', praiseRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/announcements', announcementRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/certificates', certificateRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/family-tasks', familyTaskRoutes)
app.use('/api/class-announcements', classAnnouncementRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/lucky-draw', luckyDrawRoutes)
app.use('/api/redemption', redemptionRoutes)
app.use('/api/openapi', openapiRoutes)
app.use('/api/challenge', challengeRoutes)
app.use('/api/website', websiteRoutes)
app.use('/api/assignments', assignmentRoutes)
app.use('/api/exams', examRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/leaves', leaveRoutes)
app.use('/api/team-quests', teamQuestRoutes)
app.use('/api/peer-reviews', peerReviewRoutes)
app.use('/api/audit-logs', auditLogRoutes)
app.use('/api/parent-buff', parentBuffRoutes)
app.use('/api/task-tree', taskTreeRoutes)
app.use('/api/danmaku', danmakuRoutes)
app.use('/api/battles', battleRoutes)
app.use('/api/slg', slgRoutes)
app.use('/api/gacha', gachaRoutes)
app.use('/api/economy', economyRoutes)
app.use('/api/dungeon', dungeonRoutes)

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
app.use(express.static(distPath))

app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

/**
 * error handler middleware
 */
app.use(errorHandler)

export default app
