import { Router, type Request, type Response } from 'express'
import db from '../db.js'

const router = Router()

// GET all assignments (optional class_id filter)
router.get('/', (req: Request, res: Response): void => {
  try {
    const { class_id } = req.query
    let query = 'SELECT * FROM assignments'
    const params: any[] = []

    if (class_id) {
      query += ' WHERE class_id = ?'
      params.push(class_id)
    }
    query += ' ORDER BY created_at DESC'

    const assignments = db.prepare(query).all(...params)
    res.json({ success: true, data: assignments })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST create an assignment
router.post('/', (req: Request, res: Response): void => {
  try {
    const { class_id, teacher_id, title, description, due_date, reward_points } = req.body
    const stmt = db.prepare(`
      INSERT INTO assignments (class_id, teacher_id, title, description, due_date, reward_points)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const info = stmt.run(class_id, teacher_id, title, description, due_date, reward_points || 0)
    res.json({ success: true, id: info.lastInsertRowid })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT update an assignment
router.put('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params
    const { title, description, due_date, reward_points } = req.body
    const stmt = db.prepare(`
      UPDATE assignments 
      SET title = ?, description = ?, due_date = ?, reward_points = ?
      WHERE id = ?
    `)
    stmt.run(title, description, due_date, reward_points, id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// DELETE an assignment
router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params
    db.prepare('DELETE FROM student_assignments WHERE assignment_id = ?').run(id)
    db.prepare('DELETE FROM assignments WHERE id = ?').run(id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// GET student assignments
router.get('/student-assignments', (req: Request, res: Response): void => {
  try {
    const { student_id, assignment_id } = req.query
    let query = 'SELECT * FROM student_assignments WHERE 1=1'
    const params: any[] = []

    if (student_id) {
      query += ' AND student_id = ?'
      params.push(student_id)
    }
    if (assignment_id) {
      query += ' AND assignment_id = ?'
      params.push(assignment_id)
    }

    const records = db.prepare(query).all(...params)
    res.json({ success: true, data: records })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// PUT update student assignment (submit, grade, etc)
router.put('/student-assignments/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params
    const { status, content, score, teacher_feedback } = req.body
    
    // We update only the fields provided
    const updates: string[] = []
    const params: any[] = []

    if (status !== undefined) {
      updates.push('status = ?')
      params.push(status)
      if (status === 'submitted' || status === 'completed') {
        updates.push('submitted_at = CURRENT_TIMESTAMP')
      }
    }
    if (content !== undefined) {
      updates.push('content = ?')
      params.push(content)
    }
    if (score !== undefined) {
      updates.push('score = ?')
      params.push(score)
    }
    if (teacher_feedback !== undefined) {
      updates.push('teacher_feedback = ?')
      params.push(teacher_feedback)
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, message: 'No fields to update' });
      return;
    }

    params.push(id)

    const stmt = db.prepare(`
      UPDATE student_assignments
      SET ${updates.join(', ')}
      WHERE id = ?
    `)
    stmt.run(...params)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
