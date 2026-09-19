/**
 * Engagement repository - the SQL for the domain's own tables.
 *
 * Relocated from `api/modules/engagement/engagement.service.ts`, where every statement ran against
 * the shared `api/db.ts` handle. Two kinds of statement are deliberately **not** here, because
 * their tables belong to other domains (HANDOFF section 8.9 named both as blockers):
 *
 *   - `UPDATE pets SET experience, level, attack_power, mood` -> `pet.public.grantPetExperience`
 *   - `UPDATE students SET available_points / total_points` and the ledger insert ->
 *     `classroom.public.spendStudentCredits` / `adjustPoints`
 *
 * What *is* here includes the JOIN-free versions of queries that used to join `students` or
 * `users` for a display name or a feature flag. Those joins were cross-plugin table reads wearing a
 * query's clothes; the caller now resolves them through the owning port and assembles the row. The
 * SQL below therefore names only tables in this plugin's `data.adopted`, which is what makes the
 * ownership check a proof instead of a formality.
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';

export interface EngagementRepository {
  // -- announcements --------------------------------------------------------
  activeAnnouncement(): Record<string, unknown> | undefined;
  classAnnouncements(classId: SqlParam): Array<Record<string, unknown>>;
  insertClassAnnouncement(input: {
    classId: SqlParam;
    teacherId: SqlParam;
    title: unknown;
    content: unknown;
  }): number;
  deleteClassAnnouncement(id: SqlParam): void;

  // -- praises --------------------------------------------------------------
  praisesByStudentIds(studentIds: number[]): Array<Record<string, unknown>>;
  praisesByStudent(studentId: SqlParam): Array<Record<string, unknown>>;
  insertPraise(input: { teacherId: SqlParam; studentId: SqlParam; content: unknown; color: unknown }): number;
  findPraise(id: SqlParam): Record<string, unknown> | undefined;
  deletePraise(id: SqlParam): void;

  // -- certificates ---------------------------------------------------------
  certificates(studentId: SqlParam | null): Array<Record<string, unknown>>;
  insertCertificate(input: { studentId: SqlParam; title: unknown; description: unknown }): number;

  // -- redemption (shared-write table, see the manifest) --------------------
  redemptionTickets(studentId: SqlParam): Array<Record<string, unknown>>;
  redemptionByCode(code: SqlParam): Record<string, unknown> | undefined;
  markRedeemed(id: SqlParam, usedAt: string): void;

  // -- messages -------------------------------------------------------------
  messages(filter: {
    classId: SqlParam | null;
    type: SqlParam | null;
    receiverId: SqlParam | null;
    involvedId: SqlParam | null;
  }): Array<Record<string, unknown>>;
  insertMessage(input: {
    classId: SqlParam;
    senderId: SqlParam;
    receiverId: SqlParam | null;
    content: unknown;
    isAnonymous: number;
    type: unknown;
    senderRole: unknown;
  }): number;
  /** The student attached to a claim, for asserting the class gate. */
  latestAchievementName(studentId: SqlParam): string | null;
  achievementByStudentIds(studentIds: number[]): Array<{ student_id: number; achievement_name: string }>;

  // -- family tasks ---------------------------------------------------------
  familyTasksByStudent(studentId: SqlParam): Array<Record<string, unknown>>;
  familyTasksByParent(parentId: SqlParam): Array<Record<string, unknown>>;
  insertFamilyTask(input: {
    studentId: SqlParam;
    parentId: SqlParam;
    title: unknown;
    points: unknown;
  }): number;
  familyTaskStudentId(id: SqlParam): { student_id: number } | undefined;
  setFamilyTaskStatus(id: SqlParam, status: unknown): void;
  deleteFamilyTask(id: SqlParam): void;

  // -- lucky draw -----------------------------------------------------------
  luckyDrawConfigs(teacherId: SqlParam): Array<Record<string, unknown>>;
  deactivateLuckyDrawConfigs(teacherId: SqlParam): void;
  insertLuckyDrawConfig(input: {
    teacherId: SqlParam;
    costPoints: unknown;
    prizeName: unknown;
    prizeType: unknown;
    prizeValue: unknown;
    probability: unknown;
  }): void;
  insertRedemptionTicket(input: {
    studentId: SqlParam;
    itemId: SqlParam;
    code: string;
    status: string;
  }): number;

  // -- danmaku --------------------------------------------------------------
  danmakuSince(classId: SqlParam, since: SqlParam): Array<Record<string, unknown>>;
  danmakuLatest(classId: SqlParam): Array<Record<string, unknown>>;
  insertDanmaku(input: {
    classId: SqlParam;
    senderName: unknown;
    content: unknown;
    color: unknown;
  }): number;
  findDanmaku(id: SqlParam): Record<string, unknown> | undefined;
  cleanupDanmaku(keep: number): void;
}

