import { Router, type Request, type Response } from 'express';
import db, { decrypt } from '../db.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled, getClassFeaturesByClassId } from '../services/featureService.js';
import { adjustStudentPoints, addStudentPoints } from '../services/pointsService.js';
import { createStudentAccount, decryptStudentList, getStudentOrThrow } from '../services/studentService.js';
import { getRequestActor } from '../utils/requestAuth.js';
import { hashPassword } from '../utils/password.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

function ensureTeacherCanManageStudent(req: Request, studentId: number) {
  const actor = getRequestActor(req);
  if (actor.role === 'admin' || actor.role === 'superadmin') {
    return;
  }

  if (actor.role !== 'teacher' || !actor.id) {
    throw new ApiError(403, '无权限修改该学生');
  }

  const relation = db
    .prepare(
      `
      SELECT 1
      FROM students s
      JOIN classes c ON c.id = s.class_id
      WHERE s.id = ? AND c.teacher_id = ?
    `,
    )
    .get(studentId, actor.id);

  if (!relation) {
    throw new ApiError(403, '无权限修改该学生');
  }
}

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
  const decryptedStudents = decryptStudentList(students);
  
  res.json({ success: true, students: decryptedStudents });
}));

// Get a single student
router.get('/:id(\\d+)', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const student = db.prepare('SELECT s.*, u.username, g.name as group_name FROM students s JOIN users u ON s.user_id = u.id LEFT JOIN student_groups g ON s.group_id = g.id WHERE s.id = ?').get(id) as any;
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }
  student.name = decrypt(student.name);
  res.json({ success: true, student });
}));

// Daily check-in
router.post('/checkin', asyncHandler(async (req: Request, res: Response) => {
  const { studentId } = req.body;
  if (!studentId) {
    throw new ApiError(400, 'Missing studentId');
  }

  const transaction = db.transaction(() => {
    const student = getStudentOrThrow(studentId);

    const today = new Date().toISOString().split('T')[0];
    if ((student as any).last_checkin_date === today) {
      throw new ApiError(400, 'Already checked in today');
    }

    const amount = 5;
    const newTotal = student.total_points + amount;
    const newAvailable = student.available_points + amount;

    db.prepare('UPDATE students SET last_checkin_date = ?, total_points = ?, available_points = ? WHERE id = ?')
      .run(today, newTotal, newAvailable, student.id);

    db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
      .run(student.id, 'ADD_POINTS', amount, '每日签到奖励');

    try {
      db.prepare("UPDATE pets SET last_fed_at = datetime('now') WHERE student_id = ?").run(student.id);
    } catch {}

    return { total_points: newTotal, available_points: newAvailable };
  });

  const result = transaction();
  sendSuccess(res, { student: result, message: '签到成功，获得 5 积分' });
}));

// Gift points
router.post('/gift', asyncHandler(async (req: Request, res: Response) => {
  const { senderId, receiverId, points, message } = req.body;

  if (!senderId || !receiverId || !points || !message) {
    throw new ApiError(400, 'Missing required fields');
  }

  const amount = parseInt(points);
  if (isNaN(amount) || amount <= 0) {
    throw new ApiError(400, 'Invalid points amount');
  }

  const transaction = db.transaction(() => {
    const sender = getStudentOrThrow(senderId);
    const receiver = getStudentOrThrow(receiverId);

    if (sender.available_points < amount) throw new ApiError(400, 'Insufficient points');

    db.prepare('UPDATE students SET available_points = available_points - ? WHERE id = ?').run(amount, sender.id);
    db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
      .run(sender.id, 'DEDUCT_POINTS', amount, '赠送积分给同学');

    addStudentPoints(receiver.id, amount, 'ADD_POINTS', '收到同学赠送积分');

    const fullMessage = `[附赠 ${amount} 积分] ${message}`;
    db.prepare('INSERT INTO messages (class_id, sender_id, receiver_id, content, type) VALUES (?, ?, ?, ?, ?)')
      .run(sender.class_id, sender.id, receiver.id, fullMessage, 'PEER_REVIEW');

    return { success: true };
  });

  transaction();
  sendSuccess(res, { message: 'Gift sent successfully' });
}));

