import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

// Get announcements for a class
router.get('/', (req: Request, res: Response) => {
  const { classId } = req.query;
  if (!classId) {
    res.status(400).json({ success: false, message: 'classId is required' });
    return;
  }
  
  try {
    const announcements = db.prepare('SELECT * FROM class_announcements WHERE class_id = ? ORDER BY created_at DESC').all(classId);
    res.json({ success: true, announcements });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create an announcement
router.post('/', (req: Request, res: Response) => {
  const { class_id, teacher_id, title, content } = req.body;
  if (!class_id || !teacher_id || !title || !content) {
    res.status(400).json({ success: false, message: 'Missing required fields' });
    return;
  }

  try {
    const stmt = db.prepare('INSERT INTO class_announcements (class_id, teacher_id, title, content) VALUES (?, ?, ?, ?)');
    const info = stmt.run(class_id, teacher_id, title, content);
    
    res.json({ 
      success: true, 
      announcement: { 
        id: info.lastInsertRowid, 
        class_id, 
        teacher_id, 
        title, 
        content,
        created_at: new Date().toISOString()
      } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete an announcement
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    db.prepare('DELETE FROM class_announcements WHERE id = ?').run(id);
    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;