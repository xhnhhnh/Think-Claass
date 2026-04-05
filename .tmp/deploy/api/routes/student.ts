import { Router, type Request, type Response } from 'express';
import db, { encrypt, decrypt } from '../db.js';

const router = Router();

// Get all students (optionally filter by class_id)
router.get('/', (req: Request, res: Response) => {
  const { classId } = req.query;
  try {
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
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get a single student
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const student = db.prepare('SELECT s.*, u.username, g.name as group_name FROM students s JOIN users u ON s.user_id = u.id LEFT JOIN student_groups g ON s.group_id = g.id WHERE s.id = ?').get(id) as any;
    if (!student) {
      res.status(404).json({ success: false, message: 'Student not found' });
      return;
    }
    student.name = decrypt(student.name);
    res.json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

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
  const { amount, reason } = req.body; // amount can be positive or negative
  
  try {
    const transaction = db.transaction(() => {
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
      if (!student) throw new Error('Student not found');

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

export default router;
