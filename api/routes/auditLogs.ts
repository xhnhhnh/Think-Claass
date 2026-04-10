import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

// GET operation logs
router.get('/', (req: Request, res: Response): void => {
  try {
    const { teacher_id, user_id, action, limit = 100, offset = 0 } = req.query
    let query = 'SELECT * FROM operation_logs WHERE 1=1'
    const params: any[] = []

    if (teacher_id) {
      query += ' AND teacher_id = ?'
      params.push(teacher_id)
    }
    if (user_id) {
      query += ' AND user_id = ?'
      params.push(user_id)
    }
    if (action) {
      query += ' AND action = ?'
      params.push(action)
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), Number(offset))

    const logs = db.prepare(query).all(...params)
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM operation_logs WHERE 1=1'
    const countParams: any[] = []

    if (teacher_id) {
      countQuery += ' AND teacher_id = ?'
      countParams.push(teacher_id)
    }
    if (user_id) {
      countQuery += ' AND user_id = ?'
      countParams.push(user_id)
    }
    if (action) {
      countQuery += ' AND action = ?'
      countParams.push(action)
    }
    
    const { count } = db.prepare(countQuery).get(...countParams) as { count: number }

    res.json({ success: true, data: logs, total: count })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
