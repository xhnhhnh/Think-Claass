import express, { Request, Response } from 'express';
import db from '../db.js';

const router = express.Router();

router.post('/', (req: Request, res: Response) => {
  const { studentId } = req.body;
  if (!studentId) {
    return res.status(400).json({ success: false, message: 'Student ID required' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if already buffed today
    const existing = db.prepare('SELECT id FROM parent_activity WHERE student_id = ? AND date(created_at) = ?').get(studentId, today);
    if (existing) {
      return res.status(400).json({ success: false, message: '今日已经施放过祝福了' });
    }

    db.prepare('INSERT INTO parent_activity (student_id, activity_type, points_awarded) VALUES (?, ?, ?)')
      .run(studentId, 'PARENT_BUFF', 0);
      
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;