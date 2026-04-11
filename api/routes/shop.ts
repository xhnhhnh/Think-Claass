import { Router, type Request, type Response } from 'express';
import db from '../db.js';
import { assertActorFeatureEnabled, assertStudentFeatureEnabled } from '../utils/classFeatures.js';
import { getRequestActor } from '../utils/requestAuth.js';

const router = Router();

// Get all active shop items (for students)
router.get('/items', (req: Request, res: Response) => {
  const { studentId } = req.query;
  try {
    const actor = getRequestActor(req);
    if (actor.role === 'student' && actor.id) {
      assertActorFeatureEnabled(actor.id, 'student', 'enable_shop');
    }

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
  
  if (!name || typeof price !== 'number' || price < 0 || typeof stock !== 'number' || stock < 0) {
    res.status(400).json({ success: false, message: 'Invalid input' });
    return;
  }

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
    assertStudentFeatureEnabled(Number(studentId), 'enable_shop');

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

// Get all auctions
router.get('/auctions', (req: Request, res: Response) => {
  try {
    const actor = getRequestActor(req);
    if (actor.role === 'student' && actor.id) {
      assertActorFeatureEnabled(actor.id, 'student', 'enable_auction_blind_box');
    }

    const auctions = db.prepare('SELECT * FROM auctions ORDER BY id DESC').all();
    res.json({ success: true, auctions });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Place a bid on an auction
router.post('/auctions/:id/bid', (req: Request, res: Response) => {
  const { id } = req.params;
  const { studentId, bid_amount } = req.body;

  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_auction_blind_box');

    const transaction = db.transaction(() => {
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
      if (!student) throw new Error('Student not found');

      const auction = db.prepare('SELECT * FROM auctions WHERE id = ?').get(id) as any;
      if (!auction) throw new Error('Auction not found');
      if (auction.status !== 'active') throw new Error('Auction is not active');
      if (auction.end_time && new Date(auction.end_time) < new Date()) {
        throw new Error('Auction has ended');
      }

      const currentPrice = auction.current_price || auction.starting_price;
      if (bid_amount <= currentPrice) {
        throw new Error(`Bid amount must be greater than current price: ${currentPrice}`);
      }

      if (student.available_points < bid_amount) {
        throw new Error('Not enough points');
      }

      // Refund previous bidder
      if (auction.highest_bidder_id && auction.highest_bidder_id !== studentId) {
        const prevBidder = db.prepare('SELECT available_points FROM students WHERE id = ?').get(auction.highest_bidder_id) as any;
        if (prevBidder) {
          db.prepare('UPDATE students SET available_points = available_points + ? WHERE id = ?').run(currentPrice, auction.highest_bidder_id);
          db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
            .run(auction.highest_bidder_id, 'AUCTION_REFUND', currentPrice, `Refund for outbid on auction: ${auction.item_name}`);
        }
      }

      // Deduct points from new bidder
      const newPoints = student.available_points - bid_amount;
      db.prepare('UPDATE students SET available_points = ? WHERE id = ?').run(newPoints, studentId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'AUCTION_BID', -bid_amount, `Placed bid on auction: ${auction.item_name}`);

      // Update auction
      db.prepare('UPDATE auctions SET current_price = ?, highest_bidder_id = ? WHERE id = ?').run(bid_amount, studentId, id);

      return { points: newPoints };
    });

    const result = transaction();
    res.json({ success: true, points: result.points });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Buy a blind box
router.post('/blind_box', (req: Request, res: Response) => {
  const { studentId, boxId } = req.body;
  
  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_auction_blind_box');

    const transaction = db.transaction(() => {
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
      if (!student) throw new Error('Student not found');

      let price = 100;
      let boxName = '神秘盲盒';
      
      if (boxId) {
        const box = db.prepare('SELECT * FROM blind_boxes WHERE id = ?').get(boxId) as any;
        if (!box) throw new Error('Blind box not found');
        if (box.is_active !== 1) throw new Error('Blind box is not active');
        price = box.price;
        boxName = box.name;
      }

      if (student.available_points < price) {
        throw new Error('Not enough points');
      }

      // Deduct points
      const newPoints = student.available_points - price;
      db.prepare('UPDATE students SET available_points = ? WHERE id = ?').run(newPoints, studentId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'BUY_BLIND_BOX', -price, `Bought blind box: ${boxName}`);

      // Generate random reward
      const randomValue = Math.random();
      let reward = '';
      if (randomValue < 0.1) {
        reward = '稀有碎片 x1';
      } else if (randomValue < 0.3) {
        reward = '普通碎片 x2';
      } else if (randomValue < 0.6) {
        reward = '神秘道具 x1';
      } else {
        reward = '谢谢参与 (获得安慰奖 10积分)';
        // refund 10 points
        db.prepare('UPDATE students SET available_points = available_points + 10 WHERE id = ?').run(studentId);
        db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
          .run(studentId, 'BLIND_BOX_CONSOLATION', 10, 'Blind box consolation prize');
      }

      return { points: newPoints, reward };
    });

    const result = transaction();
    res.json({ success: true, points: result.points, reward: result.reward });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Create new auction
router.post('/auctions', (req: Request, res: Response) => {
  const { item_name, description, starting_price, end_time } = req.body;
  try {
    const stmt = db.prepare('INSERT INTO auctions (item_name, description, starting_price, current_price, end_time) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(item_name, description || '', starting_price || 0, starting_price || 0, end_time || null);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update an auction
router.put('/auctions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { item_name, description, starting_price, status, end_time } = req.body;
  try {
    db.prepare('UPDATE auctions SET item_name = ?, description = ?, starting_price = ?, status = ?, end_time = ? WHERE id = ?')
      .run(item_name, description, starting_price, status, end_time, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete an auction
router.delete('/auctions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM auctions WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==========================
// Blind Box Management APIs
// ==========================
// Get all blind boxes (for management or student shop)
router.get('/blind_boxes', (req: Request, res: Response) => {
  try {
    const actor = getRequestActor(req);
    if (actor.role === 'student' && actor.id) {
      assertActorFeatureEnabled(actor.id, 'student', 'enable_auction_blind_box');
    }

    const boxes = db.prepare('SELECT * FROM blind_boxes ORDER BY id DESC').all();
    res.json({ success: true, boxes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a new blind box
router.post('/blind_boxes', (req: Request, res: Response) => {
  const { name, description, price, is_active } = req.body;
  if (!name || typeof price !== 'number') {
    return res.status(400).json({ success: false, message: 'Invalid input' });
  }
  try {
    const info = db.prepare('INSERT INTO blind_boxes (name, description, price, is_active) VALUES (?, ?, ?, ?)')
      .run(name, description || '', price, is_active === undefined ? 1 : is_active ? 1 : 0);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update a blind box
router.put('/blind_boxes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, price, is_active } = req.body;
  try {
    db.prepare('UPDATE blind_boxes SET name = ?, description = ?, price = ?, is_active = ? WHERE id = ?')
      .run(name, description || '', price, is_active ? 1 : 0, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete a blind box
router.delete('/blind_boxes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM blind_boxes WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
