import { Router, type Request, type Response } from 'express'
import db, { decrypt } from '../db.js'
import { asyncHandler, ApiError } from '../utils/asyncHandler.js'

const router = Router()

// GET team quests
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { class_id, status } = req.query
    let query = 'SELECT * FROM team_quests WHERE 1=1'
    const params: any[] = []

    if (class_id !== undefined) {
      const classIdNum = Number(class_id)
      if (!Number.isFinite(classIdNum)) {
        throw new ApiError(400, 'Invalid class_id')
      }
      query += ' AND class_id = ?'
      params.push(classIdNum)
    }
    if (status !== undefined) {
      if (status !== 'active' && status !== 'completed') {
        throw new ApiError(400, 'Invalid status')
      }
      query += ' AND status = ?'
      params.push(status)
    }
    query += ' ORDER BY created_at DESC'

    const quests = db.prepare(query).all(...params)
    res.json({ success: true, data: quests })
  }),
)

// POST create team quest
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { class_id, teacher_id, title, description, target_score, reward_points, start_date, end_date } = req.body ?? {}

    const classIdNum = Number(class_id)
    const teacherIdNum = Number(teacher_id)
    const targetScoreNum = Number(target_score)
    const rewardPointsNum = Number(reward_points)

    if (!Number.isFinite(classIdNum)) throw new ApiError(400, 'Missing or invalid class_id')
    if (!Number.isFinite(teacherIdNum)) throw new ApiError(400, 'Missing or invalid teacher_id')
    if (!title || typeof title !== 'string') throw new ApiError(400, 'Missing title')
    if (!Number.isFinite(targetScoreNum) || targetScoreNum <= 0) throw new ApiError(400, 'Missing or invalid target_score')
    if (!Number.isFinite(rewardPointsNum) || rewardPointsNum <= 0) throw new ApiError(400, 'Missing or invalid reward_points')

    const stmt = db.prepare(`
      INSERT INTO team_quests (class_id, teacher_id, title, description, target_score, reward_points, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const info = stmt.run(
      classIdNum,
      teacherIdNum,
      title,
      typeof description === 'string' ? description : null,
      targetScoreNum,
      rewardPointsNum,
      start_date || null,
      end_date || null,
    )
    res.json({ success: true, id: info.lastInsertRowid })
  }),
)

// PUT update team quest
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idNum = Number(req.params.id)
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id')

    const { title, description, target_score, reward_points, start_date, end_date, status } = req.body ?? {}

    const existing = db.prepare('SELECT id FROM team_quests WHERE id = ?').get(idNum)
    if (!existing) throw new ApiError(404, 'Team quest not found')

    const targetScoreNum = target_score !== undefined ? Number(target_score) : undefined
    const rewardPointsNum = reward_points !== undefined ? Number(reward_points) : undefined

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) throw new ApiError(400, 'Invalid title')
    if (targetScoreNum !== undefined && (!Number.isFinite(targetScoreNum) || targetScoreNum <= 0)) {
      throw new ApiError(400, 'Invalid target_score')
    }
    if (rewardPointsNum !== undefined && (!Number.isFinite(rewardPointsNum) || rewardPointsNum <= 0)) {
      throw new ApiError(400, 'Invalid reward_points')
    }
    if (status !== undefined && status !== 'active' && status !== 'completed') throw new ApiError(400, 'Invalid status')

    const row = db
      .prepare('SELECT title, description, target_score, reward_points, start_date, end_date, status FROM team_quests WHERE id = ?')
      .get(idNum) as any

    db.prepare(
      `
      UPDATE team_quests
      SET title = ?, description = ?, target_score = ?, reward_points = ?, start_date = ?, end_date = ?, status = ?
      WHERE id = ?
    `,
    ).run(
      title ?? row.title,
      description ?? row.description,
      targetScoreNum ?? row.target_score,
      rewardPointsNum ?? row.reward_points,
      start_date ?? row.start_date,
      end_date ?? row.end_date,
      status ?? row.status,
      idNum,
    )

    res.json({ success: true })
  }),
)

// DELETE team quest
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idNum = Number(req.params.id)
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id')

    const existing = db.prepare('SELECT id FROM team_quests WHERE id = ?').get(idNum)
    if (!existing) throw new ApiError(404, 'Team quest not found')

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM team_quest_progress WHERE quest_id = ?').run(idNum)
      db.prepare('DELETE FROM team_quests WHERE id = ?').run(idNum)
    })
    tx()

    res.json({ success: true })
  }),
)

// GET team quest progress
router.get(
  '/progress',
  asyncHandler(async (req: Request, res: Response) => {
    const { quest_id, student_id } = req.query
    let query = 'SELECT * FROM team_quest_progress WHERE 1=1'
    const params: any[] = []

    if (quest_id !== undefined) {
      const questIdNum = Number(quest_id)
      if (!Number.isFinite(questIdNum)) throw new ApiError(400, 'Invalid quest_id')
      query += ' AND quest_id = ?'
      params.push(questIdNum)
    }
    if (student_id !== undefined) {
      const studentIdNum = Number(student_id)
      if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Invalid student_id')
      query += ' AND student_id = ?'
      params.push(studentIdNum)
    }

    const progress = db.prepare(query).all(...params)
    res.json({ success: true, data: progress })
  }),
)

// GET team quest progress aggregated by group (teacher view)
router.get(
  '/progress/groups',
  asyncHandler(async (req: Request, res: Response) => {
    const { quest_id, class_id } = req.query
    const questIdNum = Number(quest_id)
    const classIdNum = Number(class_id)
    if (!Number.isFinite(questIdNum)) throw new ApiError(400, 'Invalid quest_id')
    if (!Number.isFinite(classIdNum)) throw new ApiError(400, 'Invalid class_id')

    const quest = db.prepare('SELECT id, target_score FROM team_quests WHERE id = ? AND class_id = ?').get(questIdNum, classIdNum) as
      | { id: number; target_score: number }
      | undefined
    if (!quest) throw new ApiError(404, 'Team quest not found')

    const rows = db
      .prepare(
        `
        SELECT
          s.group_id as group_id,
          g.name as group_name,
          COALESCE(SUM(p.contribution_score), 0) as contribution_score
        FROM students s
        LEFT JOIN student_groups g ON g.id = s.group_id
        LEFT JOIN team_quest_progress p ON p.student_id = s.id AND p.quest_id = ?
        WHERE s.class_id = ?
        GROUP BY s.group_id, g.name
        ORDER BY g.name ASC
      `,
      )
      .all(questIdNum, classIdNum) as any[]

    const groups = rows.map((r) => ({
      group_id: r.group_id ?? null,
      group_name: r.group_name ?? '未分组',
      contribution_score: Number(r.contribution_score) || 0,
      target_score: quest.target_score,
    }))

    res.json({ success: true, data: groups })
  }),
)

// GET current active quest for a student (student view)
router.get(
  '/student/current',
  asyncHandler(async (req: Request, res: Response) => {
    const { student_id } = req.query
    const studentIdNum = Number(student_id)
    if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Invalid student_id')

    const student = db.prepare('SELECT id, class_id, group_id FROM students WHERE id = ?').get(studentIdNum) as
      | { id: number; class_id: number; group_id: number | null }
      | undefined
    if (!student) throw new ApiError(404, 'Student not found')

    const quest = db
      .prepare("SELECT * FROM team_quests WHERE class_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
      .get(student.class_id) as any
    if (!quest) {
      res.json({ success: true, quest: null })
      return
    }

    let members: any[] = []
    if (student.group_id) {
      members = db
        .prepare('SELECT id, name FROM students WHERE class_id = ? AND group_id = ? ORDER BY id ASC')
        .all(student.class_id, student.group_id)
        .map((m: any) => ({ id: m.id, name: decrypt(m.name) }))
    } else {
      members = db
        .prepare('SELECT id, name FROM students WHERE class_id = ? ORDER BY id ASC')
        .all(student.class_id)
        .map((m: any) => ({ id: m.id, name: decrypt(m.name) }))
    }

    const myProgress = db
      .prepare('SELECT contribution_score FROM team_quest_progress WHERE quest_id = ? AND student_id = ?')
      .get(quest.id, studentIdNum) as { contribution_score: number } | undefined

    const groupProgress = student.group_id
      ? (db
          .prepare(
            `
          SELECT COALESCE(SUM(p.contribution_score), 0) as contribution_score
          FROM students s
          LEFT JOIN team_quest_progress p ON p.student_id = s.id AND p.quest_id = ?
          WHERE s.class_id = ? AND s.group_id = ?
        `,
          )
          .get(quest.id, student.class_id, student.group_id) as { contribution_score: number })
      : (db
          .prepare(
            `
          SELECT COALESCE(SUM(p.contribution_score), 0) as contribution_score
          FROM students s
          LEFT JOIN team_quest_progress p ON p.student_id = s.id AND p.quest_id = ?
          WHERE s.class_id = ?
        `,
          )
          .get(quest.id, student.class_id) as { contribution_score: number })

    res.json({
      success: true,
      quest,
      team: {
        class_id: student.class_id,
        group_id: student.group_id ?? null,
        members,
      },
      progress: {
        my_contribution_score: myProgress?.contribution_score ?? 0,
        team_contribution_score: groupProgress?.contribution_score ?? 0,
      },
    })
  }),
)

// POST add progress to team quest
router.post(
  '/progress',
  asyncHandler(async (req: Request, res: Response) => {
    const { quest_id, student_id, contribution_score } = req.body ?? {}

    const questIdNum = Number(quest_id)
    const studentIdNum = Number(student_id)
    const scoreNum = Number(contribution_score)

    if (!Number.isFinite(questIdNum)) throw new ApiError(400, 'Missing or invalid quest_id')
    if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Missing or invalid student_id')
    if (!Number.isFinite(scoreNum) || scoreNum <= 0) throw new ApiError(400, 'Missing or invalid contribution_score')

    const quest = db.prepare('SELECT id FROM team_quests WHERE id = ?').get(questIdNum)
    if (!quest) throw new ApiError(404, 'Team quest not found')

    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentIdNum)
    if (!student) throw new ApiError(404, 'Student not found')

    const existing = db
      .prepare('SELECT id, contribution_score FROM team_quest_progress WHERE quest_id = ? AND student_id = ?')
      .get(questIdNum, studentIdNum) as { id: number; contribution_score: number } | undefined

    if (existing) {
      db.prepare('UPDATE team_quest_progress SET contribution_score = contribution_score + ? WHERE id = ?').run(scoreNum, existing.id)
      res.json({ success: true, id: existing.id })
      return
    }

    const stmt = db.prepare(`
        INSERT INTO team_quest_progress (quest_id, student_id, contribution_score)
        VALUES (?, ?, ?)
      `)
    const info = stmt.run(questIdNum, studentIdNum, scoreNum)
    res.json({ success: true, id: info.lastInsertRowid })
  }),
)

export default router
