import { Router, type Request, type Response } from 'express';
import db, { decrypt } from '../db.js';

const router = Router();

// Get messages (filter by classId, type, receiverId)
router.get('/', (req: Request, res: Response) => {
  const { classId, type, receiverId, role } = req.query;

  try {
    let query = `
      SELECT m.*, 
             CASE WHEN m.sender_role = 'user' THEN u1.username ELSE s1.name END as sender_name,
             s2.name as receiver_name
      FROM messages m
      LEFT JOIN students s1 ON m.sender_id = s1.id AND m.sender_role = 'student'
      LEFT JOIN students s2 ON m.receiver_id = s2.id
      LEFT JOIN users u1 ON m.sender_id = u1.id AND m.sender_role = 'user'
      WHERE 1=1
    `;
    const params: any[] = [];

    if (classId) {
      query += ' AND m.class_id = ?';
      params.push(classId);
    }

    if (type) {
      query += ' AND m.type = ?';
      params.push(type);
    }

    if (receiverId) {
      query += ' AND m.receiver_id = ?';
      params.push(receiverId);
    }

    query += ' ORDER BY m.created_at DESC';

    let messages = db.prepare(query).all(...params) as any[];

    messages = messages.map(m => {
      if (m.type !== 'HOME_SCHOOL' && m.sender_name) {
        m.sender_name = decrypt(m.sender_name);
      }
      if (m.receiver_name) {
        m.receiver_name = decrypt(m.receiver_name);
      }
      
      if (m.is_anonymous && role !== 'teacher') {
        m.sender_name = '匿名同学';
      }
      return m;
    });

    res.json({ success: true, messages });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a message
router.post('/', (req: Request, res: Response) => {
  const { class_id, sender_id, receiver_id, content, is_anonymous, type, sender_role = 'student' } = req.body;

  if (!class_id || !sender_id || !content || !type) {
    res.status(400).json({ success: false, message: 'class_id, sender_id, content, and type are required' });
    return;
  }

  if (type !== 'PEER_REVIEW' && type !== 'TREE_HOLE' && type !== 'HOME_SCHOOL') {
    res.status(400).json({ success: false, message: 'Invalid message type' });
    return;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO messages (class_id, sender_id, receiver_id, content, is_anonymous, type, sender_role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      class_id, 
      sender_id, 
      receiver_id || null, 
      content, 
      is_anonymous ? 1 : 0, 
      type,
      sender_role
    );
    
    res.json({ 
      success: true, 
      message: 'Message sent successfully',
      id: info.lastInsertRowid
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
