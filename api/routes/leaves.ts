import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

// GET leave requests
router.get('/', (req: Request, res: Response): void => {
  try {
    const { student_id, parent_id, status } = req.query
    let query = 'SELECT * FROM leave_requests WHERE 1=1'
    const params: any[] = []

    if (student_id) {
      query += ' AND student_id = ?'
      params.push(student_id)
    }
    if (parent_id) {
      query += ' AND parent_id = ?'
      params.push(parent_id)
    }
    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }
    query += ' ORDER BY created_at DESC'

    const records = db.prepare(query).all(...params)
    res.json({ success: true, data: records })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST create leave request
router.post('/', (req: Request, res: Response): void => {
  try {
    const { student_id, parent_id, start_date, end_date, reason } = req.body
    const stmt = db.prepare(`
      INSERT INTO leave_requests (student_id, parent_id, start_date, end_date, reason)
      VALUES (?, ?, ?, ?, ?)
    `)
    const info = stmt.run(student_id, parent_id, start_date, end_date, reason)
    res.json({ success: true, id: info.lastInsertRowid })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT approve/reject leave request
router.put('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params
    const { status, reviewer_id, review_comment } = req.body
    
    // status should be 'approved' or 'rejected'
    const stmt = db.prepare(`
      UPDATE leave_requests
      SET status = ?, reviewer_id = ?, review_comment = ?
      WHERE id = ?
    `)
    stmt.run(status, reviewer_id, review_comment || null, id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
