import { Router, type Request, type Response } from 'express'
import db, { decrypt } from '../db.js'
import { asyncHandler, ApiError } from '../utils/asyncHandler.js'

const router = Router()

// GET all exams
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { class_id } = req.query
    let query = 'SELECT * FROM exams'
    const params: any[] = []

    if (class_id !== undefined) {
      const classIdNum = Number(class_id)
      if (!Number.isFinite(classIdNum)) throw new ApiError(400, 'Invalid class_id')
      query += ' WHERE class_id = ?'
      params.push(classIdNum)
    }
    query += ' ORDER BY created_at DESC'

    const exams = db.prepare(query).all(...params)
    res.json({ success: true, data: exams })
  }),
)

// POST create exam
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { class_id, teacher_id, title, description, exam_date, total_score } = req.body ?? {}

    const classIdNum = Number(class_id)
    const teacherIdNum = Number(teacher_id)
    const totalScoreNum = Number(total_score)

    if (!Number.isFinite(classIdNum)) throw new ApiError(400, 'Missing or invalid class_id')
    if (!Number.isFinite(teacherIdNum)) throw new ApiError(400, 'Missing or invalid teacher_id')
    if (!title || typeof title !== 'string') throw new ApiError(400, 'Missing title')
    if (!Number.isFinite(totalScoreNum) || totalScoreNum <= 0) throw new ApiError(400, 'Missing or invalid total_score')

    const tx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO exams (class_id, teacher_id, title, description, exam_date, total_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      const info = stmt.run(
        classIdNum,
        teacherIdNum,
        title,
        typeof description === 'string' ? description : null,
        exam_date || null,
        totalScoreNum,
      )
      const examId = Number(info.lastInsertRowid)

      const students = db.prepare('SELECT id FROM students WHERE class_id = ?').all(classIdNum) as { id: number }[]
      const insertStudentExam = db.prepare('INSERT INTO student_exams (exam_id, student_id, score, feedback) VALUES (?, ?, ?, ?)')
      for (const student of students) {
        insertStudentExam.run(examId, student.id, null, null)
      }

      return examId
    })

    const examId = tx()
    res.json({ success: true, id: examId })
  }),
)

// GET exam detail with grades
router.get(
  '/:id/grades',
  asyncHandler(async (req: Request, res: Response) => {
    const idNum = Number(req.params.id)
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id')

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(idNum) as any
    if (!exam) throw new ApiError(404, 'Exam not found')

    const grades = db
      .prepare(
        `
        SELECT
          se.id,
          se.exam_id,
          se.student_id,
          se.score,
          se.feedback,
          s.name as student_name
        FROM student_exams se
        JOIN students s ON s.id = se.student_id
        WHERE se.exam_id = ?
        ORDER BY s.id ASC
      `,
      )
      .all(idNum)
      .map((grade: any) => ({
        ...grade,
        student_name: decrypt(grade.student_name),
      }))

    res.json({ success: true, exam, grades })
  }),
)

// PUT exam grades in batch
router.put(
  '/:id/grades',
  asyncHandler(async (req: Request, res: Response) => {
    const idNum = Number(req.params.id)
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id')

    const exam = db.prepare('SELECT id FROM exams WHERE id = ?').get(idNum)
    if (!exam) throw new ApiError(404, 'Exam not found')

    const grades = Array.isArray(req.body?.grades) ? req.body.grades : null
    if (!grades || grades.length === 0) throw new ApiError(400, 'Missing grades')

    const tx = db.transaction(() => {
      const create = db.prepare(`
        INSERT INTO student_exams (exam_id, student_id, score, feedback)
        VALUES (?, ?, ?, ?)
      `)
      const findExisting = db.prepare('SELECT id FROM student_exams WHERE exam_id = ? AND student_id = ?')
      const update = db.prepare(`
        UPDATE student_exams
        SET score = ?, feedback = ?
        WHERE exam_id = ? AND student_id = ?
      `)

      for (const grade of grades) {
        const studentIdNum = Number(grade.student_id)
        const scoreNum =
          grade.score === null || grade.score === undefined || grade.score === ''
            ? null
            : Number(grade.score)

        if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Invalid student_id')
        if (scoreNum !== null && (!Number.isFinite(scoreNum) || scoreNum < 0)) {
          throw new ApiError(400, 'Invalid score')
        }

        const existing = findExisting.get(idNum, studentIdNum)
        if (!existing) {
          create.run(idNum, studentIdNum, null, null)
        }
        update.run(scoreNum, grade.feedback ?? null, idNum, studentIdNum)
      }
    })

    tx()
    res.json({ success: true })
  }),
)

// PUT update exam
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idNum = Number(req.params.id)
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id')

    const row = db.prepare('SELECT * FROM exams WHERE id = ?').get(idNum) as any
    if (!row) throw new ApiError(404, 'Exam not found')

    const { title, description, exam_date, total_score } = req.body ?? {}
    const totalScoreNum = total_score !== undefined ? Number(total_score) : undefined

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) throw new ApiError(400, 'Invalid title')
    if (totalScoreNum !== undefined && (!Number.isFinite(totalScoreNum) || totalScoreNum <= 0)) {
      throw new ApiError(400, 'Invalid total_score')
    }

    db.prepare(
      `
      UPDATE exams 
      SET title = ?, description = ?, exam_date = ?, total_score = ?
      WHERE id = ?
    `,
    ).run(
      title ?? row.title,
      description ?? row.description,
      exam_date ?? row.exam_date,
      totalScoreNum ?? row.total_score,
      idNum,
    )
    res.json({ success: true })
  }),
)

// DELETE exam
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idNum = Number(req.params.id)
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id')

    const existing = db.prepare('SELECT id FROM exams WHERE id = ?').get(idNum)
    if (!existing) throw new ApiError(404, 'Exam not found')

    db.prepare('DELETE FROM student_exams WHERE exam_id = ?').run(idNum)
    db.prepare('DELETE FROM exams WHERE id = ?').run(idNum)
    res.json({ success: true })
  }),
)

// GET student exams
router.get(
  '/student-exams',
  asyncHandler(async (req: Request, res: Response) => {
    const { student_id, exam_id } = req.query
    let query = 'SELECT * FROM student_exams WHERE 1=1'
    const params: any[] = []

    if (student_id !== undefined) {
      const studentIdNum = Number(student_id)
      if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Invalid student_id')
      query += ' AND student_id = ?'
      params.push(studentIdNum)
    }
    if (exam_id !== undefined) {
      const examIdNum = Number(exam_id)
      if (!Number.isFinite(examIdNum)) throw new ApiError(400, 'Invalid exam_id')
      query += ' AND exam_id = ?'
      params.push(examIdNum)
    }

    const records = db.prepare(query).all(...params)
    res.json({ success: true, data: records })
  }),
)

// PUT update student exam (score, feedback)
router.put(
  '/student-exams/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idNum = Number(req.params.id)
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id')

    const { score, feedback } = req.body ?? {}
    const scoreNum = score === null || score === undefined || score === '' ? null : Number(score)
    if (scoreNum !== null && (!Number.isFinite(scoreNum) || scoreNum < 0)) throw new ApiError(400, 'Invalid score')

    const existing = db.prepare('SELECT id FROM student_exams WHERE id = ?').get(idNum)
    if (!existing) throw new ApiError(404, 'Student exam record not found')

    db.prepare(
      `
      UPDATE student_exams
      SET score = ?, feedback = ?
      WHERE id = ?
    `,
    ).run(scoreNum, feedback ?? null, idNum)
    res.json({ success: true })
  }),
)

export default router
