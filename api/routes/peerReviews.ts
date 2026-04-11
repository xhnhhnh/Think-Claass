import { Router, type Request, type Response } from 'express'
import db from '../db.js'
import { asyncHandler, ApiError } from '../utils/asyncHandler.js'

const router = Router()

// GET peer reviews
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { reviewer_id, reviewee_id, assignment_id, team_quest_id } = req.query
    let query = 'SELECT * FROM peer_reviews WHERE 1=1'
    const params: any[] = []

    if (reviewer_id !== undefined) {
      const reviewerIdNum = Number(reviewer_id)
      if (!Number.isFinite(reviewerIdNum)) throw new ApiError(400, 'Invalid reviewer_id')
      query += ' AND reviewer_id = ?'
      params.push(reviewerIdNum)
    }
    if (reviewee_id !== undefined) {
      const revieweeIdNum = Number(reviewee_id)
      if (!Number.isFinite(revieweeIdNum)) throw new ApiError(400, 'Invalid reviewee_id')
      query += ' AND reviewee_id = ?'
      params.push(revieweeIdNum)
    }
    if (assignment_id !== undefined) {
      const assignmentIdNum = Number(assignment_id)
      if (!Number.isFinite(assignmentIdNum)) throw new ApiError(400, 'Invalid assignment_id')
      query += ' AND assignment_id = ?'
      params.push(assignmentIdNum)
    }
    if (team_quest_id !== undefined) {
      const teamQuestIdNum = Number(team_quest_id)
      if (!Number.isFinite(teamQuestIdNum)) throw new ApiError(400, 'Invalid team_quest_id')
      query += ' AND team_quest_id = ?'
      params.push(teamQuestIdNum)
    }
    query += ' ORDER BY created_at DESC'

    const reviews = db.prepare(query).all(...params)
    res.json({ success: true, data: reviews })
  }),
)

// POST create peer review
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { reviewer_id, reviewee_id, assignment_id, team_quest_id, score, comment } = req.body ?? {}

    const reviewerIdNum = Number(reviewer_id)
    const revieweeIdNum = Number(reviewee_id)
    const scoreNum = Number(score)

    if (!Number.isFinite(reviewerIdNum)) throw new ApiError(400, 'Missing or invalid reviewer_id')
    if (!Number.isFinite(revieweeIdNum)) throw new ApiError(400, 'Missing or invalid reviewee_id')
    if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 5) throw new ApiError(400, 'Missing or invalid score')

    const assignmentIdNum =
      assignment_id === undefined || assignment_id === null || assignment_id === '' ? null : Number(assignment_id)
    const teamQuestIdNum =
      team_quest_id === undefined || team_quest_id === null || team_quest_id === '' ? null : Number(team_quest_id)

    if (assignmentIdNum !== null && !Number.isFinite(assignmentIdNum)) throw new ApiError(400, 'Invalid assignment_id')
    if (teamQuestIdNum !== null && !Number.isFinite(teamQuestIdNum)) throw new ApiError(400, 'Invalid team_quest_id')
    if (assignmentIdNum === null && teamQuestIdNum === null) {
      throw new ApiError(400, 'assignment_id or team_quest_id is required')
    }

    const stmt = db.prepare(`
      INSERT INTO peer_reviews (reviewer_id, reviewee_id, assignment_id, team_quest_id, score, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const info = stmt.run(
      reviewerIdNum,
      revieweeIdNum,
      assignmentIdNum,
      teamQuestIdNum,
      scoreNum,
      typeof comment === 'string' && comment.trim() ? comment : null,
    )
    res.json({ success: true, id: info.lastInsertRowid })
  }),
)

export default router
