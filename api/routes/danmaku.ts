import express, { Request, Response } from 'express';
import db from '../db.js';
import { assertClassFeatureEnabled } from '../utils/classFeatures.js';

const router = express.Router();

// Get recent danmaku messages
router.get('/', (req: Request, res: Response) => {
  const { classId, since } = req.query;
  
  if (!classId) {
    return res.status(400).json({ success: false, message: 'classId required' });
  }

  try {
    assertClassFeatureEnabled(Number(classId), 'enable_danmaku');
    let messages;
    if (since) {
      messages = db.prepare(`
        SELECT * FROM danmaku_messages 
        WHERE class_id = ? AND id > ? 
        ORDER BY id ASC LIMIT 50
      `).all(classId, since);
    } else {
      messages = db.prepare(`
        SELECT * FROM danmaku_messages 
        WHERE class_id = ? 
        ORDER BY id DESC LIMIT 50
      `).all(classId).reverse();
    }
    
    res.json({ success: true, messages });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Post a new danmaku
router.post('/', (req: Request, res: Response) => {
  const { class_id, sender_name, content, color } = req.body;
  
  if (!class_id || !content || !sender_name) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    assertClassFeatureEnabled(Number(class_id), 'enable_danmaku');
    const stmt = db.prepare(`
      INSERT INTO danmaku_messages (class_id, sender_name, content, color)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(class_id, sender_name, content, color || '#ffffff');
    
    const message = db.prepare('SELECT * FROM danmaku_messages WHERE id = ?').get(info.lastInsertRowid);
    
    res.json({ success: true, message });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete old danmaku (Cleanup task - optional)
router.delete('/cleanup', (req: Request, res: Response) => {
  try {
    // Keep only last 1000 messages
    db.prepare(`
      DELETE FROM danmaku_messages WHERE id NOT IN (
        SELECT id FROM danmaku_messages ORDER BY id DESC LIMIT 1000
      )
    `).run();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
