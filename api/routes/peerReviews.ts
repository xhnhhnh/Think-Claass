import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

// GET peer reviews
router.get('/', (req: Request, res: Response): void => {
  try {
    const { reviewer_id, reviewee_id, assignment_id } = req.query
    let query = 'SELECT * FROM peer_reviews WHERE 1=1'
    const params: any[] = []

    if (reviewer_id) {
      query += ' AND reviewer_id = ?'
      params.push(reviewer_id)
    }
    if (reviewee_id) {
      query += ' AND reviewee_id = ?'
      params.push(reviewee_id)
    }
    if (assignment_id) {
      query += ' AND assignment_id = ?'
      params.push(assignment_id)
    }
    query += ' ORDER BY created_at DESC'

    const reviews = db.prepare(query).all(...params)
    res.json({ success: true, data: reviews })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST create peer review
router.post('/', (req: Request, res: Response): void => {
  try {
    const { reviewer_id, reviewee_id, assignment_id, score, comment } = req.body
    const stmt = db.prepare(`
      INSERT INTO peer_reviews (reviewer_id, reviewee_id, assignment_id, score, comment)
      VALUES (?, ?, ?, ?, ?)
    `)
    const info = stmt.run(reviewer_id, reviewee_id, assignment_id || null, score, comment || null)
    res.json({ success: true, id: info.lastInsertRowid })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
