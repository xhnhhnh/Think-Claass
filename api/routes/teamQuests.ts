import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

// GET team quests
router.get('/', (req: Request, res: Response): void => {
  try {
    const { class_id, status } = req.query
    let query = 'SELECT * FROM team_quests WHERE 1=1'
    const params: any[] = []

    if (class_id) {
      query += ' AND class_id = ?'
      params.push(class_id)
    }
    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }
    query += ' ORDER BY created_at DESC'

    const quests = db.prepare(query).all(...params)
    res.json({ success: true, data: quests })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST create team quest
router.post('/', (req: Request, res: Response): void => {
  try {
    const { class_id, teacher_id, title, description, target_score, reward_points, start_date, end_date } = req.body
    const stmt = db.prepare(`
      INSERT INTO team_quests (class_id, teacher_id, title, description, target_score, reward_points, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const info = stmt.run(class_id, teacher_id, title, description, target_score, reward_points, start_date || null, end_date || null)
    res.json({ success: true, id: info.lastInsertRowid })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT update team quest
router.put('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params
    const { title, description, target_score, reward_points, start_date, end_date, status } = req.body
    const stmt = db.prepare(`
      UPDATE team_quests
      SET title = ?, description = ?, target_score = ?, reward_points = ?, start_date = ?, end_date = ?, status = ?
      WHERE id = ?
    `)
    stmt.run(title, description, target_score, reward_points, start_date || null, end_date || null, status || 'active', id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET team quest progress
router.get('/progress', (req: Request, res: Response): void => {
  try {
    const { quest_id, student_id } = req.query
    let query = 'SELECT * FROM team_quest_progress WHERE 1=1'
    const params: any[] = []

    if (quest_id) {
      query += ' AND quest_id = ?'
      params.push(quest_id)
    }
    if (student_id) {
      query += ' AND student_id = ?'
      params.push(student_id)
    }

    const progress = db.prepare(query).all(...params)
    res.json({ success: true, data: progress })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST add progress to team quest
router.post('/progress', (req: Request, res: Response): void => {
  try {
    const { quest_id, student_id, contribution_score } = req.body
    
    // Check if progress already exists
    const existing = db.prepare('SELECT id, contribution_score FROM team_quest_progress WHERE quest_id = ? AND student_id = ?')
                       .get(quest_id, student_id) as { id: number, contribution_score: number } | undefined

    if (existing) {
      // Update existing
      db.prepare('UPDATE team_quest_progress SET contribution_score = contribution_score + ? WHERE id = ?')
        .run(contribution_score, existing.id)
      res.json({ success: true, id: existing.id })
    } else {
      // Create new
      const stmt = db.prepare(`
        INSERT INTO team_quest_progress (quest_id, student_id, contribution_score)
        VALUES (?, ?, ?)
      `)
      const info = stmt.run(quest_id, student_id, contribution_score)
      res.json({ success: true, id: info.lastInsertRowid })
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
