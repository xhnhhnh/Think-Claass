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

    /**
     * Roster rows for an explicit student set, same projection as `listStudentDetails`.
     *
     * `GET /api/students` resolves a *scope* from the caller first - a teacher's classes, a
     * parent's children, a student's own row - and this is the one read that turns that id
     * set back into rows. Ids are bound individually, and an empty list answers `[]` without
     * a query: `IN ()` is a syntax error, and "no ids" must never widen into "every student"
     * (the same rule `listStudentAccountsByClassIds` documents for the deletion scope).
     */
    listStudentDetailsByIds(studentIds: number[]): StudentDetailRow[] {
      if (studentIds.length === 0) return [];
      const placeholders = studentIds.map(() => '?').join(', ');
      return db.query<StudentDetailRow>(`${STUDENT_DETAIL_SELECT} WHERE s.id IN (${placeholders})`, studentIds);
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

    setStudentClassId(studentId: number, classId: number): void {
      db.run(`UPDATE students SET class_id = ?, group_id = NULL WHERE id = ?`, [classId, studentId]);
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

    /**
     * The progress-star rows of an explicit student set.
     *
     * Same aggregate, window and ordering as `listProgressStar`, but scoped by student ids
     * rather than by class. The id form exists because the scoped callers cannot use the
     * class form: a student may only see their own row (the global `LIMIT 10` would drop it),
     * and a teacher's answer must be the union over the classes they own, not one class.
     */
    listProgressStarForStudents(studentIds: number[]): Array<{ id: number; name: string; points_gained: number }> {
      if (studentIds.length === 0) return [];
      const placeholders = studentIds.map(() => '?').join(', ');
      return db.query<{ id: number; name: string; points_gained: number }>(
        `SELECT s.id, s.name, COALESCE(SUM(r.amount), 0) as points_gained
           FROM students s
           LEFT JOIN records r ON s.id = r.student_id
             AND r.type = 'ADD_POINTS'
             AND r.amount > 0
             AND r.created_at >= datetime('now', '-7 days')
          WHERE s.id IN (${placeholders})
          GROUP BY s.id
         HAVING points_gained > 0
          ORDER BY points_gained DESC
          LIMIT 10`,
        studentIds,
      );
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

    // -- account-deletion scope (P4.3b.14) -----------------------------------
    //
    // `DELETE /api/admin/users/:id` deletes a teacher, their classes and their students. The
    // console owns none of those tables, so it asks for the *scope* here and then hands each id
    // set to the domain that deletes it. Both reads are ids only: a row-shaped answer would
    // invite a second projection of `classes`/`students` to drift from `ClassSnapshot`.

    /** The cascade's `classes.findMany({ where: { teacher_id } })` (`admin.repository.ts:201-205`). */
    listClassIdsByTeacher(teacherId: unknown): number[] {
      return db
        .query<{ id: number }>(`SELECT id FROM classes WHERE teacher_id = ? ORDER BY id ASC`, [teacherId as never])
        .map((row) => row.id);
    },

    /**
     * The cascade's `students.findMany({ where: { class_id: { in: classIds } },
     * select: { id, user_id } })` (`admin.repository.ts:207-212`).
     *
     * `user_id` stays nullable: a roster row exists before the login does, and the deletion still
     * has to remove it. An empty id set returns `[]` without a statement, because `IN ()` is a
     * syntax error and "no classes" must never widen into "every student".
     */
    listStudentAccountsByClassIds(classIds: number[]): Array<{ id: number; user_id: number | null }> {
      if (classIds.length === 0) return [];
      return db.query<{ id: number; user_id: number | null }>(
        `SELECT id, user_id FROM students WHERE class_id IN (${classIds.map(() => '?').join(', ')}) ORDER BY id ASC`,
        classIds,
      );
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

    insertRecord(studentId: unknown, type: string, amount: number, description: unknown): number {
      const result = db.run(`INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)`, [
        studentId as never,
        type,
        amount,
        description as never,
      ]);
      return Number(result.lastInsertRowid);
    },

    incentivePolicy(classId: number): { school_stage: string; parent_bonus_percent: number; team_rankings_visible: number } {
      return db.get<{ school_stage: string; parent_bonus_percent: number; team_rankings_visible: number }>(
        `SELECT school_stage, parent_bonus_percent, team_rankings_visible FROM p_classroom_incentive_policies WHERE class_id = ?`, [classId],
      ) ?? { school_stage: 'general', parent_bonus_percent: 0, team_rankings_visible: 1 };
    },

    setIncentivePolicy(classId: number, stage: string, bonus: number, rankings: boolean): void {
      db.run(`INSERT INTO p_classroom_incentive_policies (class_id, school_stage, parent_bonus_percent, team_rankings_visible)
              VALUES (?, ?, ?, ?) ON CONFLICT(class_id) DO UPDATE SET school_stage = excluded.school_stage,
              parent_bonus_percent = excluded.parent_bonus_percent, team_rankings_visible = excluded.team_rankings_visible`,
        [classId, stage, bonus, rankings ? 1 : 0]);
    },

    findPointEvent(studentId: number, requestId: string): Record<string, unknown> | undefined {
      return db.get<Record<string, unknown>>(`SELECT * FROM p_classroom_point_events WHERE student_id = ? AND request_id = ?`, [studentId, requestId]);
    },

    insertPointEvent(event: { studentId: number; recordId: number; requestId?: string; source: string; category: string; growth: number; credits: number; participation?: number; requested?: number; total?: number; available?: number }): void {
      db.run(`INSERT INTO p_classroom_point_events (student_id, record_id, request_id, source, category, rule_version, growth_delta, credits_delta, participation_delta, requested_delta, growth_balance, credits_balance)
              VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
        [event.studentId, event.recordId, event.requestId ?? null, event.source, event.category, event.growth, event.credits, event.participation ?? 0, event.requested ?? null, event.total ?? null, event.available ?? null]);
    },

    teacherPositiveToday(studentId: number): { base: number; bonus: number } {
      const result = db.get<{ base: number; bonus: number }>(
        `SELECT COALESCE(SUM(CASE WHEN growth_delta > 0 THEN growth_delta ELSE 0 END), 0) AS base,
                COALESCE(SUM(CASE WHEN credits_delta > growth_delta THEN credits_delta - growth_delta ELSE 0 END), 0) AS bonus
           FROM p_classroom_point_events WHERE student_id = ? AND source = 'teacher_score'
             AND date(created_at, '+8 hours') = date('now', '+8 hours')`, [studentId]);
      return result ?? { base: 0, bonus: 0 };
    },

    pointSummary(studentId: number): Array<{ category: string; score: number; participation: number }> {
      return db.query<{ category: string; score: number; participation: number }>(
        `SELECT category, COALESCE(SUM(growth_delta),0) AS score, COALESCE(SUM(participation_delta),0) AS participation
           FROM p_classroom_point_events WHERE student_id = ? GROUP BY category`, [studentId]);
    },

    weeklyTeamScores(classId: number, category: 'collaboration' | 'competition'): Array<{ group_id: number; group_name: string; members: number; score: number }> {
      return db.query<{ group_id: number; group_name: string; members: number; score: number }>(
        `SELECT g.id AS group_id, g.name AS group_name, COUNT(DISTINCT s.id) AS members,
                COALESCE(SUM(CASE WHEN e.growth_delta > 0 THEN e.growth_delta ELSE 0 END),0) * 1.0 / COUNT(DISTINCT s.id) AS score
           FROM student_groups g JOIN students s ON s.group_id = g.id
           LEFT JOIN p_classroom_point_events e ON e.student_id = s.id AND e.category = ?
             AND date(e.created_at, '+8 hours') >= date('now', '+8 hours', 'weekday 0', '-6 days')
          WHERE g.class_id = ? GROUP BY g.id ORDER BY score DESC, g.id ASC`, [category, classId]);
    },

    hasParentActivityShanghaiToday(studentId: number): boolean {
      return !!db.get(`SELECT 1 FROM parent_activity WHERE student_id = ? AND activity_type = 'PARENT_BUFF' AND date(created_at, '+8 hours') = date('now', '+8 hours') LIMIT 1`, [studentId]);
    },

    approvedFamilyTask(taskId: number): { student_id: number; points: number; title: string } | undefined {
      return db.get<{ student_id: number; points: number; title: string }>(
        `SELECT student_id, points, title FROM family_tasks WHERE id = ? AND status = 'approved'`, [taskId]);
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
     * The ledger rows of an explicit student set, newest first.
     *
     * `listRecords` narrows to one student or one teacher; a parent's read scope is the list
     * of children linked to them, so the multi-student form exists here instead of looping
     * the single-student query per child. Same projection and same ordering as the branches
     * above, and an empty list answers `[]` without a query.
     */
    listRecordsForStudents(studentIds: number[]): LedgerRow[] {
      if (studentIds.length === 0) return [];
      const placeholders = studentIds.map(() => '?').join(', ');
      return db.query<LedgerRow>(
        `SELECT r.*, s.name as student_name
           FROM records r JOIN students s ON r.student_id = s.id
          WHERE r.student_id IN (${placeholders})
          ORDER BY r.created_at DESC`,
        studentIds,
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

    /**
     * One leave request, for the authorization check `PUT /api/leaves/:id` needs.
     *
     * The reviewer must be the teacher of the class the requesting student belongs to, which
     * cannot be decided from the request body - it is a property of the row being changed.
     */
    findLeave(id: unknown): Record<string, unknown> | undefined {
      return db.get<Record<string, unknown>>(`SELECT * FROM leave_requests WHERE id = ?`, [id as never]);
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
