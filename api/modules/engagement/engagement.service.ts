import { Injectable } from '@nestjs/common';
import db, { decrypt } from '../../db.js';
import {
  assertActorFeatureEnabled,
  assertAnyClassFeatureEnabled,
  assertClassFeatureEnabled,
  assertStudentFeatureEnabled,
} from '../../utils/classFeatures.js';

const DEFAULT_LUCKY_DRAW_COST = 10;

@Injectable()
export class EngagementService {
  getActiveAnnouncement() {
    return db
      .prepare('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1')
      .get() || null;
  }

  getClassAnnouncements(classId: unknown) {
    return db
      .prepare('SELECT * FROM class_announcements WHERE class_id = ? ORDER BY created_at DESC')
      .all(classId);
  }

  createClassAnnouncement(input: Record<string, any>) {
    const { class_id, teacher_id, title, content } = input;
    const stmt = db.prepare('INSERT INTO class_announcements (class_id, teacher_id, title, content) VALUES (?, ?, ?, ?)');
    const info = stmt.run(class_id, teacher_id, title, content);

    return {
      id: info.lastInsertRowid,
      class_id,
      teacher_id,
      title,
      content,
      created_at: new Date().toISOString(),
    };
  }

  deleteClassAnnouncement(id: string) {
    db.prepare('DELETE FROM class_announcements WHERE id = ?').run(id);
  }

  getPraisesByClass(classId: unknown) {
    const praises = db
      .prepare(
        `
      SELECT p.*, s.name as student_name
      FROM praises p
      JOIN students s ON p.student_id = s.id
      WHERE s.class_id = ?
      ORDER BY p.created_at DESC
    `,
      )
      .all(classId) as any[];

    return praises.map((p) => ({ ...p, student_name: decrypt(p.student_name) }));
  }

  getPraisesByStudent(studentId: string) {
    const praises = db
      .prepare(
        `
      SELECT p.*, s.name as student_name
      FROM praises p
      JOIN students s ON p.student_id = s.id
      WHERE p.student_id = ?
      ORDER BY p.created_at DESC
    `,
      )
      .all(studentId) as any[];

    return praises.map((p) => ({ ...p, student_name: decrypt(p.student_name) }));
  }