// Batch import students
router.post('/batch-import', asyncHandler(async (req: Request, res: Response) => {
  const { students, class_id } = req.body;
  
  if (!Array.isArray(students) || students.length === 0) {
    throw new ApiError(400, 'No students provided');
  }

  const transaction = db.transaction(() => {
    let importedCount = 0;
    const createdStudents = [];
    for (const student of students) {
      const { username, name } = student;
      if (!username || !name) continue;

      createdStudents.push(createStudentAccount({ username, name, classId: class_id, allowUsernameSuffix: true }));
      importedCount++;
    }
    return { importedCount, createdStudents };
  });

  const result = transaction();
  sendSuccess(res, {
    message: `成功导入 ${result.importedCount} 个学生，初始密码已安全保存`,
    importedCount: result.importedCount,
    students: result.createdStudents,
  });
}));

// Create a student
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { username, name, class_id } = req.body;

  if (!username || typeof username !== 'string' || username.trim() === '' || 
      !name || typeof name !== 'string' || name.trim() === '') {
    throw new ApiError(400, '请填写学生姓名和用户名');
  }

  try {
    const transaction = db.transaction(() => createStudentAccount({ username, name, classId: class_id }));
    const student = transaction();
    sendSuccess(res, { message: '学生创建成功，初始密码已安全保存', student });
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      throw new ApiError(409, '用户名已存在，请换一个用户名');
    }
    throw error;
  }
}));

// Batch update points
router.post('/batch-points', asyncHandler(async (req: Request, res: Response) => {
  const { studentIds, amount, reason } = req.body;
  
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new ApiError(400, 'No students selected');
  }

  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new ApiError(400, 'Invalid amount');
  }

  const transaction = db.transaction(() => {
    for (const studentId of studentIds) {
      adjustStudentPoints(studentId, amount, reason, { revivePetOnPositive: true });
    }
  });

  transaction();
  sendSuccess(res, { message: 'Points updated successfully' });
}));

router.put('/:id/class', asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  const classId = Number(req.body?.class_id);

  if (!Number.isFinite(studentId) || !Number.isFinite(classId)) {
    throw new ApiError(400, 'Invalid student or class');
  }

  ensureTeacherCanManageStudent(req, studentId);

  const targetClass = db.prepare('SELECT id FROM classes WHERE id = ?').get(classId);
  if (!targetClass) {
    throw new ApiError(404, 'Class not found');
  }

  db.prepare('UPDATE students SET class_id = ?, group_id = NULL WHERE id = ?').run(classId, studentId);
  res.json({ success: true });
}));

router.put('/:id/group', asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  const groupId = req.body?.group_id === null || req.body?.group_id === undefined || req.body?.group_id === ''
    ? null
    : Number(req.body.group_id);

  if (!Number.isFinite(studentId)) {
    throw new ApiError(400, 'Invalid student');
  }

  ensureTeacherCanManageStudent(req, studentId);

  if (groupId !== null && !Number.isFinite(groupId)) {
    throw new ApiError(400, 'Invalid group');
  }

  if (groupId !== null) {
    const group = db.prepare('SELECT id FROM student_groups WHERE id = ?').get(groupId);
    if (!group) {
      throw new ApiError(404, 'Group not found');
    }
  }

  db.prepare('UPDATE students SET group_id = ? WHERE id = ?').run(groupId, studentId);
  res.json({ success: true });
}));

router.put('/:id/password', asyncHandler(async (req: Request, res: Response) => {
  const studentId = Number(req.params.id);
  const password = typeof req.body?.password === 'string' && req.body.password.trim() ? req.body.password.trim() : '123456';

  if (!Number.isFinite(studentId)) {
    throw new ApiError(400, 'Invalid student');
  }

  ensureTeacherCanManageStudent(req, studentId);

  const student = db.prepare('SELECT user_id FROM students WHERE id = ?').get(studentId) as { user_id: number } | undefined;
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), student.user_id);
  sendSuccess(res, { message: '密码重置成功' });
}));

// Batch edit students
router.post('/batch-edit', asyncHandler(async (req: Request, res: Response) => {
  const { studentIds, action, value } = req.body;
  // action: 'change_class' | 'reset_password' | 'change_group'

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new ApiError(400, 'No students selected');
  }

  const transaction = db.transaction(() => {
    for (const studentId of studentIds) {
      const student = getStudentOrThrow(studentId);

      if (action === 'change_class') {
        db.prepare('UPDATE students SET class_id = ? WHERE id = ?').run(value, student.id);
      } else if (action === 'change_group') {
        db.prepare('UPDATE students SET group_id = ? WHERE id = ?').run(value || null, student.id);
      } else if (action === 'reset_password') {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(value || '123456'), student.user_id);
      } else {
        throw new ApiError(400, 'Invalid batch action');
      }
    }
  });

  transaction();
  sendSuccess(res, { message: 'Students updated successfully' });
}));

