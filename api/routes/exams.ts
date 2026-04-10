import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

// GET all exams
router.get('/', (req: Request, res: Response): void => {
  try {
    const { class_id } = req.query
    let query = 'SELECT * FROM exams'
    const params: any[] = []

    if (class_id) {
      query += ' WHERE class_id = ?'
      params.push(class_id)
    }
    query += ' ORDER BY created_at DESC'

    const exams = db.prepare(query).all(...params)
    res.json({ success: true, data: exams })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST create exam
router.post('/', (req: Request, res: Response): void => {
  try {
    const { class_id, teacher_id, title, description, exam_date, total_score } = req.body
    const stmt = db.prepare(`
      INSERT INTO exams (class_id, teacher_id, title, description, exam_date, total_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const info = stmt.run(class_id, teacher_id, title, description, exam_date, total_score)
    res.json({ success: true, id: info.lastInsertRowid })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT update exam
router.put('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params
    const { title, description, exam_date, total_score } = req.body
    const stmt = db.prepare(`
      UPDATE exams 
      SET title = ?, description = ?, exam_date = ?, total_score = ?
      WHERE id = ?
    `)
    stmt.run(title, description, exam_date, total_score, id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// DELETE exam
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params
    db.prepare('DELETE FROM student_exams WHERE exam_id = ?').run(id)
    db.prepare('DELETE FROM exams WHERE id = ?').run(id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET student exams
router.get('/student-exams', (req: Request, res: Response): void => {
  try {
    const { student_id, exam_id } = req.query
    let query = 'SELECT * FROM student_exams WHERE 1=1'
    const params: any[] = []

    if (student_id) {
      query += ' AND student_id = ?'
      params.push(student_id)
    }
    if (exam_id) {
      query += ' AND exam_id = ?'
      params.push(exam_id)
    }

    const records = db.prepare(query).all(...params)
    res.json({ success: true, data: records })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT update student exam (score, feedback)
router.put('/student-exams/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params
    const { score, feedback } = req.body
    const stmt = db.prepare(`
      UPDATE student_exams
      SET score = ?, feedback = ?
      WHERE id = ?
    `)
    stmt.run(score, feedback, id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