  createPraise(input: Record<string, any>) {
    const { teacher_id, student_id, content, color } = input;
    const transaction = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO praises (teacher_id, student_id, content, color) VALUES (?, ?, ?, ?)')
        .run(teacher_id, student_id, content, color || 'bg-yellow-100');

      const newPraise = db.prepare('SELECT * FROM praises WHERE id = ?').get(info.lastInsertRowid);
      const pet = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(student_id) as any;
      if (pet) {
        const expGain = 20;
        const newExp = pet.experience + expGain;
        let newLevel = pet.level;
        const newAttack = Math.floor(newExp * 0.1) || 10;
        const calculatedLevel = Math.floor(newExp / 100) + 1;
        if (calculatedLevel > newLevel && calculatedLevel <= 6) {
          newLevel = calculatedLevel;
        }

        db.prepare('UPDATE pets SET experience = ?, level = ?, attack_power = ?, mood = ? WHERE id = ?').run(
          newExp,
          newLevel,
          newAttack,
          'excited',
          pet.id,
        );
      }

      return newPraise;
    });

    return transaction();
  }

  deletePraise(id: string) {
    db.prepare('DELETE FROM praises WHERE id = ?').run(id);
  }

  getCertificates(studentId: unknown) {
    let query = 'SELECT c.*, s.name as student_name FROM certificates c JOIN students s ON c.student_id = s.id';
    const params: unknown[] = [];

    if (studentId) {
      query += ' WHERE c.student_id = ?';
      params.push(studentId);
    }

    query += ' ORDER BY c.created_at DESC';

    return db.prepare(query).all(...params).map((c: any) => ({
      ...c,
      student_name: decrypt(c.student_name),
    }));
  }

  createCertificate(input: Record<string, any>) {
    const { student_id, title, description } = input;
    const stmt = db.prepare('INSERT INTO certificates (student_id, title, description) VALUES (?, ?, ?)');
    const info = stmt.run(student_id, title, description || '');

    return {
      id: info.lastInsertRowid,
      student_id,
      title,
      description,
    };
  }

  getRedemptionTickets(studentId: unknown) {
    return db.prepare(`
      SELECT r.*, i.name as item_name
      FROM redemption_tickets r
      JOIN shop_items i ON r.item_id = i.id
      WHERE r.student_id = ?
      ORDER BY r.created_at DESC
    `).all(studentId);
  }

  verifyRedemption(code: unknown) {
    const ticket = db.prepare(`
      SELECT r.*, i.name as item_name, i.teacher_id, s.name as student_name
      FROM redemption_tickets r
      JOIN shop_items i ON r.item_id = i.id
      JOIN students s ON r.student_id = s.id
      WHERE r.code = ?
    `).get(code) as any;

    if (!ticket) {
      return { status: 404, body: { success: false, message: '无效的核销码' } };
    }

    if (ticket.status === 'used') {
      return { status: 400, body: { success: false, message: '该凭证已被核销' } };
    }

    ticket.student_name = decrypt(ticket.student_name);
    db.prepare('UPDATE redemption_tickets SET status = "used", used_at = CURRENT_TIMESTAMP WHERE id = ?').run(ticket.id);

    return {
      status: 200,
      body: {
        success: true,
        message: '核销成功',
        ticket: {
          ...ticket,
          status: 'used',
        },
      },
    };
  }

  getMessages(queryInput: Record<string, any>) {
    const { classId, type, receiverId, role, involvedId } = queryInput;

    if (classId && type === 'TREE_HOLE') {
      assertAnyClassFeatureEnabled(Number(classId), ['enable_tree_hole', 'enable_chat_bubble']);
    }

    let query = `
      SELECT m.*,
             CASE WHEN m.sender_role IN ('user', 'teacher', 'parent') THEN u1.username ELSE s1.name END as sender_name,
             s2.name as receiver_name,
             c.enable_achievements,
             (
               SELECT achievement_name
               FROM user_achievements
               WHERE student_id = m.sender_id
               ORDER BY unlocked_at DESC
               LIMIT 1
             ) as top_achievement
      FROM messages m
      LEFT JOIN students s1 ON m.sender_id = s1.id AND m.sender_role = 'student'
      LEFT JOIN students s2 ON m.receiver_id = s2.id
      LEFT JOIN users u1 ON m.sender_id = u1.id AND m.sender_role IN ('user', 'teacher', 'parent')
      LEFT JOIN classes c ON m.class_id = c.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (classId) {
      query += ' AND m.class_id = ?';
      params.push(classId);
    }

    if (type) {
      query += ' AND m.type = ?';
      params.push(type);
    }

    if (receiverId) {
      query += ' AND m.receiver_id = ?';
      params.push(receiverId);
    }

    if (involvedId) {
      query += ' AND (m.sender_id = ? OR m.receiver_id = ?)';
      params.push(involvedId, involvedId);
    }

    query += ' ORDER BY m.created_at DESC';

    return (db.prepare(query).all(...params) as any[]).map((message) => {
      const m = { ...message };
      if (m.type !== 'HOME_SCHOOL' && m.sender_name) {
        m.sender_name = decrypt(m.sender_name);
      }
      if (m.receiver_name) {
        m.receiver_name = decrypt(m.receiver_name);
      }

      if (m.is_anonymous && role !== 'teacher') {
        m.sender_name = '匿名同学';
      } else if (m.enable_achievements === 1 && m.sender_role === 'student' && m.top_achievement) {
        m.sender_title = m.top_achievement;
      }

      delete m.enable_achievements;
      delete m.top_achievement;

      return m;
    });
  }

  createMessage(input: Record<string, any>) {
    const {
      class_id,
      sender_id,
      receiver_id,
      content,
      is_anonymous,
      type,
      sender_role = 'student',
    } = input;

    if (type === 'TREE_HOLE') {
      assertAnyClassFeatureEnabled(Number(class_id), ['enable_tree_hole', 'enable_chat_bubble']);
    }

    const stmt = db.prepare(`
      INSERT INTO messages (class_id, sender_id, receiver_id, content, is_anonymous, type, sender_role)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      class_id,
      sender_id,
      receiver_id || null,
      content,
      is_anonymous ? 1 : 0,
      type,
      sender_role,
    );

    return info.lastInsertRowid;
  }

  getFamilyTasks(query: Record<string, any>) {
    const { studentId, parentId } = query;
    if (studentId) {
      assertStudentFeatureEnabled(Number(studentId), 'enable_family_tasks');
      return db.prepare('SELECT * FROM family_tasks WHERE student_id = ? ORDER BY created_at DESC').all(studentId);
    }

    if (parentId) {
      assertActorFeatureEnabled(Number(parentId), 'parent', 'enable_family_tasks');
      return db.prepare('SELECT * FROM family_tasks WHERE parent_id = ? ORDER BY created_at DESC').all(parentId);
    }

    return undefined;
  }

  createFamilyTask(input: Record<string, any>) {
    const { student_id, parent_id, title, points } = input;
    assertStudentFeatureEnabled(Number(student_id), 'enable_family_tasks');
    const stmt = db.prepare('INSERT INTO family_tasks (student_id, parent_id, title, points) VALUES (?, ?, ?, ?)');
    const info = stmt.run(student_id, parent_id, title, points);

    return {
      id: info.lastInsertRowid,
      student_id,
      parent_id,
      title,
      points,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
  }

  updateFamilyTask(id: string, status: unknown) {
    const task = db.prepare('SELECT student_id FROM family_tasks WHERE id = ?').get(id) as { student_id: number } | undefined;
    if (!task) {
      return false;
    }

    assertStudentFeatureEnabled(task.student_id, 'enable_family_tasks');
    db.prepare('UPDATE family_tasks SET status = ? WHERE id = ?').run(status, id);
    return true;
  }

  deleteFamilyTask(id: string) {
    const task = db.prepare('SELECT student_id FROM family_tasks WHERE id = ?').get(id) as { student_id: number } | undefined;
    if (!task) {
      return false;
    }

    assertStudentFeatureEnabled(task.student_id, 'enable_family_tasks');
    db.prepare('DELETE FROM family_tasks WHERE id = ?').run(id);
    return true;
  }

  getLuckyDrawConfig(teacherId: unknown) {
    let tId = teacherId;
    if (!tId) {
      const teacher = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('teacher') as any;
      tId = teacher ? teacher.id : 1;
    }

    const configs = db
      .prepare('SELECT * FROM lucky_draw_config WHERE teacher_id = ? AND is_active = 1 ORDER BY id ASC')
      .all(tId) as any[];

    if (configs.length === 0) {
      return { configs: [], cost_points: DEFAULT_LUCKY_DRAW_COST };
    }

    return { configs, cost_points: configs[0].cost_points };
  }

  updateLuckyDrawConfig(input: Record<string, any>) {
    const { teacher_id, cost_points, configs } = input;
    let tId = teacher_id;
    if (!tId) {
      const teacher = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('teacher') as any;
      tId = teacher ? teacher.id : 1;
    }

    db.transaction(() => {
      db.prepare('UPDATE lucky_draw_config SET is_active = 0 WHERE teacher_id = ?').run(tId);

      const stmt = db.prepare('INSERT INTO lucky_draw_config (teacher_id, cost_points, prize_name, prize_type, prize_value, probability, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)');
      for (const conf of configs) {
        stmt.run(tId, cost_points || DEFAULT_LUCKY_DRAW_COST, conf.prize_name, conf.prize_type, conf.prize_value || null, conf.probability || 0);
      }
    })();
  }

  drawLuckyPrize(studentId: unknown) {
    const student = db.prepare(`
      SELECT s.*, c.teacher_id
      FROM students s
      JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
    `).get(studentId) as any;

    if (!student) {
      return { status: 404, body: { success: false, message: 'Student not found' } };
    }

    const configs = db
      .prepare('SELECT * FROM lucky_draw_config WHERE teacher_id = ? AND is_active = 1')
      .all(student.teacher_id) as any[];

    if (configs.length === 0) {
      return { status: 404, body: { success: false, message: 'No active lucky draw config' } };
    }

    const costPoints = configs[0].cost_points || DEFAULT_LUCKY_DRAW_COST;

    if (student.available_points < costPoints) {
      return { status: 409, body: { success: false, message: '积分不足' } };
    }

    const totalProb = configs.reduce((acc, curr) => acc + curr.probability, 0);
    const rand = Math.floor(Math.random() * totalProb);
    let cumulative = 0;
    let wonConfig = configs[configs.length - 1];

    for (const conf of configs) {
      cumulative += conf.probability;
      if (rand < cumulative) {
        wonConfig = conf;
        break;
      }
    }

    let prizeMessage = '';
    db.transaction(() => {
      db.prepare('UPDATE students SET available_points = available_points - ? WHERE id = ?').run(costPoints, studentId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(studentId, 'LUCKY_DRAW', -costPoints, '参与翻牌抽奖');

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

    return {
      status: 200,
      body: {
        success: true,
        prize: wonConfig,
        message: prizeMessage,
      },
    };
  }

  getDanmakuMessages(classId: unknown, since: unknown) {
    assertClassFeatureEnabled(Number(classId), 'enable_danmaku');

    if (since) {
      return db.prepare(`
        SELECT * FROM danmaku_messages
        WHERE class_id = ? AND id > ?
        ORDER BY id ASC LIMIT 50
      `).all(classId, since);
    }

    return db.prepare(`
        SELECT * FROM danmaku_messages
        WHERE class_id = ?
        ORDER BY id DESC LIMIT 50
      `).all(classId).reverse();
  }

  createDanmakuMessage(input: Record<string, any>) {
    const { class_id, sender_name, content, color } = input;
    assertClassFeatureEnabled(Number(class_id), 'enable_danmaku');
    const stmt = db.prepare(`
      INSERT INTO danmaku_messages (class_id, sender_name, content, color)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(class_id, sender_name, content, color || '#ffffff');

    return db.prepare('SELECT * FROM danmaku_messages WHERE id = ?').get(info.lastInsertRowid);
  }

  cleanupDanmakuMessages() {
    db.prepare(`
      DELETE FROM danmaku_messages WHERE id NOT IN (
        SELECT id FROM danmaku_messages ORDER BY id DESC LIMIT 1000
      )
    `).run();
  }
}
