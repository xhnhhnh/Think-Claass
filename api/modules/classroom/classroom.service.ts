import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import db, { decrypt } from '../../db.js';
import { addStudentPoints, adjustStudentPoints } from '../../services/pointsService.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled, getClassFeaturesByClassId } from '../../services/featureService.js';
import { createStudentAccount, decryptStudentList, getStudentOrThrow } from '../../services/studentService.js';
import { ApiError } from '../../utils/apiError.js';
import { classFeatureKeys, pickClassFeatures } from '../../utils/classFeatures.js';
import { hashPassword } from '../../utils/password.js';
import { getRequestActor } from '../../utils/requestAuth.js';

@Injectable()
export class ClassroomService {
  private ensureTeacherCanManageClass(req: Request, classIdInput: unknown) {
    const classId = Number(classIdInput);
    if (!Number.isFinite(classId)) {
      throw new ApiError(400, 'Invalid class');
    }

    const actor = getRequestActor(req);
    if (actor.role === 'admin' || actor.role === 'superadmin') return classId;

    if (actor.role !== 'teacher' || !actor.id) {
      throw new ApiError(403, '无权限管理该班级');
    }

    const ownedClass = db.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?').get(classId, actor.id);
    if (!ownedClass) {
      throw new ApiError(403, '无权限管理该班级');
    }

    return classId;
  }

  private ensureTeacherCanManageStudent(req: Request, studentId: number) {
    const actor = getRequestActor(req);
    if (actor.role === 'admin' || actor.role === 'superadmin') return;

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

  listStudents(classId?: unknown) {
    let query = 'SELECT s.*, u.username, g.name as group_name FROM students s JOIN users u ON s.user_id = u.id LEFT JOIN student_groups g ON s.group_id = g.id';
    const params: any[] = [];

    if (classId) {
      query += ' WHERE s.class_id = ?';
      params.push(classId);
    }

    const students = db.prepare(query).all(...params) as any[];
    return decryptStudentList(students);
  }

  getStudent(id: string) {
    const student = db
      .prepare('SELECT s.*, u.username, g.name as group_name FROM students s JOIN users u ON s.user_id = u.id LEFT JOIN student_groups g ON s.group_id = g.id WHERE s.id = ?')
      .get(id) as any;
    if (!student) throw new ApiError(404, 'Student not found');
    student.name = decrypt(student.name);
    return student;
  }

  checkin(input: Record<string, any>) {
    const { studentId } = input ?? {};
    if (!studentId) throw new ApiError(400, 'Missing studentId');

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

    return { student: transaction(), message: '签到成功，获得 5 积分' };
  }

  gift(input: Record<string, any>) {
    const { senderId, receiverId, points, message } = input ?? {};
    if (!senderId || !receiverId || !points || !message) {
      throw new ApiError(400, 'Missing required fields');
    }

    const amount = parseInt(points);
    if (isNaN(amount) || amount <= 0) throw new ApiError(400, 'Invalid points amount');

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
    });

