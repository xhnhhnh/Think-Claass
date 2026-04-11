import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { assertActorFeatureEnabled, assertStudentFeatureEnabled } from '../utils/classFeatures.js';

const router = Router();

// Get family tasks for a student or parent
router.get('/', (req: Request, res: Response) => {
  const { studentId, parentId } = req.query;
  try {
    let tasks;
    if (studentId) {
      assertStudentFeatureEnabled(Number(studentId), 'enable_family_tasks');
      tasks = db.prepare('SELECT * FROM family_tasks WHERE student_id = ? ORDER BY created_at DESC').all(studentId);
    } else if (parentId) {
      assertActorFeatureEnabled(Number(parentId), 'parent', 'enable_family_tasks');
      tasks = db.prepare('SELECT * FROM family_tasks WHERE parent_id = ? ORDER BY created_at DESC').all(parentId);
    } else {
      res.status(400).json({ success: false, message: 'Missing studentId or parentId' });
      return;
    }
    res.json({ success: true, tasks });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a family task (parent only)
router.post('/', (req: Request, res: Response) => {
  const { student_id, parent_id, title, points } = req.body;
  if (!student_id || !parent_id || !title || points === undefined) {
    res.status(400).json({ success: false, message: 'Missing required fields' });
    return;
  }

  try {
    assertStudentFeatureEnabled(Number(student_id), 'enable_family_tasks');
    const stmt = db.prepare('INSERT INTO family_tasks (student_id, parent_id, title, points) VALUES (?, ?, ?, ?)');
    const info = stmt.run(student_id, parent_id, title, points);
    
    res.json({ 
      success: true, 
      task: { 
        id: info.lastInsertRowid, 
        student_id, 
        parent_id, 
        title, 
        points, 
        status: 'pending',
        created_at: new Date().toISOString()
      } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update task status
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const task = db.prepare('SELECT student_id FROM family_tasks WHERE id = ?').get(id) as { student_id: number } | undefined;
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }
    assertStudentFeatureEnabled(task.student_id, 'enable_family_tasks');
    db.prepare('UPDATE family_tasks SET status = ? WHERE id = ?').run(status, id);
    res.json({ success: true, message: 'Task updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete a family task
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const task = db.prepare('SELECT student_id FROM family_tasks WHERE id = ?').get(id) as { student_id: number } | undefined;
    if (!task) {
      res.status(404).json({ success: false, message: 'Task not found' });
      return;
    }
    assertStudentFeatureEnabled(task.student_id, 'enable_family_tasks');
    db.prepare('DELETE FROM family_tasks WHERE id = ?').run(id);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