// Update points
router.post('/:id/points', asyncHandler(async (req: Request, res: Response) => {
  const studentId = req.params.id;
  const { amount: rawAmount, reason } = req.body; // amount can be positive or negative
  
  if (typeof rawAmount !== 'number' || isNaN(rawAmount)) {
    throw new ApiError(400, 'Invalid amount');
  }

  const transaction = db.transaction(() => {
    const student = getStudentOrThrow(studentId);

    let amount = rawAmount;
    let finalReason = reason;

    if (amount > 0) {
      const classFeatures = getClassFeaturesByClassId(student.class_id);
      if (classFeatures.enable_parent_buff) {
        const today = new Date().toISOString().split('T')[0];
        const hasBuff = db.prepare(`
          SELECT 1 FROM parent_activity 
          WHERE student_id = ? AND date(created_at) = ?
        `).get(student.id, today);

        if (hasBuff) {
          amount = Math.ceil(amount * 1.2);
          finalReason = `${reason} (含20%家长增益)`;
        }
      }
    }

    return adjustStudentPoints(student.id, amount, finalReason, { revivePetOnPositive: true });
  });

  const result = transaction();
  sendSuccess(res, { student: result });
}));

// Get points records (all or by student_id)
router.get('/records', asyncHandler(async (req: Request, res: Response) => {
  const { studentId, teacherId } = req.query;
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
  
  sendSuccess(res, { records });
}));

// Update student birthday
router.put('/:id/birthday', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { birthday } = req.body;

  getStudentOrThrow(id);
  db.prepare('UPDATE students SET birthday = ? WHERE id = ?').run(birthday, id);
  sendSuccess(res, { message: 'Birthday updated successfully' });
}));

// Get progress stars (top students based on positive points in last 7 days)
router.get('/progress-star', asyncHandler(async (req: Request, res: Response) => {
  const { classId } = req.query;
  
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
  const decryptedStudents = decryptStudentList(students);

  sendSuccess(res, { students: decryptedStudents });
}));

// Get and evaluate student achievements
router.get('/:id/achievements', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const student = getStudentOrThrow(id);

  assertClassFeatureEnabled(student.class_id, 'enable_achievements');

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
  sendSuccess(res, { achievements: allAchievements, newAchievements });
}));

// Get peer review targets (students in the same group, or same class if no group)
router.get('/:id/peer-reviews/pending', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const student = getStudentOrThrow(id);

  assertClassFeatureEnabled(student.class_id, 'enable_peer_review');

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

  sendSuccess(res, { pending: pendingPeers });
}));

// Submit a peer review
router.post('/:id/peer-reviews', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params; // reviewer
  const { reviewee_id, score, comment, is_anonymous } = req.body;

  if (!reviewee_id || typeof score !== 'number' || score < 1 || score > 5) {
    throw new ApiError(400, 'Invalid review data');
  }

  assertStudentFeatureEnabled(Number(id), 'enable_peer_review');

    db.prepare('INSERT INTO peer_reviews (reviewer_id, reviewee_id, score, comment) VALUES (?, ?, ?, ?)')
      .run(id, reviewee_id, score, comment || '');

    const reviewerReward = 10;
    const revieweeReward = score * 2;

    db.transaction(() => {
      db.prepare('UPDATE students SET total_points = total_points + ?, available_points = available_points + ? WHERE id = ?')
        .run(reviewerReward, reviewerReward, id);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(id, 'ADD_POINTS', reviewerReward, '完成本周同伴互评奖励');

      db.prepare('UPDATE students SET total_points = total_points + ?, available_points = available_points + ? WHERE id = ?')
        .run(revieweeReward, revieweeReward, reviewee_id);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(reviewee_id, 'ADD_POINTS', revieweeReward, `收到同伴互评奖励 (${score}星)`);

      const reviewer = db.prepare('SELECT name FROM students WHERE id = ?').get(id) as any;
      const senderName = is_anonymous ? '一位匿名的魔法师' : decrypt(reviewer.name);
      
      const messageContent = `你收到了一份同伴评价！\n评分：${'⭐'.repeat(score)}\n评语：${comment || '无'}`;
      db.prepare('INSERT INTO messages (student_id, sender_name, sender_role, type, content, is_anonymous) VALUES (?, ?, ?, ?, ?, ?)')
        .run(reviewee_id, senderName, 'student', 'PEER_REVIEW', messageContent, is_anonymous ? 1 : 0);
    })();

  sendSuccess(res, { message: '互评提交成功，已发放积分奖励！' });
}));

export default router;
