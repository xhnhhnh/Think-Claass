import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

// Get all active shop items (for students)
router.get('/items', (req: Request, res: Response) => {
  const { studentId } = req.query;
  try {
    let items;
    if (studentId) {
      items = db.prepare(`
        SELECT si.* 
        FROM shop_items si
        JOIN classes c ON si.teacher_id = c.teacher_id
        JOIN students s ON s.class_id = c.id
        WHERE s.id = ? AND (si.stock > 0 OR si.stock = -1) AND si.is_active = 1
      `).all(studentId);
    } else {
      items = db.prepare('SELECT * FROM shop_items WHERE (stock > 0 OR stock = -1) AND is_active = 1').all();
    }
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all shop items including inactive ones (for teachers)
router.get('/all', (req: Request, res: Response) => {
  const { teacherId } = req.query;
  try {
    let items;
    if (teacherId) {
      items = db.prepare('SELECT * FROM shop_items WHERE teacher_id = ? ORDER BY id DESC').all(teacherId);
    } else {
      items = db.prepare('SELECT * FROM shop_items ORDER BY id DESC').all();
    }
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create new item (for teachers)
router.post('/', (req: Request, res: Response) => {
  const { name, description, price, stock, is_active, teacher_id, is_holiday_limited, holiday_start_time, holiday_end_time } = req.body;
  try {
    let tId = teacher_id;
    if (!tId) {
      const teacher = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('teacher') as any;
      tId = teacher ? teacher.id : 1;
    }
    const stmt = db.prepare('INSERT INTO shop_items (name, description, price, stock, is_active, teacher_id, is_holiday_limited, holiday_start_time, holiday_end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(name, description, price, stock ?? 999, is_active ?? 1, tId, is_holiday_limited ? 1 : 0, holiday_start_time || null, holiday_end_time || null);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update item status (toggle on/off shelf) (for teachers)
router.put('/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { is_active } = req.body;
  try {
    db.prepare('UPDATE shop_items SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update item stock or info (for teachers)
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, price, stock, is_holiday_limited, holiday_start_time, holiday_end_time } = req.body;
  try {
    db.prepare('UPDATE shop_items SET name = ?, description = ?, price = ?, stock = ?, is_holiday_limited = ?, holiday_start_time = ?, holiday_end_time = ? WHERE id = ?')
      .run(name, description, price, stock, is_holiday_limited ? 1 : 0, holiday_start_time || null, holiday_end_time || null, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Buy an item
router.post('/buy', (req: Request, res: Response) => {
  const { studentId, itemId } = req.body;
  
  try {
    const transaction = db.transaction(() => {
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
      if (!student) throw new Error('Student not found');

      const item = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(itemId) as any;
      if (!item || (item.stock <= 0 && item.stock !== -1)) throw new Error('Item out of stock');
      if (item.is_active !== 1) throw new Error('Item is not active');

      // Check holiday limit
      if (item.is_holiday_limited === 1) {
        const now = new Date().toISOString();
        if (item.holiday_start_time && now < item.holiday_start_time) {
          throw new Error('This item is not yet available for purchase');
        }
        if (item.holiday_end_time && now > item.holiday_end_time) {
          throw new Error('This item is no longer available for purchase');
        }
      }

      if (student.available_points < item.price) {
        throw new Error('Not enough points');
      }

      // Deduct points
      const newPoints = student.available_points - item.price;
      db.prepare('UPDATE students SET available_points = ? WHERE id = ?').run(newPoints, studentId);
      
      // Update stock if not infinite (-1)
      if (item.stock !== -1) {
        db.prepare('UPDATE shop_items SET stock = stock - 1 WHERE id = ?').run(itemId);
      }

      // Log record
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'BUY_ITEM', -item.price, `Bought item: ${item.name}`);

      // Generate redemption ticket
      const code = 'RED-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      db.prepare('INSERT INTO redemption_tickets (student_id, item_id, code, status) VALUES (?, ?, ?, ?)')
        .run(studentId, itemId, code, 'pending');

      return { points: newPoints };
    });

    const result = transaction();
    res.json({ success: true, points: result.points });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
