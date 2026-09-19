/**
 * Classroom repository - the single source of SQL for the whole domain.
 *
 * Both consumers share this one object: `classroom.public` (the port every other plugin
 * depends on) and the HTTP service that `api/modules/classroom` used to own. Before the
 * migration they were two implementations reading the same tables; keeping one repository
 * is what makes "the port keeps behaving byte for byte" checkable rather than hopeful.
 *
 * ## Two access paths, and why
 *
 * `ctx.db` is ownership-checked. The plugin owns `students`, `classes` and `records`
 * (`data.adopted`), and it *reads* a set of tables other domains own - those reads are
 * declared in `plugin.json` `data.reads`. Every statement against one of those goes
 * through `ctx.db`.
 *
 * The HTTP surface also has to WRITE tables it does not own: the legacy service created
 * `users` rows, attendance, leave requests, presets, groups, achievements, peer-review
 * notifications and the "feed the pet" touch, and every one of those writes is part of
 * the endpoint contract this migration must not change. `ctx.db` refuses writes to a
 * table that is only declared as a read - deliberately - and the plugin cannot adopt them
 * either:
 *
 *   * `users` is core/identity data with several writers (auth, admin), not classroom's;
 *   * `peer_reviews` is adopted by `plugins/collaboration`;
 *   * `pets` is adopted by `plugins/pet`;
 *   * `messages`, `student_groups`, `point_presets`, `attendance_records`,
 *     `leave_requests`, `user_achievements` have no owner yet;
 *   * `capability_assignments` is kernel-owned.
 *
 * So those specific statements go through `ctx.rawDb`, and every one of them is listed
 * here, next to the reason. This is recorded as `_known_debt` in the manifest: the fix is
 * a port from the owning plugin (`pet.public.feed`, a collaboration peer-review port, an
 * identity port for student accounts) or, for the tables nobody owns, a decision to give
 * them to classroom. Until then the alternative would be silently dropping live
 * behaviour - a migration is not allowed to change the endpoint contract.
 */

import type { KernelContext } from '@thinkclass/plugin-sdk';

import type {
  ClassRow,
  LedgerRow,
  StudentDetailRow,
  StudentRow,
} from './classroom.types.js';

/** The INNER JOINs the legacy `listStudents` / `getStudent` used, kept verbatim. */
const STUDENT_DETAIL_SELECT = `
  SELECT s.*, u.username, g.name as group_name
  FROM students s
  JOIN users u ON s.user_id = u.id
  LEFT JOIN student_groups g ON s.group_id = g.id
`;

