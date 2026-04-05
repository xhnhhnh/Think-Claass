import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

// GET attendance records
router.get('/', (req: Request, res: Response): void => {
  try {
    const { class_id, student_id, date } = req.query
    let query = 'SELECT * FROM attendance_records WHERE 1=1'
    const params: any[] = []

    if (class_id) {
      query += ' AND class_id = ?'
      params.push(class_id)
    }
    if (student_id) {
      query += ' AND student_id = ?'
      params.push(student_id)
    }
    if (date) {
      query += ' AND date = ?'
      params.push(date)
    }
    query += ' ORDER BY date DESC, created_at DESC'

    const records = db.prepare(query).all(...params)
    res.json({ success: true, data: records })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST create or update attendance records
router.post('/', (req: Request, res: Response): void => {
  try {
    const { class_id, records } = req.body
    // records: [{student_id, date, status, remark}, ...]
    
    const insertStmt = db.prepare(`
      INSERT INTO attendance_records (class_id, student_id, date, status, remark)
      VALUES (?, ?, ?, ?, ?)
    `)

    // We can also handle an upsert if needed, but let's just insert for now.
    // Assuming simple insert for each record.
    const transaction = db.transaction((recs: any[]) => {
      for (const rec of recs) {
        // If we want to prevent duplicates, we can delete the existing one first
        db.prepare('DELETE FROM attendance_records WHERE class_id = ? AND student_id = ? AND date = ?')
          .run(class_id, rec.student_id, rec.date)

        insertStmt.run(class_id, rec.student_id, rec.date, rec.status, rec.remark || null)
      }
    })

    transaction(records)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
