import { Router, type Request, type Response } from 'express';
import db, { decrypt } from '../db.js';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const { username, password, role } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ? AND role = ?').get(username, password, role) as any;
    if (user) {
      if (role === 'student') {
        const student = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id) as any;
        const cls = student ? db.prepare('SELECT * FROM classes WHERE id = ?').get(student.class_id) as any : null;
        res.json({ 
          success: true, 
          user: { id: user.id, role: user.role, username: user.username, studentId: student?.id, name: student ? decrypt(student.name) : undefined },
          classFeatures: cls ? {
            enable_chat_bubble: cls.enable_chat_bubble,
            enable_peer_review: cls.enable_peer_review,
            enable_tree_hole: cls.enable_tree_hole,
            enable_shop: cls.enable_shop,
            enable_lucky_draw: cls.enable_lucky_draw,
            enable_challenge: cls.enable_challenge,
            enable_family_tasks: cls.enable_family_tasks,
          } : null
        });
      } else if (role === 'parent') {
        const parentStudent = db.prepare('SELECT student_id FROM parent_students WHERE parent_id = ? LIMIT 1').get(user.id) as any;
        const student = parentStudent ? db.prepare('SELECT * FROM students WHERE id = ?').get(parentStudent.student_id) as any : null;
        const cls = student ? db.prepare('SELECT * FROM classes WHERE id = ?').get(student.class_id) as any : null;

        if (student) {
          db.prepare(`
            INSERT INTO parent_activity (parent_id, student_id, activity_type, last_active_date)
            VALUES (?, ?, 'login', DATE('now'))
            ON CONFLICT(parent_id, student_id) DO UPDATE SET last_active_date = DATE('now')
          `).run(user.id, student.id);
        }

        res.json({ 
          success: true, 
          user: { id: user.id, parentId: user.id, role: user.role, username: user.username, studentId: student?.id, name: student ? decrypt(student.name) : undefined },
          classFeatures: cls ? {
            enable_chat_bubble: cls.enable_chat_bubble,
            enable_peer_review: cls.enable_peer_review,
            enable_tree_hole: cls.enable_tree_hole,
            enable_shop: cls.enable_shop,
            enable_lucky_draw: cls.enable_lucky_draw,
            enable_challenge: cls.enable_challenge,
            enable_family_tasks: cls.enable_family_tasks,
          } : null
        });
      } else {
        res.json({ success: true, user: { id: user.id, role: user.role, username: user.username } });
      }
    } else {
      res.status(401).json({ success: false, message: '账号或密码错误，请重试' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/register', (req: Request, res: Response) => {
  const { username, password, role, name, invite_code, student_id } = req.body;
  try {
    let classId = 1;
    
    if (role === 'student' || role === 'parent') {
      if (!invite_code) {
        res.status(400).json({ success: false, message: '注册需要班级邀请码' });
        return;
      }
      if (!student_id) {
        res.status(400).json({ success: false, message: '请选择绑定的学生信息' });
        return;
      }
      
      const cls = db.prepare('SELECT id FROM classes WHERE invite_code = ?').get(invite_code) as { id: number };
      if (!cls) {
        res.status(400).json({ success: false, message: '无效的班级邀请码' });
        return;
      }
      
      const student = db.prepare('SELECT id, user_id FROM students WHERE id = ? AND class_id = ?').get(student_id, cls.id) as any;
      if (!student) {
        res.status(400).json({ success: false, message: '未找到该学生记录' });
        return;
      }
      if (role === 'student' && student.user_id) {
        res.status(400).json({ success: false, message: '该学生已被绑定' });
        return;
      }
      
      classId = cls.id;
    } else if (role === 'teacher') {
      const setting = db.prepare("SELECT value FROM settings WHERE key = 'allow_teacher_registration'").get() as any;
      if (setting && setting.value === '0') {
        res.status(403).json({ success: false, message: '系统暂未开放教师注册' });
        return;
      }
    }

    db.transaction(() => {
      const insertUser = db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)');
      const result = insertUser.run(role, username, password);
      
      if (role === 'student') {
        // Update existing student with the new user_id and optionally update their name
        const updateStudent = db.prepare('UPDATE students SET user_id = ?, name = ? WHERE id = ?');
        updateStudent.run(result.lastInsertRowid, name || username, student_id);
      } else if (role === 'parent') {
        const insertParentStudent = db.prepare('INSERT INTO parent_students (parent_id, student_id) VALUES (?, ?)');
        insertParentStudent.run(result.lastInsertRowid, student_id);
      }
    })();
    
    res.json({ success: true });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ success: false, message: '用户名已存在' });
    } else {
      res.status(500).json({ success: false, message: '注册失败' });
    }
  }
});

export default router;