export function createClassroomRepository(ctx: KernelContext) {
  /** Owned tables plus declared reads: ownership-checked. */
  const db = ctx.db;
  /**
   * Writes to tables this plugin does not own. Deliberately a separate handle so the
   * foreign writes are one grep away; `ctx.db` would (correctly) refuse them.
   */
  const raw = ctx.rawDb;

  return {
    /** Run `fn` inside one SQLite transaction. Works across both handles: same connection. */
    tx<T>(fn: () => T): T {
      return db.tx(() => fn());
    },

    // -- students (owned) ----------------------------------------------------

    findStudentRow(studentId: unknown): StudentRow | undefined {
      return db.get<StudentRow>(`SELECT * FROM students WHERE id = ?`, [studentId as never]);
    },

    /**
     * Resolve a student from the *user* id an actor carries.
     *
     * `RequestContext.actor` only guarantees `userId`; the session and the legacy-header
     * bridge never populate `studentId`, so actor-gated routes need this lookup. Kept in
     * the repository because it is the port's `getStudentByUserId`, and the port and the
     * routes must not diverge.
     */
    findStudentByUserId(userId: unknown): StudentRow | undefined {
      return db.get<StudentRow>(`SELECT * FROM students WHERE user_id = ? ORDER BY id LIMIT 1`, [userId as never]);
    },

    /** Port roster read: `ORDER BY id` is part of the port's contract. */
    listClassStudents(classId: unknown): StudentRow[] {
      return db.query<StudentRow>(`SELECT * FROM students WHERE class_id = ? ORDER BY id`, [classId as never]);
    },

    /**
     * Name-fragment search over classes, excluding one id.
     *
     * SQLite treats a negative LIMIT as "no limit", which is what the legacy query branch
     * did - it filtered by name and returned every match. Applying the unfiltered branch's
     * LIMIT 10 to both would silently truncate search results.
     */
    searchClasses(query: unknown, excludeClassId: unknown, limit: number): ClassRow[] {
      return query
        ? db.query<ClassRow>(`SELECT * FROM classes WHERE name LIKE ? AND id != ? LIMIT ?`, [
            `%${query}%`,
            excludeClassId as never,
            limit,
          ])
        : db.query<ClassRow>(`SELECT * FROM classes WHERE id != ? LIMIT ?`, [
            excludeClassId as never,
            limit === -1 ? 10 : limit,
          ]);
    },

    getStudentDetail(id: unknown): StudentDetailRow | undefined {
      return db.get<StudentDetailRow>(`${STUDENT_DETAIL_SELECT} WHERE s.id = ?`, [id as never]);
    },

    listStudentDetails(classId?: unknown): StudentDetailRow[] {
      const base = STUDENT_DETAIL_SELECT;
      return classId
        ? db.query<StudentDetailRow>(`${base} WHERE s.class_id = ?`, [classId as never])
        : db.query<StudentDetailRow>(base);
    },

    studentUserId(studentId: unknown): { user_id: number } | undefined {
      return db.get<{ user_id: number }>(`SELECT user_id FROM students WHERE id = ?`, [studentId as never]);
    },

    studentName(studentId: unknown): { name: string } | undefined {
      return db.get<{ name: string }>(`SELECT name FROM students WHERE id = ?`, [studentId as never]);
    },

    /** `getInvite`: unbound students only, unless the caller is a parent. */
    listClassStudentNames(classId: number, onlyUnbound: boolean): Array<{ id: number; name: string }> {
      return onlyUnbound
        ? db.query<{ id: number; name: string }>(
            `SELECT id, name FROM students WHERE class_id = ? AND user_id IS NULL`,
            [classId],
          )
        : db.query<{ id: number; name: string }>(`SELECT id, name FROM students WHERE class_id = ?`, [classId]);
    },

    setStudentCheckin(studentId: number, today: string, total: number, available: number): void {
      db.run(`UPDATE students SET last_checkin_date = ?, total_points = ?, available_points = ? WHERE id = ?`, [
        today,
        total,
        available,
        studentId,
      ]);
    },

    setStudentPoints(studentId: number, total: number, available: number): void {
      db.run(`UPDATE students SET total_points = ?, available_points = ? WHERE id = ?`, [total, available, studentId]);
    },

    subtractStudentAvailable(studentId: number, amount: number): void {
      db.run(`UPDATE students SET available_points = available_points - ? WHERE id = ?`, [amount, studentId]);
    },

    addStudentAvailable(studentId: number, amount: number): void {
      db.run(`UPDATE students SET available_points = available_points + ? WHERE id = ?`, [amount, studentId]);
    },

    addStudentPointsPair(studentId: number, amount: number): void {
      db.run(
        `UPDATE students SET total_points = total_points + ?, available_points = available_points + ? WHERE id = ?`,
        [amount, amount, studentId],
      );
    },

    moveStudentToClass(studentId: number, classId: number): void {
      db.run(`UPDATE students SET class_id = ?, group_id = NULL WHERE id = ?`, [classId, studentId]);
    },

    /** `batchEdit`'s `change_class`: unlike `moveStudentToClass`, the group is kept. */
    setStudentClassId(studentId: number, classId: unknown): void {
      db.run(`UPDATE students SET class_id = ? WHERE id = ?`, [classId as never, studentId]);
    },

    setStudentGroup(studentId: number, groupId: number | null): void {
      db.run(`UPDATE students SET group_id = ? WHERE id = ?`, [groupId, studentId]);
    },

    setStudentBirthday(studentId: unknown, birthday: unknown): void {
      db.run(`UPDATE students SET birthday = ? WHERE id = ?`, [birthday as never, studentId as never]);
    },

    listClassPeers(classId: number, excludeStudentId: unknown, limit?: number): Array<{ id: number; name: string }> {
      const sql = `SELECT id, name FROM students WHERE class_id = ? AND id != ?`;
      return limit === undefined
        ? db.query<{ id: number; name: string }>(sql, [classId, excludeStudentId as never])
        : db.query<{ id: number; name: string }>(`${sql} LIMIT ?`, [classId, excludeStudentId as never, limit]);
    },

    listGroupPeers(groupId: number, excludeStudentId: unknown): Array<{ id: number; name: string }> {
      return db.query<{ id: number; name: string }>(`SELECT id, name FROM students WHERE group_id = ? AND id != ?`, [
        groupId,
        excludeStudentId as never,
      ]);
    },

    listProgressStar(classId?: unknown): Array<{ id: number; name: string; points_gained: number }> {
      let query = `
        SELECT s.id, s.name, COALESCE(SUM(r.amount), 0) as points_gained
        FROM students s
        LEFT JOIN records r ON s.id = r.student_id
          AND r.type = 'ADD_POINTS'
          AND r.amount > 0
          AND r.created_at >= datetime('now', '-7 days')
      `;
      const params: unknown[] = [];

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

      return db.query<{ id: number; name: string; points_gained: number }>(query, params as never[]);
    },

    /** The `students` half of `createStudentAccount`; the `users` half is a foreign write. */
    insertStudent(userId: number, classId: number, encryptedName: string): number {
      const result = db.run(`INSERT INTO students (user_id, class_id, name) VALUES (?, ?, ?)`, [
        userId,
        classId,
        encryptedName,
      ]);
      return Number(result.lastInsertRowid);
    },

    // -- classes (owned) -----------------------------------------------------

    findClassRow(classId: unknown): ClassRow | undefined {
      return db.get<ClassRow>(`SELECT * FROM classes WHERE id = ?`, [classId as never]);
    },

    /** `resolveDefaultClassId`'s fallback: the first class in the database, or none. */
    firstClassId(): { id: number } | undefined {
      return db.get<{ id: number }>(`SELECT id FROM classes LIMIT 1`);
    },

    classBasic(id: unknown): { id: number; name: string; invite_code: string } | undefined {      return db.get<{ id: number; name: string; invite_code: string }>(
        `SELECT id, name, invite_code FROM classes WHERE id = ?`,
        [id as never],
      );
    },

    classGuildFlag(id: unknown): { id: number; enable_guild_pk: unknown } | undefined {
      return db.get<{ id: number; enable_guild_pk: unknown }>(
        `SELECT id, enable_guild_pk FROM classes WHERE id = ?`,
        [id as never],
      );
    },

    classPetSelectionMode(id: unknown): { pet_selection_mode: string | null } | undefined {
      return db.get<{ pet_selection_mode: string | null }>(
        `SELECT pet_selection_mode FROM classes WHERE id = ?`,
        [id as never],
      );
    },

    ownedClassByTeacher(classId: number, teacherId: number): { id: number } | undefined {
      return db.get<{ id: number }>(`SELECT id FROM classes WHERE id = ? AND teacher_id = ?`, [classId, teacherId]);
    },

    studentRelationToTeacher(studentId: number, teacherId: number): { ok: number } | undefined {
      return db.get<{ ok: number }>(
        `SELECT 1 AS ok FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND c.teacher_id = ?`,
        [studentId, teacherId],
      );
    },

    listClassesByTeacher(teacherId: unknown): ClassRow[] {
      return db.query<ClassRow>(`SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at ASC`, [
        teacherId as never,
      ]);
    },

    listClassesForStudentUser(userId: unknown): ClassRow[] {
      return db.query<ClassRow>(
        `SELECT c.* FROM classes c JOIN students s ON s.class_id = c.id WHERE s.user_id = ? ORDER BY c.created_at ASC`,
        [userId as never],
      );
    },

    listClassesForParentUser(userId: unknown): ClassRow[] {
      return db.query<ClassRow>(
        `SELECT DISTINCT c.*
           FROM classes c
           JOIN students s ON s.class_id = c.id
           JOIN parent_students ps ON ps.student_id = s.id
          WHERE ps.parent_id = ?
          ORDER BY c.created_at ASC`,
        [userId as never],
      );
    },

    listAllClasses(): ClassRow[] {
      return db.query<ClassRow>(`SELECT * FROM classes ORDER BY created_at ASC`);
    },

    classByInviteCode(code: unknown): { id: number; name: string } | undefined {
      return db.get<{ id: number; name: string }>(`SELECT id, name FROM classes WHERE invite_code = ?`, [code as never]);
    },

    insertClass(name: string, teacherId: unknown, inviteCode: string): number {
      const info = db.run(`INSERT INTO classes (name, teacher_id, invite_code) VALUES (?, ?, ?)`, [
        name,
        teacherId as never,
        inviteCode,
      ]);
      return Number(info.lastInsertRowid);
    },

    updateClassPetSelectionMode(id: unknown, mode: unknown): void {
      db.run(`UPDATE classes SET pet_selection_mode = ? WHERE id = ?`, [mode as never, id as never]);
    },

    /**
     * Write one legacy flag column.
     *
     * The column name comes from the class row's own column list (`legacyKeysOf`), so it
     * cannot be attacker controlled - the same argument `api/utils/classFeatures.ts` made.
     */
    updateClassFeatureColumn(classId: number, column: string, enabled: boolean): void {
      db.run(`UPDATE classes SET \`${column}\` = ? WHERE id = ?`, [enabled ? 1 : 0, classId]);
    },

    /** Guild ranking aggregate: `student_groups` is a declared read, `students` is owned. */
    guildRanking(classId: unknown): Array<{ id: number; name: string; total_score: number }> {
      return db.query<{ id: number; name: string; total_score: number }>(
        `SELECT sg.id, sg.name, SUM(s.total_points) as total_score
           FROM student_groups sg
           JOIN students s ON s.group_id = sg.id
          WHERE sg.class_id = ?
          GROUP BY sg.id
          ORDER BY total_score DESC`,
        [classId as never],
      );
    },

    // -- records: the shared point ledger (owned) ----------------------------

    insertRecord(studentId: unknown, type: string, amount: number, description: unknown): void {
      db.run(`INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)`, [
        studentId as never,
        type,
        amount,
        description as never,
      ]);
    },

    /**
     * Ledger read behind `classroom.public.listStudentLedger`.
     *
     * `created_at DESC, id DESC`: the id tie-break is what makes the order deterministic
     * for entries written in the same second, which the port's consumers rely on.
     */
    listStudentLedger(studentId: unknown, limit?: number): LedgerRow[] {
      const base = `SELECT id, student_id, type, amount, description, created_at
                      FROM records WHERE student_id = ? ORDER BY created_at DESC, id DESC`;
      return limit === undefined
        ? db.query<LedgerRow>(base, [studentId as never])
        : db.query<LedgerRow>(`${base} LIMIT ?`, [studentId as never, limit]);
    },

    /** Points a class earned (`ADD_POINTS`) since an instant - needs the `students` join. */
    sumClassPointsEarnedSince(classId: unknown, since: unknown): number {
      const row = db.get<{ total: number | null }>(
        `SELECT SUM(r.amount) AS total
           FROM records r
           JOIN students s ON r.student_id = s.id
          WHERE s.class_id = ? AND r.created_at >= ? AND r.type = 'ADD_POINTS'`,
        [classId as never, since as never],
      );
      return row?.total ?? 0;
    },

    /**
     * `GET /api/students/records`.
     *
     * Three branches, exactly as the legacy service had them: by student, by teacher
     * (through the class they own), or everything.
     */
    listRecords(query: Record<string, any>): LedgerRow[] {
      const { studentId, teacherId } = query ?? {};
      if (studentId) {
        return db.query<LedgerRow>(
          `SELECT r.*, s.name as student_name
             FROM records r JOIN students s ON r.student_id = s.id
            WHERE r.student_id = ? ORDER BY r.created_at DESC`,
          [studentId],
        );
      }
      if (teacherId) {
        return db.query<LedgerRow>(
          `SELECT r.*, s.name as student_name
             FROM records r
             JOIN students s ON r.student_id = s.id
             JOIN classes c ON s.class_id = c.id
            WHERE c.teacher_id = ? ORDER BY r.created_at DESC`,
          [teacherId],
        );
      }
      return db.query<LedgerRow>(
        `SELECT r.*, s.name as student_name
           FROM records r JOIN students s ON r.student_id = s.id
          ORDER BY r.created_at DESC`,
      );
    },

    /**
     * The `LUCKY_DRAW` history behind the "非酋附体" achievement.
     *
     * `redemption_tickets` is marketplace-owned; declared as a read in the manifest, so it
     * travels through `ctx.db`.
     */
    listLuckyDraws(studentId: unknown): Array<{ created_at: string; is_win: number }> {
      return db.query<{ created_at: string; is_win: number }>(
        `SELECT r.created_at,
                CASE WHEN w.id IS NOT NULL OR t.id IS NOT NULL THEN 1 ELSE 0 END as is_win
           FROM records r
           LEFT JOIN records w ON w.student_id = r.student_id AND w.type = 'LUCKY_DRAW_WIN' AND w.created_at = r.created_at
           LEFT JOIN redemption_tickets t ON t.student_id = r.student_id AND t.created_at = r.created_at
          WHERE r.student_id = ? AND r.type = 'LUCKY_DRAW'
          ORDER BY r.created_at ASC`,
        [studentId as never],
      );
    },

    // -- users: identity data with no owner yet (foreign writes) -------------

    /** Declared read: used by `createClass` and `createPreset` to pick a default teacher. */
    findTeacherId(limitOne: boolean): { id: number } | undefined {
      const sql = `SELECT id FROM users WHERE role = ?${limitOne ? ' LIMIT 1' : ''}`;
      return db.get<{ id: number }>(sql, ['teacher']);
    },

    /** Declared read: the `allowUsernameSuffix` loop in `createStudentAccount`. */
    usernameExists(username: string): { id: number } | undefined {
      return db.get<{ id: number }>(`SELECT id FROM users WHERE username = ?`, [username]);
    },

    /**
     * FOREIGN WRITE - `users` is identity data, not classroom's.
     *
     * The legacy `createStudentAccount` inserted the login row and then the `students`
     * row; both halves are kept, because a student account without a login is not a
     * student the product can hand a password to.
     */
    insertUser(username: string, passwordHash: string): number {
      const info = raw
        .prepare(`INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)`)
        .run('student', username, passwordHash);
      return Number(info.lastInsertRowid);
    },

    /** FOREIGN WRITE - same reason: `users` belongs to the (unmigrated) identity domain. */
    updateUserPassword(userId: unknown, passwordHash: string): void {
      raw.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId as never);
    },

    // -- student_groups: foreign writes, declared read ----------------------

    listGroups(classId: unknown): Array<Record<string, unknown>> {
      return db.query<Record<string, unknown>>(`SELECT * FROM student_groups WHERE class_id = ? ORDER BY id ASC`, [
        classId as never,
      ]);
    },

    /** FOREIGN WRITE - `student_groups` has no owning plugin yet. */
    insertGroup(name: unknown, classId: number): number {
      const info = raw.prepare(`INSERT INTO student_groups (name, class_id) VALUES (?, ?)`).run(name as never, classId);
      return Number(info.lastInsertRowid);
    },

    findGroup(groupId: unknown): Record<string, unknown> | undefined {
      return db.get<Record<string, unknown>>(`SELECT * FROM student_groups WHERE id = ?`, [groupId as never]);
    },

    /** Is `groupId` a group of the class `studentId` is in? (`assignStudent`'s guard.) */
    groupBelongsToStudentClass(studentId: unknown, groupId: unknown): { id: number } | undefined {
      return db.get<{ id: number }>(
        `SELECT g.id
           FROM student_groups g
           JOIN students s ON s.id = ?
          WHERE g.id = ? AND g.class_id = s.class_id`,
        [studentId as never, groupId as never],
      );
    },

    // -- point_presets: foreign writes, declared read -----------------------

    listPresets(teacherId?: unknown): Array<Record<string, unknown>> {
      return teacherId
        ? db.query<Record<string, unknown>>(`SELECT * FROM point_presets WHERE teacher_id = ? ORDER BY id ASC`, [
            teacherId as never,
          ])
        : db.query<Record<string, unknown>>(`SELECT * FROM point_presets ORDER BY id ASC`);
    },

    /** FOREIGN WRITE - `point_presets` has no owning plugin yet. */
    insertPreset(label: unknown, amount: unknown, teacherId: unknown): number {
      const info = raw
        .prepare(`INSERT INTO point_presets (label, amount, teacher_id) VALUES (?, ?, ?)`)
        .run(label as never, amount as never, teacherId as never);
      return Number(info.lastInsertRowid);
    },

    findPreset(id: unknown): Record<string, unknown> | undefined {
      return db.get<Record<string, unknown>>(`SELECT * FROM point_presets WHERE id = ?`, [id as never]);
    },

    /** FOREIGN WRITE - see `insertPreset`. */
    deletePreset(id: unknown): void {
      raw.prepare(`DELETE FROM point_presets WHERE id = ?`).run(id as never);
    },

    // -- attendance_records: foreign writes, declared read ------------------

    listAttendance(queryInput: Record<string, any>): Array<Record<string, unknown>> {
      const { class_id, student_id, date } = queryInput ?? {};
      let query = 'SELECT * FROM attendance_records WHERE 1=1';
      const params: unknown[] = [];

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

      return db.query<Record<string, unknown>>(query, params as never[]);
    },

    /** FOREIGN WRITE - `attendance_records` has no owning plugin yet. */
    deleteAttendance(classId: unknown, studentId: unknown, date: unknown): void {
      raw
        .prepare(`DELETE FROM attendance_records WHERE class_id = ? AND student_id = ? AND date = ?`)
        .run(classId as never, studentId as never, date as never);
    },

    /** FOREIGN WRITE - see `deleteAttendance`. */
    insertAttendance(
      classId: unknown,
      studentId: unknown,
      date: unknown,
      status: unknown,
      remark: unknown,
    ): void {
      raw
        .prepare(
          `INSERT INTO attendance_records (class_id, student_id, date, status, remark) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(classId as never, studentId as never, date as never, status as never, remark as never);
    },

    // -- leave_requests: foreign writes, declared read ----------------------

    listLeaves(queryInput: Record<string, any>): Array<Record<string, unknown>> {
      const { student_id, parent_id, status } = queryInput ?? {};
      let query = 'SELECT * FROM leave_requests WHERE 1=1';
      const params: unknown[] = [];

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

      return db.query<Record<string, unknown>>(query, params as never[]);
    },

    /** FOREIGN WRITE - `leave_requests` has no owning plugin yet. */
    insertLeave(
      studentId: unknown,
      parentId: unknown,
      startDate: unknown,
      endDate: unknown,
      reason: unknown,
    ): number | bigint {
      const info = raw
        .prepare(
          `INSERT INTO leave_requests (student_id, parent_id, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(studentId as never, parentId as never, startDate as never, endDate as never, reason as never);
      return info.lastInsertRowid;
    },

    /** FOREIGN WRITE - see `insertLeave`. */
    updateLeave(id: unknown, status: unknown, reviewerId: unknown, comment: unknown): void {
      raw
        .prepare(`UPDATE leave_requests SET status = ?, reviewer_id = ?, review_comment = ? WHERE id = ?`)
        .run(status as never, reviewerId as never, comment as never, id as never);
    },

    // -- user_achievements: foreign writes, declared read -------------------

    listAchievementNames(studentId: unknown): Array<{ achievement_name: string }> {
      return db.query<{ achievement_name: string }>(
        `SELECT achievement_name FROM user_achievements WHERE student_id = ?`,
        [studentId as never],
      );
    },

    /** FOREIGN WRITE - `user_achievements` has no owning plugin yet. */
    insertAchievement(studentId: unknown, name: string, description: string): void {
      raw
        .prepare(`INSERT INTO user_achievements (student_id, achievement_name, description) VALUES (?, ?, ?)`)
        .run(studentId as never, name, description);
    },

    // -- peer_reviews: collaboration's table; foreign write, declared read ---

    listReviewedIds(reviewerId: unknown, sinceIso: string): Array<{ reviewee_id: number }> {
      return db.query<{ reviewee_id: number }>(
        `SELECT reviewee_id FROM peer_reviews WHERE reviewer_id = ? AND created_at >= ?`,
        [reviewerId as never, sinceIso],
      );
    },

    /**
     * FOREIGN WRITE - `peer_reviews` is adopted by `plugins/collaboration`, and
     * collaboration has no peer-review port yet. The classroom route writes the student
     * self-review flavour of the same table; splitting a write across a plugin boundary
     * needs the port decision recorded in the manifest debt note.
     */
    insertPeerReview(reviewerId: unknown, revieweeId: unknown, score: number, comment: unknown): void {
      raw
        .prepare(`INSERT INTO peer_reviews (reviewer_id, reviewee_id, score, comment) VALUES (?, ?, ?, ?)`)
        .run(reviewerId as never, revieweeId as never, score, comment as never);
    },

    // -- messages: foreign writes -------------------------------------------

    /** FOREIGN WRITE - `messages` has no owning plugin (engagement also writes it). */
    insertGiftMessage(classId: unknown, senderId: unknown, receiverId: unknown, content: string): void {
      raw
        .prepare(`INSERT INTO messages (class_id, sender_id, receiver_id, content, type) VALUES (?, ?, ?, ?, ?)`)
        .run(classId as never, senderId as never, receiverId as never, content, 'PEER_REVIEW');
    },

    /** FOREIGN WRITE - see `insertGiftMessage`. */
    insertPeerReviewMessage(
      studentId: unknown,
      senderName: string,
      content: string,
      isAnonymous: unknown,
    ): void {
      raw
        .prepare(
          `INSERT INTO messages (student_id, sender_name, sender_role, type, content, is_anonymous)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(studentId as never, senderName, 'student', 'PEER_REVIEW', content, isAnonymous ? 1 : 0);
    },

    // -- read-only cross-domain reads (declared in the manifest) ------------

    petLevel(studentId: unknown): { level: number } | undefined {
      return db.get<{ level: number }>(`SELECT level FROM pets WHERE student_id = ?`, [studentId as never]);
    },

    familyTaskCount(studentId: unknown): { count: number } | undefined {
      return db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM family_tasks WHERE student_id = ? AND status = ?`,
        [studentId as never, 'approved'],
      );
    },

    hasParentActivityToday(studentId: unknown, today: string): { present: number } | undefined {
      // `date(created_at)`, not `last_active_date`: this is the query the legacy
      // `updateStudentPoints` buff check ran, and the two columns are written by
      // different code paths. Changing it would change who gets the 20% buff.
      return db.get<{ present: number }>(
        `SELECT 1 AS present FROM parent_activity WHERE student_id = ? AND date(created_at) = ?`,
        [studentId as never, today],
      );
    },

    listPraisesForClass(classId: unknown): Array<Record<string, unknown>> {
      return db.query<Record<string, unknown>>(
        `SELECT p.id, p.content, p.color, p.created_at, s.name as student_name, 'praise' as type
           FROM praises p
           JOIN students s ON p.student_id = s.id
          WHERE s.class_id = ?
          ORDER BY p.created_at DESC
          LIMIT 10`,
        [classId as never],
      );
    },

    listTopStudents(classId: unknown): Array<Record<string, unknown>> {
      return db.query<Record<string, unknown>>(
        `SELECT id, name, total_points, available_points
           FROM students
          WHERE class_id = ?
          ORDER BY total_points DESC
          LIMIT 10`,
        [classId as never],
      );
    },

    listClassRecordsForBigscreen(classId: unknown): Array<Record<string, unknown>> {
      return db.query<Record<string, unknown>>(
        `SELECT r.id, r.type, r.amount, r.description as content, r.created_at, s.name as student_name
           FROM records r
           JOIN students s ON r.student_id = s.id
          WHERE s.class_id = ? AND r.type = 'ADD_POINTS'
          ORDER BY r.created_at DESC
          LIMIT 10`,
        [classId as never],
      );
    },

    activeWorldBoss(): Record<string, unknown> | undefined {
      return db.get<Record<string, unknown>>(
        `SELECT * FROM world_bosses WHERE status = ? ORDER BY id DESC LIMIT 1`,
        ['active'],
      );
    },

    // -- best-effort pet touch (foreign write) ------------------------------

    /**
     * "Feeding the pet" side effect of check-in and of any positive point adjustment.
     *
     * FOREIGN WRITE - `pets` belongs to `plugins/pet`, which cannot be called from here:
     * pet depends on classroom, so a port call would be a dependency cycle, and
     * `pet.public` has no feed/revive method. The legacy code wrapped this in a bare
     * `try {} catch {}` because old databases may lack the column; the caller keeps that
     * shape.
     */
    touchPetFedAt(studentId: number, mode: 'datetime-now' | 'current-timestamp'): void {
      const expression = mode === 'datetime-now' ? `datetime('now')` : 'CURRENT_TIMESTAMP';
      raw.prepare(`UPDATE pets SET last_fed_at = ${expression} WHERE student_id = ?`).run(studentId);
    },

    // -- kernel-owned capability assignments (foreign write) ----------------

    /**
     * FOREIGN WRITE - `capability_assignments` is kernel-owned storage.
     *
     * `PermissionsApi` is deliberately read-only (`assignedTo`), so a plugin cannot write
     * an assignment through the SDK. The legacy `setClassFeatures` dual-wrote the
     * assignment and the legacy column; dropping the assignment half would make a toggle
     * appear to do nothing for any class that already has one, because resolution is
     * assignment-first. Mirrors `createSqliteAssignmentStore.set` exactly.
     *
     * The duck-typed `assign` branch is the forward-compatible path: if the SDK grows an
     * assignment writer, this code uses it without another migration.
     */
    setCapabilityAssignment(scopeType: string, scopeId: number, capabilityKey: string, enabled: boolean): void {
      const permissions = ctx.permissions as { assign?: (input: Record<string, unknown>) => void };
      if (typeof permissions.assign === 'function') {
        permissions.assign({ scopeType, scopeId, capabilityKey, enabled });
        return;
      }

      raw
        .prepare(
          `INSERT INTO capability_assignments (scope_type, scope_id, capability_key, enabled, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (scope_type, scope_id, capability_key)
           DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
        )
        .run(scopeType, scopeId, capabilityKey, enabled ? 1 : 0, new Date().toISOString());
    },

    // -- parent <-> student, and account binding (the identity port) --------
    //
    // These three exist because `parent_students` and `students.user_id` are classroom rows
    // that the identity domain has to write during registration. See
    // `ClassroomPort.linkParentToStudent` / `bindStudentToUser` for why the write lives here.

    /** The students a parent account is linked to. `ORDER BY id` is part of the port contract. */
    listStudentsByParent(parentId: unknown): StudentRow[] {
      return db.query<StudentRow>(
        `SELECT s.*
           FROM students s
           JOIN parent_students ps ON ps.student_id = s.id
          WHERE ps.parent_id = ?
          ORDER BY s.id`,
        [parentId as never],
      );
    },

    /**
     * Names for a set of student ids, one query.
     *
     * Ids are bound as individual parameters rather than interpolated; an empty list returns
     * nothing without a query, because `IN ()` is a syntax error in SQLite and building the string
     * is the one place this could go wrong with attacker-influenced input.
     */
    listStudentNamesByIds(studentIds: number[]): Array<{ id: number; name: string }> {
      if (studentIds.length === 0) return [];
      const placeholders = studentIds.map(() => '?').join(',');
      return db.query<{ id: number; name: string }>(
        `SELECT id, name FROM students WHERE id IN (${placeholders})`,
        studentIds as never[],
      );
    },

    /**
     * Link a parent to a student, tolerating a repeat.
     *
     * `INSERT OR IGNORE` rather than a bare INSERT: the PRIMARY KEY is
     * `(parent_id, student_id)`, and the pre-migration registration simply inserted, so
     * re-running it for the same pair must stay a no-op instead of throwing a constraint error.
     */
    linkParentToStudent(parentId: unknown, studentId: unknown): void {
      db.run(`INSERT OR IGNORE INTO parent_students (parent_id, student_id) VALUES (?, ?)`, [
        parentId as never,
        studentId as never,
      ]);
    },

    /**
     * Bind a login account to a student row and store the displayed name.
     *
     * `name` is passed already encrypted by the caller (`cipher.encrypt`); this method owns only
     * the SQL. See the port for why the encryption is not the caller's business: the caller that
     * forgets it writes plaintext into a column the product decrypts on read.
     */
    bindStudentAccount(studentId: unknown, userId: unknown, encryptedName: string | null): void {
      db.run(`UPDATE students SET user_id = ?, name = ? WHERE id = ?`, [
        userId as never,
        encryptedName as never,
        studentId as never,
      ]);
    },
  };
}

export type ClassroomRepository = ReturnType<typeof createClassroomRepository>;