export function createEngagementRepository(db: DbApi): EngagementRepository {
  return {
    activeAnnouncement() {
      return db.get<Record<string, unknown>>(
        'SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1',
      );
    },

    classAnnouncements(classId) {
      return db.query<Record<string, unknown>>(
        'SELECT * FROM class_announcements WHERE class_id = ? ORDER BY created_at DESC',
        [classId],
      );
    },

    insertClassAnnouncement(input) {
      const info = db.run(
        'INSERT INTO class_announcements (class_id, teacher_id, title, content) VALUES (?, ?, ?, ?)',
        [input.classId, input.teacherId, input.title as never, input.content as never],
      );
      return Number(info.lastInsertRowid);
    },

    deleteClassAnnouncement(id) {
      db.run('DELETE FROM class_announcements WHERE id = ?', [id]);
    },

    /**
     * Praises for a set of students, newest first.
     *
     * Replaces the pre-migration `JOIN students ... WHERE s.class_id = ?`: the caller resolves the
     * class roster through the classroom port and passes the ids in. The join was the only reason
     * that query could not run inside a plugin that does not own `students`.
     */
    praisesByStudentIds(studentIds) {
      if (studentIds.length === 0) return [];
      const placeholders = studentIds.map(() => '?').join(',');
      return db.query<Record<string, unknown>>(
        `SELECT * FROM praises WHERE student_id IN (${placeholders}) ORDER BY created_at DESC`,
        studentIds,
      );
    },

    praisesByStudent(studentId) {
      return db.query<Record<string, unknown>>(
        'SELECT * FROM praises WHERE student_id = ? ORDER BY created_at DESC',
        [studentId],
      );
    },

    insertPraise(input) {
      const info = db.run('INSERT INTO praises (teacher_id, student_id, content, color) VALUES (?, ?, ?, ?)', [
        input.teacherId,
        input.studentId,
        input.content as never,
        input.color as never,
      ]);
      return Number(info.lastInsertRowid);
    },

    findPraise(id) {
      return db.get<Record<string, unknown>>('SELECT * FROM praises WHERE id = ?', [id]);
    },

    deletePraise(id) {
      db.run('DELETE FROM praises WHERE id = ?', [id]);
    },

    certificates(studentId) {
      const sql = 'SELECT * FROM certificates';
      return studentId === null
        ? db.query<Record<string, unknown>>(`${sql} ORDER BY created_at DESC`)
        : db.query<Record<string, unknown>>(`${sql} WHERE student_id = ? ORDER BY created_at DESC`, [studentId]);
    },

    insertCertificate(input) {
      const info = db.run('INSERT INTO certificates (student_id, title, description) VALUES (?, ?, ?)', [
        input.studentId,
        input.title as never,
        input.description as never,
      ]);
      return Number(info.lastInsertRowid);
    },

    redemptionTickets(studentId) {
      return db.query<Record<string, unknown>>(
        `SELECT r.*, i.name AS item_name
           FROM redemption_tickets r
           JOIN shop_items i ON r.item_id = i.id
          WHERE r.student_id = ?
          ORDER BY r.created_at DESC`,
        [studentId],
      );
    },

    redemptionByCode(code) {
      // `shop_items` is marketplace-owned but declared in `data.reads`: this is a read of a
      // catalogue row for display, and the ticket's own columns stay in this plugin's hands.
      return db.get<Record<string, unknown>>(
        `SELECT r.*, i.name AS item_name, i.teacher_id
           FROM redemption_tickets r
           JOIN shop_items i ON r.item_id = i.id
          WHERE r.code = ?`,
        [code],
      );
    },

    markRedeemed(id, usedAt) {
      db.run(`UPDATE redemption_tickets SET status = 'used', used_at = ? WHERE id = ?`, [usedAt, id]);
    },

    /**
     * Messages, without the three LEFT JOINs the pre-migration query had.
     *
     * The original joined `students` (sender and receiver names), `users` (non-student senders) and
     * `classes` (the `enable_achievements` flag), plus a correlated subquery for the sender's latest
     * achievement. All four belong to other domains; the caller resolves them through the classroom
     * port and its own achievement table. The row shape this returns is the same minus the four
     * foreign columns, and the caller reassembles the response in the same order.
     */
    messages(filter) {
      let sql = 'SELECT m.* FROM messages m WHERE 1=1';
      const params: SqlParam[] = [];

      if (filter.classId !== null) {
        sql += ' AND m.class_id = ?';
        params.push(filter.classId);
      }
      if (filter.type !== null) {
        sql += ' AND m.type = ?';
        params.push(filter.type);
      }
      if (filter.receiverId !== null) {
        sql += ' AND m.receiver_id = ?';
        params.push(filter.receiverId);
      }
      if (filter.involvedId !== null) {
        sql += ' AND (m.sender_id = ? OR m.receiver_id = ?)';
        params.push(filter.involvedId, filter.involvedId);
      }

      sql += ' ORDER BY m.created_at DESC';
      return db.query<Record<string, unknown>>(sql, params);
    },

    insertMessage(input) {
      const info = db.run(
        `INSERT INTO messages (class_id, sender_id, receiver_id, content, is_anonymous, type, sender_role)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.classId,
          input.senderId,
          input.receiverId as never,
          input.content as never,
          input.isAnonymous,
          input.type as never,
          input.senderRole as never,
        ],
      );
      return Number(info.lastInsertRowid);
    },

    latestAchievementName(studentId) {
      const row = db.get<{ achievement_name: string }>(
        `SELECT achievement_name FROM user_achievements
          WHERE student_id = ? ORDER BY unlocked_at DESC LIMIT 1`,
        [studentId],
      );
      return row?.achievement_name ?? null;
    },

    achievementByStudentIds(studentIds) {
      if (studentIds.length === 0) return [];
      const placeholders = studentIds.map(() => '?').join(',');
      // One row per student, the latest - the same "top achievement" the pre-migration correlated
      // subquery produced, resolved for a whole page of messages in one query instead of per row.
      return db.query<{ student_id: number; achievement_name: string }>(
        `SELECT ua.student_id, ua.achievement_name
           FROM user_achievements ua
           JOIN (
             SELECT student_id, MAX(unlocked_at) AS latest
               FROM user_achievements
              WHERE student_id IN (${placeholders})
              GROUP BY student_id
           ) newest ON newest.student_id = ua.student_id AND newest.latest = ua.unlocked_at`,
        studentIds,
      );
    },

    familyTasksByStudent(studentId) {
      return db.query<Record<string, unknown>>(
        'SELECT * FROM family_tasks WHERE student_id = ? ORDER BY created_at DESC',
        [studentId],
      );
    },

    familyTasksByParent(parentId) {
      return db.query<Record<string, unknown>>(
        'SELECT * FROM family_tasks WHERE parent_id = ? ORDER BY created_at DESC',
        [parentId],
      );
    },

    insertFamilyTask(input) {
      const info = db.run('INSERT INTO family_tasks (student_id, parent_id, title, points) VALUES (?, ?, ?, ?)', [
        input.studentId,
        input.parentId,
        input.title as never,
        input.points as never,
      ]);
      return Number(info.lastInsertRowid);
    },

    familyTaskStudentId(id) {
      return db.get<{ student_id: number }>('SELECT student_id FROM family_tasks WHERE id = ?', [id]);
    },

    setFamilyTaskStatus(id, status) {
      db.run('UPDATE family_tasks SET status = ? WHERE id = ?', [status as never, id]);
    },

    deleteFamilyTask(id) {
      db.run('DELETE FROM family_tasks WHERE id = ?', [id]);
    },

    luckyDrawConfigs(teacherId) {
      return db.query<Record<string, unknown>>(
        'SELECT * FROM lucky_draw_config WHERE teacher_id = ? AND is_active = 1 ORDER BY id ASC',
        [teacherId],
      );
    },

    deactivateLuckyDrawConfigs(teacherId) {
      db.run('UPDATE lucky_draw_config SET is_active = 0 WHERE teacher_id = ?', [teacherId]);
    },

    insertLuckyDrawConfig(input) {
      db.run(
        `INSERT INTO lucky_draw_config
           (teacher_id, cost_points, prize_name, prize_type, prize_value, probability, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          input.teacherId,
          input.costPoints as never,
          input.prizeName as never,
          input.prizeType as never,
          input.prizeValue as never,
          input.probability as never,
        ],
      );
    },

    insertRedemptionTicket(input) {
      const info = db.run(
        'INSERT INTO redemption_tickets (student_id, item_id, code, status) VALUES (?, ?, ?, ?)',
        [input.studentId, input.itemId, input.code, input.status],
      );
      return Number(info.lastInsertRowid);
    },

    danmakuSince(classId, since) {
      return db.query<Record<string, unknown>>(
        'SELECT * FROM danmaku_messages WHERE class_id = ? AND id > ? ORDER BY id ASC LIMIT 50',
        [classId, since],
      );
    },

    danmakuLatest(classId) {
      // `.reverse()` is applied by the service: the SQL keeps the pre-migration `DESC LIMIT 50`,
      // which selects the newest 50, and the caller presents them oldest-first.
      return db.query<Record<string, unknown>>(
        'SELECT * FROM danmaku_messages WHERE class_id = ? ORDER BY id DESC LIMIT 50',
        [classId],
      );
    },

    insertDanmaku(input) {
      const info = db.run(
        'INSERT INTO danmaku_messages (class_id, sender_name, content, color) VALUES (?, ?, ?, ?)',
        [input.classId, input.senderName as never, input.content as never, input.color as never],
      );
      return Number(info.lastInsertRowid);
    },

    findDanmaku(id) {
      return db.get<Record<string, unknown>>('SELECT * FROM danmaku_messages WHERE id = ?', [id]);
    },

    cleanupDanmaku(keep) {
      db.run(
        `DELETE FROM danmaku_messages WHERE id NOT IN (
           SELECT id FROM danmaku_messages ORDER BY id DESC LIMIT ?
         )`,
        [keep],
      );
    },
  };
}