    transaction();
    return { message: 'Gift sent successfully' };
  }

  batchImport(input: Record<string, any>) {
    const { students, class_id } = input ?? {};
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
    return {
      message: `成功导入 ${result.importedCount} 个学生，初始密码已安全保存`,
      importedCount: result.importedCount,
      students: result.createdStudents,
    };
  }

  createStudent(input: Record<string, any>) {
    const { username, name, class_id } = input ?? {};
    if (
      !username ||
      typeof username !== 'string' ||
      username.trim() === '' ||
      !name ||
      typeof name !== 'string' ||
      name.trim() === ''
    ) {
      throw new ApiError(400, '请填写学生姓名和用户名');
    }

    try {
      const transaction = db.transaction(() => createStudentAccount({ username, name, classId: class_id }));
      const student = transaction();
      return { message: '学生创建成功，初始密码已安全保存', student };
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint failed')) {
        throw new ApiError(409, '用户名已存在，请换一个用户名');
      }
      throw error;
    }
  }

  batchPoints(input: Record<string, any>) {
    const { studentIds, amount, reason } = input ?? {};
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
    return { message: 'Points updated successfully' };
  }

  updateStudentClass(req: Request, idInput: string, input: Record<string, any>) {
    const studentId = Number(idInput);
    const classId = Number(input?.class_id);
    if (!Number.isFinite(studentId) || !Number.isFinite(classId)) {
      throw new ApiError(400, 'Invalid student or class');
    }

    this.ensureTeacherCanManageStudent(req, studentId);
    const targetClass = db.prepare('SELECT id FROM classes WHERE id = ?').get(classId);
    if (!targetClass) throw new ApiError(404, 'Class not found');

    db.prepare('UPDATE students SET class_id = ?, group_id = NULL WHERE id = ?').run(classId, studentId);
  }

  updateStudentGroup(req: Request, idInput: string, input: Record<string, any>) {
    const studentId = Number(idInput);
    const groupId = input?.group_id === null || input?.group_id === undefined || input?.group_id === ''
      ? null
      : Number(input.group_id);

    if (!Number.isFinite(studentId)) throw new ApiError(400, 'Invalid student');
    this.ensureTeacherCanManageStudent(req, studentId);

    if (groupId !== null && !Number.isFinite(groupId)) throw new ApiError(400, 'Invalid group');
    if (groupId !== null) {
      const group = db
        .prepare(
          `
        SELECT g.id
        FROM student_groups g
        JOIN students s ON s.id = ?
        WHERE g.id = ? AND g.class_id = s.class_id
      `,
        )
        .get(studentId, groupId);
      if (!group) throw new ApiError(400, '小组不属于该学生所在班级');
    }

    db.prepare('UPDATE students SET group_id = ? WHERE id = ?').run(groupId, studentId);
  }

  resetStudentPassword(req: Request, idInput: string, input: Record<string, any>) {
    const studentId = Number(idInput);
    const password = typeof input?.password === 'string' && input.password.trim() ? input.password.trim() : '123456';
    if (!Number.isFinite(studentId)) throw new ApiError(400, 'Invalid student');

    this.ensureTeacherCanManageStudent(req, studentId);
    const student = db.prepare('SELECT user_id FROM students WHERE id = ?').get(studentId) as { user_id: number } | undefined;
    if (!student) throw new ApiError(404, 'Student not found');

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), student.user_id);
    return { message: '密码重置成功' };
  }

  batchEdit(input: Record<string, any>) {
    const { studentIds, action, value } = input ?? {};
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
    return { message: 'Students updated successfully' };
  }

  updateStudentPoints(idInput: string, input: Record<string, any>) {
    const { amount: rawAmount, reason } = input ?? {};
    if (typeof rawAmount !== 'number' || isNaN(rawAmount)) {
      throw new ApiError(400, 'Invalid amount');
    }

    const transaction = db.transaction(() => {
      const student = getStudentOrThrow(idInput);
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

    return transaction();
  }

  getRecords(query: Record<string, any>) {
    const { studentId, teacherId } = query ?? {};
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

    return records.map((r) => ({ ...r, student_name: decrypt(r.student_name) }));
  }

  updateBirthday(id: string, input: Record<string, any>) {
    const { birthday } = input ?? {};
    getStudentOrThrow(id);
    db.prepare('UPDATE students SET birthday = ? WHERE id = ?').run(birthday, id);
    return { message: 'Birthday updated successfully' };
  }

  getProgressStar(classId?: unknown) {
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
    return decryptStudentList(students);
  }

  getAchievements(id: string) {
    const student = getStudentOrThrow(id);
    assertClassFeatureEnabled(student.class_id, 'enable_achievements');

    const existingAchievements = db.prepare('SELECT achievement_name FROM user_achievements WHERE student_id = ?').all(id) as { achievement_name: string }[];
    const earnedSet = new Set(existingAchievements.map((achievement) => achievement.achievement_name));
    const newAchievements: string[] = [];

    const award = (name: string, description: string) => {
      if (!earnedSet.has(name)) {
        db.prepare('INSERT INTO user_achievements (student_id, achievement_name, description) VALUES (?, ?, ?)')
          .run(id, name, description);
        earnedSet.add(name);
        newAchievements.push(name);
      }
    };

    if (!earnedSet.has('初出茅庐')) {
      const pet = db.prepare('SELECT level FROM pets WHERE student_id = ?').get(id) as any;
      if (pet && pet.level >= 2) award('初出茅庐', '宠物达到2级及以上');
    }

    if (!earnedSet.has('自律骑士')) {
      const tasks = db.prepare('SELECT COUNT(*) as count FROM family_tasks WHERE student_id = ? AND status = ?').get(id, 'approved') as any;
      if (tasks && tasks.count >= 7) award('自律骑士', '完成7个家庭任务');
    }

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

    return { achievements: Array.from(earnedSet), newAchievements };
  }

  getPendingPeerReviews(id: string) {
    const student = getStudentOrThrow(id);
    assertClassFeatureEnabled(student.class_id, 'enable_peer_review');

    let peers: any[] = [];
    if (student.group_id) {
      peers = db.prepare('SELECT id, name FROM students WHERE group_id = ? AND id != ?').all(student.group_id, id) as any[];
    } else {
      peers = db.prepare('SELECT id, name FROM students WHERE class_id = ? AND id != ? LIMIT 10').all(student.class_id, id) as any[];
    }

    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);

    const reviewedIds = new Set(
      (db.prepare('SELECT reviewee_id FROM peer_reviews WHERE reviewer_id = ? AND created_at >= ?').all(id, thisWeekStart.toISOString()) as any[])
        .map((review) => review.reviewee_id),
    );

    return peers
      .filter((peer) => !reviewedIds.has(peer.id))
      .map((peer) => ({ id: peer.id, name: decrypt(peer.name) }));
  }

  createPeerReview(id: string, input: Record<string, any>) {
    const { reviewee_id, score, comment, is_anonymous } = input ?? {};
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

    return { message: '互评提交成功，已发放积分奖励！' };
  }

  listClasses(req: Request, teacherId?: unknown) {
    const actor = getRequestActor(req);

    if (actor.role === 'teacher' && actor.id) {
      return db.prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at ASC').all(actor.id);
    }

    if (actor.role === 'student' && actor.id) {
      return db
        .prepare(
          `
        SELECT c.*
        FROM classes c
        JOIN students s ON s.class_id = c.id
        WHERE s.user_id = ?
        ORDER BY c.created_at ASC
      `,
        )
        .all(actor.id);
    }

    if (actor.role === 'parent' && actor.id) {
      return db
        .prepare(
          `
        SELECT DISTINCT c.*
        FROM classes c
        JOIN students s ON s.class_id = c.id
        JOIN parent_students ps ON ps.student_id = s.id
        WHERE ps.parent_id = ?
        ORDER BY c.created_at ASC
      `,
        )
        .all(actor.id);
    }

    if (actor.role === 'admin' || actor.role === 'superadmin') {
      return teacherId
        ? db.prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at ASC').all(teacherId)
        : db.prepare('SELECT * FROM classes ORDER BY created_at ASC').all();
    }

    throw new ApiError(403, '无权限查看班级');
  }

  getInvite(code: string, role?: unknown) {
    const cls = db.prepare('SELECT id, name FROM classes WHERE invite_code = ?').get(code) as any;
    if (!cls) throw new ApiError(404, '无效的邀请码');

    const students = role === 'parent'
      ? db.prepare('SELECT id, name FROM students WHERE class_id = ?').all(cls.id) as any[]
      : db.prepare('SELECT id, name FROM students WHERE class_id = ? AND user_id IS NULL').all(cls.id) as any[];

    return {
      class: cls,
      students: students.map((student) => ({ ...student, name: decrypt(student.name) })),
    };
  }

  createClass(req: Request, input: Record<string, any>) {
    const { name, teacher_id } = input ?? {};
    if (!name) throw new ApiError(400, 'Class name is required');

    const actor = getRequestActor(req);
    let teacherId = actor.role === 'teacher' && actor.id ? actor.id : teacher_id;
    if (actor.role !== 'teacher' && actor.role !== 'admin' && actor.role !== 'superadmin') {
      throw new ApiError(403, '无权限创建班级');
    }
    if (!teacherId) {
      const teacher = db.prepare('SELECT id FROM users WHERE role = ?').get('teacher') as any;
      if (!teacher) throw new ApiError(400, 'Teacher not found');
      teacherId = teacher.id;
    }

    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const info = db.prepare('INSERT INTO classes (name, teacher_id, invite_code) VALUES (?, ?, ?)').run(name, teacherId, inviteCode);
    return { id: info.lastInsertRowid, name, teacher_id: teacherId, invite_code: inviteCode };
  }

  getClass(id: string) {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
    if (!cls) throw new ApiError(404, 'Class not found');
    return cls;
  }

  getClassFeatures(id: string) {
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!cls) throw new ApiError(404, 'Class not found');
    return {
      classId: Number(id),
      features: pickClassFeatures(cls),
      pet_selection_mode: cls.pet_selection_mode ?? 'random',
    };
  }

  getBigscreen(id: string) {
    const cls = db.prepare('SELECT id, name, invite_code FROM classes WHERE id = ?').get(id) as any;
    if (!cls) throw new ApiError(404, '班级未找到');

    const topStudentsRaw = db.prepare(`
    SELECT id, name, total_points, available_points 
    FROM students 
    WHERE class_id = ? 
    ORDER BY total_points DESC 
    LIMIT 10
  `).all(id) as any[];
    const latestPraisesRaw = db.prepare(`
    SELECT p.id, p.content, p.color, p.created_at, s.name as student_name, 'praise' as type
    FROM praises p
    JOIN students s ON p.student_id = s.id
    WHERE s.class_id = ?
    ORDER BY p.created_at DESC
    LIMIT 10
  `).all(id) as any[];
    const latestRecordsRaw = db.prepare(`
    SELECT r.id, r.type, r.amount, r.description as content, r.created_at, s.name as student_name
    FROM records r
    JOIN students s ON r.student_id = s.id
    WHERE s.class_id = ? AND r.type = 'ADD_POINTS'
    ORDER BY r.created_at DESC
    LIMIT 10
  `).all(id) as any[];
    const activeBoss = db.prepare('SELECT * FROM world_bosses WHERE status = ? ORDER BY id DESC LIMIT 1').get('active');

    return {
      class: cls,
      topStudents: topStudentsRaw.map((student) => ({ ...student, name: decrypt(student.name) })),
      latestPraises: latestPraisesRaw.map((praise) => ({ ...praise, student_name: decrypt(praise.student_name) })),
      latestRecords: latestRecordsRaw.map((record) => ({ ...record, student_name: decrypt(record.student_name) })),
      activeBoss,
    };
  }

  getGuildRanking(id: string) {
    const cls = db.prepare('SELECT id, enable_guild_pk FROM classes WHERE id = ?').get(id) as any;
    if (!cls) throw new ApiError(404, '班级未找到');
    if (!cls.enable_guild_pk) return { rankings: [], isEnabled: false };

    const rankings = db.prepare(`
    SELECT sg.id, sg.name, SUM(s.total_points) as total_score
    FROM student_groups sg
    JOIN students s ON s.group_id = sg.id
    WHERE sg.class_id = ?
    GROUP BY sg.id
    ORDER BY total_score DESC
  `).all(id) as any[];

    return { rankings, isEnabled: true };
  }

  updateClassSettings(id: string, input: Record<string, any>) {
    const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(id) as any;
    if (!cls) throw new ApiError(404, 'Class not found');

    const setClauses: string[] = [];
    const values: Array<number | string> = [];

    for (const key of classFeatureKeys) {
      if (input?.[key] !== undefined) {
        setClauses.push(`${key} = ?`);
        values.push(input[key] ? 1 : 0);
      }
    }

    if (input?.pet_selection_mode !== undefined) {
      setClauses.push('pet_selection_mode = ?');
      values.push(input.pet_selection_mode);
    }

    if (setClauses.length === 0) throw new ApiError(400, 'No settings provided');

    values.push(id);
    db.prepare(`UPDATE classes SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(id) as Record<string, unknown>;
    return {
      message: 'Settings updated successfully',
      features: pickClassFeatures(updated),
      pet_selection_mode: updated.pet_selection_mode ?? 'random',
    };
  }

  listGroups(req: Request, classId?: unknown) {
    if (!classId) throw new ApiError(400, 'classId is required');
    const allowedClassId = this.ensureTeacherCanManageClass(req, classId);
    return db.prepare('SELECT * FROM student_groups WHERE class_id = ? ORDER BY id ASC').all(allowedClassId);
  }

  createGroup(req: Request, input: Record<string, any>) {
    const { name, class_id } = input ?? {};
    if (!name || !class_id) throw new ApiError(400, 'Name and class_id are required');
    const allowedClassId = this.ensureTeacherCanManageClass(req, class_id);
    const info = db.prepare('INSERT INTO student_groups (name, class_id) VALUES (?, ?)').run(name, allowedClassId);
    return db.prepare('SELECT * FROM student_groups WHERE id = ?').get(info.lastInsertRowid);
  }

  assignStudent(req: Request, input: Record<string, any>) {
    const { studentId, groupId } = input ?? {};
    if (!studentId) throw new ApiError(400, 'studentId is required');
    this.ensureTeacherCanManageStudent(req, Number(studentId));
    if (groupId) {
      const group = db
        .prepare(
          `
        SELECT g.id
        FROM student_groups g
        JOIN students s ON s.id = ?
        WHERE g.id = ? AND g.class_id = s.class_id
      `,
        )
        .get(studentId, groupId);
      if (!group) throw new ApiError(400, '小组不属于该学生所在班级');
    }
    db.prepare('UPDATE students SET group_id = ? WHERE id = ?').run(groupId || null, studentId);
    return { message: 'Student assigned to group successfully' };
  }

  listPresets(teacherId?: unknown) {
    return teacherId
      ? db.prepare('SELECT * FROM point_presets WHERE teacher_id = ? ORDER BY id ASC').all(teacherId)
      : db.prepare('SELECT * FROM point_presets ORDER BY id ASC').all();
  }

  createPreset(input: Record<string, any>) {
    const { label, amount, teacher_id } = input ?? {};
    if (!label || amount === undefined) throw new ApiError(400, 'Label and amount are required');

    let teacherId = teacher_id;
    if (!teacherId) {
      const teacher = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('teacher') as any;
      teacherId = teacher ? teacher.id : 1;
    }

    const info = db.prepare('INSERT INTO point_presets (label, amount, teacher_id) VALUES (?, ?, ?)').run(label, amount, teacherId);
    return db.prepare('SELECT * FROM point_presets WHERE id = ?').get(info.lastInsertRowid);
  }

  deletePreset(id: string) {
    db.prepare('DELETE FROM point_presets WHERE id = ?').run(id);
    return { message: 'Preset deleted successfully' };
  }

  listAttendance(queryInput: Record<string, any>) {
    const { class_id, student_id, date } = queryInput ?? {};
    let query = 'SELECT * FROM attendance_records WHERE 1=1';
    const params: any[] = [];

    if (class_id) {
      query += ' AND class_id = ?';
      params.push(class_id);
    }
    if (student_id) {
      query += ' AND student_id = ?';
      params.push(student_id);
    }
    if (date) {
      query += ' AND date = ?';
      params.push(date);
    }
    query += ' ORDER BY date DESC, created_at DESC';

    return db.prepare(query).all(...params);
  }

  saveAttendance(input: Record<string, any>) {
    const { class_id, records } = input ?? {};
    const insertStmt = db.prepare(`
      INSERT INTO attendance_records (class_id, student_id, date, status, remark)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((recs: any[]) => {
      for (const rec of recs) {
        db.prepare('DELETE FROM attendance_records WHERE class_id = ? AND student_id = ? AND date = ?')
          .run(class_id, rec.student_id, rec.date);
        insertStmt.run(class_id, rec.student_id, rec.date, rec.status, rec.remark || null);
      }
    });

    transaction(records);
  }

  listLeaves(queryInput: Record<string, any>) {
    const { student_id, parent_id, status } = queryInput ?? {};
    let query = 'SELECT * FROM leave_requests WHERE 1=1';
    const params: any[] = [];

    if (student_id) {
      query += ' AND student_id = ?';
      params.push(student_id);
    }
    if (parent_id) {
      query += ' AND parent_id = ?';
      params.push(parent_id);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';

    return db.prepare(query).all(...params);
  }

  createLeave(input: Record<string, any>) {
    const { student_id, parent_id, start_date, end_date, reason } = input ?? {};
    const stmt = db.prepare(`
      INSERT INTO leave_requests (student_id, parent_id, start_date, end_date, reason)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(student_id, parent_id, start_date, end_date, reason);
    return info.lastInsertRowid;
  }

  updateLeave(id: string, input: Record<string, any>) {
    const { status, reviewer_id, review_comment } = input ?? {};
    const stmt = db.prepare(`
      UPDATE leave_requests
      SET status = ?, reviewer_id = ?, review_comment = ?
      WHERE id = ?
    `);
    stmt.run(status, reviewer_id, review_comment || null, id);
  }
}
