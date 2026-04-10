import { Router, type Request, type Response } from 'express';
import db, { decrypt } from '../db.js';

const router = Router();

// Get redemptions for a student
router.get('/my', (req: Request, res: Response) => {
  const { studentId } = req.query;
  try {
    const tickets = db.prepare(`
      SELECT r.*, i.name as item_name 
      FROM redemption_tickets r
      JOIN shop_items i ON r.item_id = i.id
      WHERE r.student_id = ?
      ORDER BY r.created_at DESC
    `).all(studentId);
    
    res.json({ success: true, tickets });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Verify a ticket (Teacher)
router.post('/verify', (req: Request, res: Response) => {
  const { code, teacherId } = req.body;
  if (!code) {
    res.status(400).json({ success: false, message: '核销码不能为空' });
    return;
  }

  try {
    const ticket = db.prepare(`
      SELECT r.*, i.name as item_name, i.teacher_id, s.name as student_name
      FROM redemption_tickets r
      JOIN shop_items i ON r.item_id = i.id
      JOIN students s ON r.student_id = s.id
      WHERE r.code = ?
    `).get(code) as any;

    if (!ticket) {
      res.status(404).json({ success: false, message: '无效的核销码' });
      return;
    }

    if (ticket.status === 'used') {
      res.status(400).json({ success: false, message: '该凭证已被核销' });
      return;
    }

    ticket.student_name = decrypt(ticket.student_name);

    // Verify successful
    db.prepare('UPDATE redemption_tickets SET status = "used", used_at = CURRENT_TIMESTAMP WHERE id = ?').run(ticket.id);

    res.json({ 
      success: true, 
      message: '核销成功',
      ticket: {
        ...ticket,
        status: 'used'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;