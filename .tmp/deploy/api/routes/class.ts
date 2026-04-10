import { Router, type Request, type Response } from 'express';
import db, { decrypt } from '../db.js';

const router = Router();

// Get all classes
router.get('/', (req: Request, res: Response) => {
  const { teacherId } = req.query;
  try {
    let classes;
    if (teacherId) {
      classes = db.prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at ASC').all(teacherId);
    } else {
      classes = db.prepare('SELECT * FROM classes ORDER BY created_at ASC').all();
    }
    res.json({ success: true, classes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get students of a class by invite code (unregistered only for student role)
router.get('/invite/:code', (req: Request, res: Response) => {
  const { code } = req.params;
  const { role } = req.query;
  try {
    const cls = db.prepare('SELECT id, name FROM classes WHERE invite_code = ?').get(code) as any;
    if (!cls) {
      res.status(404).json({ success: false, message: '无效的邀请码' });
      return;
    }

    let students;
    if (role === 'parent') {
      // Parents can select any student in the class
      students = db.prepare('SELECT id, name FROM students WHERE class_id = ?').all(cls.id) as any[];
    } else {
      // Fetch students in this class who haven't registered (user_id is NULL)
      students = db.prepare('SELECT id, name FROM students WHERE class_id = ? AND user_id IS NULL').all(cls.id) as any[];
    }
    
    // Decrypt student names
    students = students.map(s => ({ ...s, name: decrypt(s.name) }));

    res.json({ success: true, class: cls, students });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create a class
router.post('/', (req: Request, res: Response) => {
  const { name, teacher_id } = req.body;
  if (!name) {
    res.status(400).json({ success: false, message: 'Class name is required' });
    return;
  }

  try {
    let tId = teacher_id;
    if (!tId) {
      const teacher = db.prepare('SELECT id FROM users WHERE role = ?').get('teacher') as any;
      if (!teacher) {
        res.status(400).json({ success: false, message: 'Teacher not found' });
        return;
      }
      tId = teacher.id;
    }

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const stmt = db.prepare('INSERT INTO classes (name, teacher_id, invite_code) VALUES (?, ?, ?)');
    const info = stmt.run(name, tId, inviteCode);
    
    res.json({ success: true, class: { id: info.lastInsertRowid, name, teacher_id: tId, invite_code: inviteCode } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get a single class
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
    if (!cls) {
      res.status(404).json({ success: false, message: 'Class not found' });
      return;
    }
    res.json({ success: true, class: cls });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get class data for big screen (read-only, no strict auth)
router.get('/:id/bigscreen', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const cls = db.prepare('SELECT id, name, invite_code FROM classes WHERE id = ?').get(id) as any;
    if (!cls) {
      res.status(404).json({ success: false, message: '班级未找到' });
      return;
    }

    // Top 10 students by points
    const topStudentsRaw = db.prepare(`
      SELECT id, name, total_points, available_points 
      FROM students 
      WHERE class_id = ? 
      ORDER BY total_points DESC 
      LIMIT 10
    `).all(id) as any[];
    const topStudents = topStudentsRaw.map(s => ({ ...s, name: decrypt(s.name) }));

    // Latest 10 praises (表扬动态)
    const latestPraisesRaw = db.prepare(`
      SELECT p.id, p.content, p.color, p.created_at, s.name as student_name, 'praise' as type
      FROM praises p
      JOIN students s ON p.student_id = s.id
      WHERE s.class_id = ?
      ORDER BY p.created_at DESC
      LIMIT 10
    `).all(id) as any[];
    const latestPraises = latestPraisesRaw.map(p => ({ ...p, student_name: decrypt(p.student_name) }));

    // Latest 10 point records (积分动态)
    const latestRecordsRaw = db.prepare(`
      SELECT r.id, r.type, r.amount, r.description as content, r.created_at, s.name as student_name
      FROM records r
      JOIN students s ON r.student_id = s.id
      WHERE s.class_id = ? AND r.type = 'ADD_POINTS'
      ORDER BY r.created_at DESC
      LIMIT 10
    `).all(id) as any[];
    const latestRecords = latestRecordsRaw.map(r => ({ ...r, student_name: decrypt(r.student_name) }));

    res.json({ 
      success: true, 
      class: cls, 
      topStudents, 
      latestPraises,
      latestRecords
    });
  } catch (error) {
    console.error('Bigscreen API Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update class settings/features
router.put(['/:id/settings', '/:id/features'], (req: Request, res: Response) => {
  const { id } = req.params;
  const { 
    enable_chat_bubble, 
    enable_peer_review, 
    enable_tree_hole,
    enable_shop,
    enable_lucky_draw,
    enable_challenge,
    enable_family_tasks,
    pet_selection_mode
  } = req.body;

  try {
    const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(id) as any;
    if (!cls) {
      res.status(404).json({ success: false, message: 'Class not found' });
      return;
    }

    db.prepare(`
      UPDATE classes 
      SET enable_chat_bubble = COALESCE(?, enable_chat_bubble),
          enable_peer_review = COALESCE(?, enable_peer_review),
          enable_tree_hole = COALESCE(?, enable_tree_hole),
          enable_shop = COALESCE(?, enable_shop),
          enable_lucky_draw = COALESCE(?, enable_lucky_draw),
          enable_challenge = COALESCE(?, enable_challenge),
          enable_family_tasks = COALESCE(?, enable_family_tasks),
          pet_selection_mode = COALESCE(?, pet_selection_mode)
      WHERE id = ?
    `).run(
      enable_chat_bubble !== undefined ? (enable_chat_bubble ? 1 : 0) : null,
      enable_peer_review !== undefined ? (enable_peer_review ? 1 : 0) : null,
      enable_tree_hole !== undefined ? (enable_tree_hole ? 1 : 0) : null,
      enable_shop !== undefined ? (enable_shop ? 1 : 0) : null,
      enable_lucky_draw !== undefined ? (enable_lucky_draw ? 1 : 0) : null,
      enable_challenge !== undefined ? (enable_challenge ? 1 : 0) : null,
      enable_family_tasks !== undefined ? (enable_family_tasks ? 1 : 0) : null,
      pet_selection_mode !== undefined ? pet_selection_mode : null,
      id
    );

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;