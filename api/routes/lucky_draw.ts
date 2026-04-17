import { Router, type Request, type Response } from 'express';
import db from '../db.js';

const router = Router();

// Get lucky draw config for a teacher
router.get('/config', (req: Request, res: Response) => {
  const { teacherId } = req.query;
  try {
    let tId = teacherId;
    if (!tId) {
      const teacher = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('teacher') as any;
      tId = teacher ? teacher.id : 1;
    }
    const configs = db.prepare('SELECT * FROM lucky_draw_config WHERE teacher_id = ? AND is_active = 1 ORDER BY id ASC').all(tId);
    
    // Default config if none exists
    if (configs.length === 0) {
      res.json({ success: true, configs: [], cost_points: 10 });
      return;
    }
    
    res.json({ success: true, configs, cost_points: (configs[0] as any).cost_points });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update lucky draw configs (Teacher)
router.post('/config', (req: Request, res: Response) => {
  const { teacher_id, cost_points, configs } = req.body;
  // configs is an array of 9 items
  if (!Array.isArray(configs) || configs.length !== 9) {
    res.status(400).json({ success: false, message: 'configs 必须是长度为 9 的数组' });
    return;
  }
  try {
    let tId = teacher_id;
    if (!tId) {
      const teacher = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('teacher') as any;
      tId = teacher ? teacher.id : 1;
    }

    db.transaction(() => {
      // Inactive all old configs
      db.prepare('UPDATE lucky_draw_config SET is_active = 0 WHERE teacher_id = ?').run(tId);
      
      const stmt = db.prepare('INSERT INTO lucky_draw_config (teacher_id, cost_points, prize_name, prize_type, prize_value, probability, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)');
      for (const conf of configs) {
        stmt.run(tId, cost_points || 10, conf.prize_name, conf.prize_type, conf.prize_value || null, conf.probability || 0);
      }
    })();

    res.json({ success: true, message: 'Config updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Execute a draw (Student)
router.post('/draw', (req: Request, res: Response) => {
  const { studentId } = req.body;
  if (!studentId) {
    res.status(400).json({ success: false, message: 'Student ID is required' });
    return;
  }

  try {
    // 1. Get student and teacher
    const student = db.prepare(`
      SELECT s.*, c.teacher_id 
      FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
    `).get(studentId) as any;

    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    // 2. Get active configs
    const configs = db.prepare('SELECT * FROM lucky_draw_config WHERE teacher_id = ? AND is_active = 1').all(student.teacher_id) as any[];
    
    if (configs.length === 0) {
      res.status(404).json({ success: false, message: 'No active lucky draw config' });
      return;
    }

    const costPoints = configs[0].cost_points || 10;

    if (student.available_points < costPoints) {
      res.status(409).json({ success: false, message: '积分不足' });
      return;
    }

    // 3. Draw logic based on probability
    const totalProb = configs.reduce((acc, curr) => acc + curr.probability, 0);
    const rand = Math.floor(Math.random() * totalProb); // 0 to totalProb - 1
    let cumulative = 0;
    let wonConfig = configs[configs.length - 1]; // default to last one
    
    for (const conf of configs) {
      cumulative += conf.probability;
      if (rand < cumulative) {
        wonConfig = conf;
        break;
      }
    }

    // 4. Transaction: Deduct points, record, grant prize
    let prizeMessage = '';
    db.transaction(() => {
      // Deduct cost
      db.prepare('UPDATE students SET available_points = available_points - ? WHERE id = ?').run(costPoints, studentId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(studentId, 'LUCKY_DRAW', -costPoints, '参与翻牌抽奖');

      // Grant prize
      if (wonConfig.prize_type === 'POINTS') {
        const winAmount = wonConfig.prize_value || 0;
        if (winAmount > 0) {
          db.prepare('UPDATE students SET available_points = available_points + ?, total_points = total_points + ? WHERE id = ?').run(winAmount, winAmount, studentId);
          db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(studentId, 'LUCKY_DRAW_WIN', winAmount, `抽奖获得: ${wonConfig.prize_name}`);
          prizeMessage = `恭喜获得 ${winAmount} 积分！`;
        } else {
          prizeMessage = `很遗憾，本次未中奖。`;
        }
      } else if (wonConfig.prize_type === 'ITEM') {
        const itemId = wonConfig.prize_value;
        const code = 'RED-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        db.prepare('INSERT INTO redemption_tickets (student_id, item_id, code, status) VALUES (?, ?, ?, ?)').run(studentId, itemId, code, 'pending');
        prizeMessage = `恭喜获得商品兑换券: ${wonConfig.prize_name}！请在“我的兑换”中查看。`;
      } else {
        prizeMessage = `很遗憾，本次未中奖。`;
      }
    })();

    res.json({ 
      success: true, 
      prize: wonConfig,
      message: prizeMessage
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
