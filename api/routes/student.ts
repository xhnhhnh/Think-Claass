import { Router, type Request, type Response } from 'express';
import db, { encrypt, decrypt } from '../db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';

const router = Router();

// Get all students (optionally filter by class_id)
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { classId } = req.query;
  
  let query = 'SELECT s.*, u.username, g.name as group_name FROM students s JOIN users u ON s.user_id = u.id LEFT JOIN student_groups g ON s.group_id = g.id';
  const params: any[] = [];
  
  if (classId) {
    query += ' WHERE s.class_id = ?';
    params.push(classId);
  }
  
  const students = db.prepare(query).all(...params) as any[];
  // Decrypt names
  const decryptedStudents = students.map(s => ({
    ...s,
    name: decrypt(s.name)
  }));
  
  res.json({ success: true, students: decryptedStudents });
}));

// Get a single student
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const student = db.prepare('SELECT s.*, u.username, g.name as group_name FROM students s JOIN users u ON s.user_id = u.id LEFT JOIN student_groups g ON s.group_id = g.id WHERE s.id = ?').get(id) as any;
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }
  student.name = decrypt(student.name);
  res.json({ success: true, student });
}));

// Daily check-in
router.post('/checkin', (req: Request, res: Response) => {
  const { studentId } = req.body;
  if (!studentId) {
    res.status(400).json({ success: false, message: 'Missing studentId' });
    return;
  }

  try {
    const transaction = db.transaction(() => {
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
      if (!student) throw new Error('Student not found');

      const today = new Date().toISOString().split('T')[0];
      if (student.last_checkin_date === today) {
        throw new Error('Already checked in today');
      }

      const amount = 5;
      const newTotal = student.total_points + amount;
      const newAvailable = student.available_points + amount;

      db.prepare('UPDATE students SET last_checkin_date = ?, total_points = ?, available_points = ? WHERE id = ?')
        .run(today, newTotal, newAvailable, studentId);

      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'ADD_POINTS', amount, '每日签到奖励');

      try {
        db.prepare("UPDATE pets SET last_fed_at = datetime('now') WHERE student_id = ?").run(studentId);
      } catch (e) {}

      return { total_points: newTotal, available_points: newAvailable };
    });

    const result = transaction();
    res.json({ success: true, student: result, message: '签到成功，获得 5 积分' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Gift points
router.post('/gift', (req: Request, res: Response) => {
  const { senderId, receiverId, points, message } = req.body;

  if (!senderId || !receiverId || !points || !message) {
    res.status(400).json({ success: false, message: 'Missing required fields' });
    return;
  }

  const amount = parseInt(points);
  if (isNaN(amount) || amount <= 0) {
    res.status(400).json({ success: false, message: 'Invalid points amount' });
    return;
  }

  try {
    const transaction = db.transaction(() => {
      const sender = db.prepare('SELECT * FROM students WHERE id = ?').get(senderId) as any;
      const receiver = db.prepare('SELECT * FROM students WHERE id = ?').get(receiverId) as any;

      if (!sender || !receiver) throw new Error('Student not found');
      if (sender.available_points < amount) throw new Error('Insufficient points');

      // Deduct from sender
      db.prepare('UPDATE students SET available_points = available_points - ? WHERE id = ?')
        .run(amount, senderId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(senderId, 'DEDUCT_POINTS', amount, `赠送积分给同学`);

      // Add to receiver
      db.prepare('UPDATE students SET total_points = total_points + ?, available_points = available_points + ? WHERE id = ?')
        .run(amount, amount, receiverId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(receiverId, 'ADD_POINTS', amount, `收到同学赠送积分`);

      // Add message
      const fullMessage = `[附赠 ${amount} 积分] ${message}`;
      db.prepare('INSERT INTO messages (class_id, sender_id, receiver_id, content, type) VALUES (?, ?, ?, ?, ?)')
        .run(sender.class_id, senderId, receiverId, fullMessage, 'PEER_REVIEW');

      return { success: true };
    });

    transaction();
    res.json({ success: true, message: 'Gift sent successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Batch import students
router.post('/batch-import', (req: Request, res: Response) => {
  const { students, class_id } = req.body;
  
  if (!Array.isArray(students) || students.length === 0) {
    res.status(400).json({ success: false, message: 'No students provided' });
    return;
  }

  try {
    const transaction = db.transaction(() => {
      let defaultClassId = class_id;
      if (!defaultClassId) {
        const defaultClass = db.prepare('SELECT id FROM classes LIMIT 1').get() as any;
        defaultClassId = defaultClass ? defaultClass.id : 1;
      }

      let importedCount = 0;
      for (const student of students) {
        const { username, name } = student;
        if (!username || !name) continue;

        // Ensure unique username
        let finalUsername = username;
        let existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername) as any;
        let suffix = 1;
        while (existingUser) {
          finalUsername = `${username}${suffix}`;
          existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername) as any;
          suffix++;
        }

        const insertUser = db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)');
        const userResult = insertUser.run('student', finalUsername, '123456');
        const userId = userResult.lastInsertRowid;

        const insertStudent = db.prepare('INSERT INTO students (user_id, class_id, name) VALUES (?, ?, ?)');
        insertStudent.run(userId, defaultClassId, encrypt(name));
        importedCount++;
      }
    });

    transaction();
    res.json({ success: true, message: 'Students imported successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create a student
router.post('/', (req: Request, res: Response) => {
  const { username, name, class_id } = req.body;
  const password = '123456'; // Default password for students

  if (!username || typeof username !== 'string' || username.trim() === '' || 
      !name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ success: false, message: 'Invalid input' });
    return;
  }

  try {
    const transaction = db.transaction(() => {
      // 1. Create user
      const insertUser = db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)');
      const userResult = insertUser.run('student', username, password);
      const userId = userResult.lastInsertRowid;

      // 2. Create student
      let defaultClassId = class_id;
      if (!defaultClassId) {
        const defaultClass = db.prepare('SELECT id FROM classes LIMIT 1').get() as any;
        defaultClassId = defaultClass ? defaultClass.id : 1;
      }

      const insertStudent = db.prepare('INSERT INTO students (user_id, class_id, name) VALUES (?, ?, ?)');
      insertStudent.run(userId, defaultClassId, encrypt(name));
    });

    transaction();
    res.json({ success: true, message: 'Student created successfully' });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ success: false, message: 'Username already exists' });
    } else {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
});

// Batch update points
router.post('/batch-points', (req: Request, res: Response) => {
  const { studentIds, amount, reason } = req.body;
  
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ success: false, message: 'No students selected' });
    return;
  }

  try {
    const transaction = db.transaction(() => {
      for (const studentId of studentIds) {
        const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
        if (!student) continue;

        const newTotal = amount > 0 ? student.total_points + amount : student.total_points;
        const newAvailable = Math.max(0, student.available_points + amount);

        db.prepare('UPDATE students SET total_points = ?, available_points = ? WHERE id = ?')
          .run(newTotal, newAvailable, studentId);

        db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
          .run(studentId, amount > 0 ? 'ADD_POINTS' : 'DEDUCT_POINTS', amount, reason);

        // Auto-revive pet if teacher adds points
        if (amount > 0) {
          try {
            db.prepare('UPDATE pets SET last_fed_at = CURRENT_TIMESTAMP WHERE student_id = ?').run(studentId);
          } catch (e) {}
        }
      }
    });

    transaction();
    res.json({ success: true, message: 'Points updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Batch edit students
router.post('/batch-edit', (req: Request, res: Response) => {
  const { studentIds, action, value } = req.body;
  // action: 'change_class' | 'reset_password' | 'change_group'

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ success: false, message: 'No students selected' });
    return;
  }

  try {
    const transaction = db.transaction(() => {
      for (const studentId of studentIds) {
        const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
        if (!student) continue;

        if (action === 'change_class') {
          db.prepare('UPDATE students SET class_id = ? WHERE id = ?').run(value, studentId);
        } else if (action === 'change_group') {
          db.prepare('UPDATE students SET group_id = ? WHERE id = ?').run(value || null, studentId);
        } else if (action === 'reset_password') {
          // Note: In production this should be hashed
          db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(value || '123456', student.user_id);
        }
      }
    });

    transaction();
    res.json({ success: true, message: 'Students updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update points
router.post('/:id/points', (req: Request, res: Response) => {
  const studentId = req.params.id;
  const { amount: rawAmount, reason } = req.body; // amount can be positive or negative
  
  if (typeof rawAmount !== 'number' || isNaN(rawAmount)) {
    res.status(400).json({ success: false, message: 'Invalid amount' });
    return;
  }

  try {
    const transaction = db.transaction(() => {
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
      if (!student) throw new Error('Student not found');

      let amount = rawAmount;
      let finalReason = reason;

      // Check Parent Buff
      if (amount > 0) {
        const classConfig = db.prepare('SELECT enable_parent_buff FROM classes WHERE id = ?').get(student.class_id) as any;
        if (classConfig && classConfig.enable_parent_buff) {
          // Check if parent has activity today
          const today = new Date().toISOString().split('T')[0];
          const hasBuff = db.prepare(`
            SELECT 1 FROM parent_activity 
            WHERE student_id = ? AND date(created_at) = ?
          `).get(studentId, today);

          if (hasBuff) {
            amount = Math.ceil(amount * 1.2);
            finalReason = `${reason} (含20%家长增益)`;
          }
        }
      }

      const newTotal = amount > 0 ? student.total_points + amount : student.total_points;
      const newAvailable = Math.max(0, student.available_points + amount);

      db.prepare('UPDATE students SET total_points = ?, available_points = ? WHERE id = ?')
        .run(newTotal, newAvailable, studentId);

      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, amount > 0 ? 'ADD_POINTS' : 'DEDUCT_POINTS', amount, finalReason);
      
      // Auto-revive pet if teacher adds points
      if (amount > 0) {
        try {
          db.prepare('UPDATE pets SET last_fed_at = CURRENT_TIMESTAMP WHERE student_id = ?').run(studentId);
        } catch (e) {}
      }

      return { total_points: newTotal, available_points: newAvailable };
    });

    const result = transaction();
    res.json({ success: true, student: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get points records (all or by student_id)
router.get('/records', (req: Request, res: Response) => {
  const { studentId, teacherId } = req.query;
  try {
    let records;
    if (studentId) {
      records = db.prepare('SELECT r.*, s.name as student_name FROM records r JOIN students s ON r.student_id = s.id WHERE r.student_id = ? ORDER BY r.created_at DESC').all(studentId) as any[];
    } else if (teacherId) {
      records = db.prepare(`
        SELECT r.*, s.name as student_name 
        FROM records r 
        JOIN students s ON r.student_id = s.id 
        JOIN classes c ON s.class_id = c.id
        WHERE c.teacher_id = ? 
        ORDER BY r.created_at DESC
      `).all(teacherId) as any[];
    } else {
      records = db.prepare('SELECT r.*, s.name as student_name FROM records r JOIN students s ON r.student_id = s.id ORDER BY r.created_at DESC').all() as any[];
    }
    
    records = records.map(r => ({ ...r, student_name: decrypt(r.student_name) }));
    
    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update student birthday
router.put('/:id/birthday', (req: Request, res: Response) => {
  const { id } = req.params;
  const { birthday } = req.body;

  try {
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(id);
    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    db.prepare('UPDATE students SET birthday = ? WHERE id = ?').run(birthday, id);
    res.json({ success: true, message: 'Birthday updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get progress stars (top students based on positive points in last 7 days)
router.get('/progress-star', (req: Request, res: Response) => {
  const { classId } = req.query;
  
  try {
    let query = `
      SELECT s.id, s.name, COALESCE(SUM(r.amount), 0) as points_gained
      FROM students s
      LEFT JOIN records r ON s.id = r.student_id 
        AND r.type = 'ADD_POINTS' 
        AND r.amount > 0 
        AND r.created_at >= datetime('now', '-7 days')
    `;
    const params: any[] = [];

    if (classId) {
      query += ` WHERE s.class_id = ?`;
      params.push(classId);
    }

    query += `
      GROUP BY s.id
      HAVING points_gained > 0
      ORDER BY points_gained DESC
      LIMIT 10
    `;

    const students = db.prepare(query).all(...params) as any[];
    
    const decryptedStudents = students.map(s => ({
      ...s,
      name: decrypt(s.name)
    }));

    res.json({ success: true, students: decryptedStudents });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get and evaluate student achievements
router.get('/:id/achievements', (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as any;
    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }

    // Get current achievements
    const existingAchievements = db.prepare('SELECT achievement_name FROM user_achievements WHERE student_id = ?').all(id) as { achievement_name: string }[];
    const earnedSet = new Set(existingAchievements.map(a => a.achievement_name));
    const newAchievements: string[] = [];

    // Helper to award achievement
    const award = (name: string, description: string) => {
      if (!earnedSet.has(name)) {
        db.prepare('INSERT INTO user_achievements (student_id, achievement_name, description) VALUES (?, ?, ?)')
          .run(id, name, description);
        earnedSet.add(name);
        newAchievements.push(name);
      }
    };

    // 1. "初出茅庐": Pet level >= 2
    if (!earnedSet.has('初出茅庐')) {
      const pet = db.prepare('SELECT level FROM pets WHERE student_id = ?').get(id) as any;
      if (pet && pet.level >= 2) {
        award('初出茅庐', '宠物达到2级及以上');
      }
    }

    // 2. "自律骑士": 7 completed family tasks
    if (!earnedSet.has('自律骑士')) {
      const tasks = db.prepare('SELECT COUNT(*) as count FROM family_tasks WHERE student_id = ? AND status = ?').get(id, 'approved') as any;
      if (tasks && tasks.count >= 7) {
        award('自律骑士', '完成7个家庭任务');
      }
    }

    // 3. "非酋附体": 5 empty lucky draw records in a row
    if (!earnedSet.has('非酋附体')) {
      const draws = db.prepare(`
        SELECT r.created_at, 
          CASE WHEN w.id IS NOT NULL OR t.id IS NOT NULL THEN 1 ELSE 0 END as is_win
        FROM records r
        LEFT JOIN records w ON w.student_id = r.student_id AND w.type = 'LUCKY_DRAW_WIN' AND w.created_at = r.created_at
        LEFT JOIN redemption_tickets t ON t.student_id = r.student_id AND t.created_at = r.created_at
        WHERE r.student_id = ? AND r.type = 'LUCKY_DRAW'
        ORDER BY r.created_at ASC
      `).all(id) as any[];

      let streak = 0;
      for (const draw of draws) {
        if (draw.is_win === 0) {
          streak++;
          if (streak >= 5) {
            award('非酋附体', '连续5次抽奖未中奖');
            break;
          }
        } else {
          streak = 0;
        }
      }
    }

    const allAchievements = Array.from(earnedSet);
    res.json({ success: true, achievements: allAchievements, newAchievements });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get peer review targets (students in the same group, or same class if no group)
router.get('/:id/peer-reviews/pending', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as any;
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Determine group or class peers
    let peers: any[] = [];
    if (student.group_id) {
      peers = db.prepare('SELECT id, name FROM students WHERE group_id = ? AND id != ?').all(student.group_id, id) as any[];
    } else {
      peers = db.prepare('SELECT id, name FROM students WHERE class_id = ? AND id != ? LIMIT 10').all(student.class_id, id) as any[];
    }

    // Check who was already reviewed THIS WEEK
    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);

    const reviewedIds = new Set(
      (db.prepare('SELECT reviewee_id FROM peer_reviews WHERE reviewer_id = ? AND created_at >= ?').all(id, thisWeekStart.toISOString()) as any[])
        .map(r => r.reviewee_id)
    );

    const pendingPeers = peers
      .filter(p => !reviewedIds.has(p.id))
      .map(p => ({ id: p.id, name: decrypt(p.name) }));

    res.json({ success: true, pending: pendingPeers });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Submit a peer review
router.post('/:id/peer-reviews', (req: Request, res: Response) => {
  const { id } = req.params; // reviewer
  const { reviewee_id, score, comment, is_anonymous } = req.body;

  if (!reviewee_id || typeof score !== 'number' || score < 1 || score > 5) {
    return res.status(400).json({ success: false, message: 'Invalid review data' });
  }

  try {
    // 1. Insert review record
    db.prepare('INSERT INTO peer_reviews (reviewer_id, reviewee_id, score, comment) VALUES (?, ?, ?, ?)')
      .run(id, reviewee_id, score, comment || '');

    // 2. Award points (10 points to reviewer for doing it, score * 2 points to reviewee)
    const reviewerReward = 10;
    const revieweeReward = score * 2;

    db.transaction(() => {
      // Reviewer
      db.prepare('UPDATE students SET total_points = total_points + ?, available_points = available_points + ? WHERE id = ?')
        .run(reviewerReward, reviewerReward, id);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(id, 'ADD_POINTS', reviewerReward, '完成本周同伴互评奖励');

      // Reviewee
      db.prepare('UPDATE students SET total_points = total_points + ?, available_points = available_points + ? WHERE id = ?')
        .run(revieweeReward, revieweeReward, reviewee_id);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(reviewee_id, 'ADD_POINTS', revieweeReward, `收到同伴互评奖励 (${score}星)`);

      // 3. Send Message to Reviewee
      const reviewer = db.prepare('SELECT name FROM students WHERE id = ?').get(id) as any;
      const senderName = is_anonymous ? '一位匿名的魔法师' : decrypt(reviewer.name);
      
      const messageContent = `你收到了一份同伴评价！\n评分：${'⭐'.repeat(score)}\n评语：${comment || '无'}`;
      db.prepare('INSERT INTO messages (student_id, sender_name, sender_role, type, content, is_anonymous) VALUES (?, ?, ?, ?, ?, ?)')
        .run(reviewee_id, senderName, 'student', 'PEER_REVIEW', messageContent, is_anonymous ? 1 : 0);
    })();

    res.json({ success: true, message: '互评提交成功，已发放积分奖励！' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
