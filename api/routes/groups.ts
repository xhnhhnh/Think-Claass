import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

// Get all groups for a class
router.get('/', (req: Request, res: Response) => {
  const { classId } = req.query;
  if (!classId) {
    return res.status(400).json({ success: false, message: 'classId is required' });
  }

  try {
    const groups = db.prepare('SELECT * FROM student_groups WHERE class_id = ? ORDER BY id ASC').all(classId);
    res.json({ success: true, groups });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create a new group
router.post('/', (req: Request, res: Response) => {
  const { name, class_id } = req.body;
  if (!name || !class_id) {
    return res.status(400).json({ success: false, message: 'Name and class_id are required' });
  }

  try {
    const info = db.prepare('INSERT INTO student_groups (name, class_id) VALUES (?, ?)').run(name, class_id);
    const newGroup = db.prepare('SELECT * FROM student_groups WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, group: newGroup });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update a student's group
router.post('/assign', (req: Request, res: Response) => {
  const { studentId, groupId } = req.body;
  if (!studentId) {
    return res.status(400).json({ success: false, message: 'studentId is required' });
  }

  try {
    // groupId can be null to unassign
    db.prepare('UPDATE students SET group_id = ? WHERE id = ?').run(groupId || null, studentId);
    res.json({ success: true, message: 'Student assigned to group successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;