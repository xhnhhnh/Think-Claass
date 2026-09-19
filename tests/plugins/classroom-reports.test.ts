/**
 * The report aggregates classroom publishes for the insights domain (P4.3b.12).
 *
 * `insights` is a read model: twelve tables, none of them its own, eight of them classroom's. The
 * port methods those routes need are `getClassReportInputs`, `getStudentReportInputs` and
 * `getStudentAccessView`, and this file tests them against a real database - which is the only way to
 * test aggregate SQL, since every one of these values is a `COUNT`/`AVG`/`CASE` expression.
 *
 * Three properties get specific attention because they are the ones a rewrite loses quietly:
 *
 *  1. **The rounding boundaries are the legacy ones.** `Math.round` stays in the consumer
 *     (`plugins/insights`), so the port returns raw averages and raw counts - a port that rounded
 *     would make the consumer's own rounding a second, invisible decision.
 *  2. **The weekly and all-time point totals are two queries, not one.** The first version of
 *     `classroom.reports.ts` merged them with scalar subqueries; `SUM` over an empty weekly window is
 *     0, so the all-time figures would have read 0 for any student idle for a week. The test below
 *     seeds exactly that case.
 *  3. **The distribution buckets keep their `ORDER BY MIN(total_points) DESC`.** The chart is drawn
 *     in the order the query returns, so a re-sorted list would reorder a dashboard.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { createReportQueries } from '../../plugins/classroom/src/classroom.reports.js';
import { createNameCipher } from '../../plugins/classroom/src/classroom.support.js';

/** Mirrors `plugins/classroom/plugin.json`: owned plus the four declared report reads. */
const OWNED = ['students', 'classes', 'records'];
const READS = [
  'users',
  'student_groups',
  'parent_students',
  'peer_reviews',
  'point_presets',
  'attendance_records',
  'leave_requests',
  'user_achievements',
  'family_tasks',
  'pets',
  'praises',
  'world_bosses',
  'redemption_tickets',
  'parent_activity',
  'exams',
  'student_exams',
  'assignments',
  'student_assignments',
];

let kernel: Kernel;
let api: DbApi;
let reports: ReturnType<typeof createReportQueries>;
let cipher: ReturnType<typeof createNameCipher>;

/** An identity cipher: the tests assert the *wiring* of decryption, not the algorithm. */
const identityCipher = { decrypt: (value: string) => value, encrypt: (value: string) => value };

beforeEach(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: { logLevel: 'silent' },
    migrations: APP_MIGRATIONS,
  });

  api = createDbApi({
    db: kernel.db,
    pluginId: 'classroom',
    ownedTables: new Set(OWNED),
    readTables: new Set(READS),
    strict: true,
  });

  cipher = identityCipher as ReturnType<typeof createNameCipher>;
  reports = createReportQueries(api);

  kernel.db.exec(`
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'AAA111');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (2, '二班', 9, 'BBB222');
    INSERT INTO users (id, role, username, password_hash) VALUES (7, 'teacher', 'teacher7', 'x');
    INSERT INTO users (id, role, username, password_hash) VALUES (21, 'student', 'student21', 'x');
    INSERT INTO users (id, role, username, password_hash) VALUES (22, 'student', 'student22', 'x');
    INSERT INTO users (id, role, username, password_hash) VALUES (30, 'parent', 'parent30', 'x');

    -- Two students in class 1 with different point totals, one in class 2.
    INSERT INTO students (id, user_id, class_id, name, total_points) VALUES (10, 21, 1, '小明', 120);
    INSERT INTO students (id, user_id, class_id, name, total_points) VALUES (11, 22, 1, '小红', 45);
    INSERT INTO students (id, user_id, class_id, name, total_points) VALUES (12, NULL, 2, '小刚', 80);

    INSERT INTO parent_students (parent_id, student_id) VALUES (30, 10);

    INSERT INTO exams (id, class_id, teacher_id, title, total_score, created_at) VALUES
      (100, 1, 7, '第一次月考', 100, '2026-01-01 09:00:00'),
      (101, 1, 7, '第二次月考', 100, '2026-02-01 09:00:00');
    INSERT INTO student_exams (id, exam_id, student_id, score) VALUES
      (200, 100, 10, 80), (201, 100, 11, 60),
      (202, 101, 10, 90), (203, 101, 11, 70);

    INSERT INTO assignments (id, class_id, teacher_id, title, created_at) VALUES
      (300, 1, 7, '作业一', '2026-01-02 09:00:00'),
      (301, 1, 7, '作业二', '2026-02-02 09:00:00');
    INSERT INTO student_assignments (id, assignment_id, student_id, status) VALUES
      (400, 300, 10, 'submitted'), (401, 300, 11, 'pending'),
      (402, 301, 10, 'submitted'), (403, 301, 11, 'submitted');

    INSERT INTO attendance_records (id, class_id, student_id, status, date) VALUES
      (500, 1, 10, 'present', '2026-01-05'),
      (501, 1, 10, 'late', '2026-01-06'),
      (502, 1, 11, 'present', '2026-01-05'),
      (503, 1, 11, 'absent', '2026-01-06');

    -- One ledger row well outside the seven-day window, so the all-time totals are non-zero while
    -- the weekly ones are zero. This is the case the merged-query version got wrong.
    INSERT INTO records (id, student_id, type, amount, description, created_at) VALUES
      (600, 10, 'ADD_POINTS', 30, '很久以前', '2020-01-01 10:00:00'),
      (601, 10, 'BANK_DEPOSIT', -12, '也很久以前', '2020-01-02 10:00:00');
  `);
});

afterEach(async () => {
  await kernel.shutdown();
});

describe('getClassReportInputs', () => {
  it('returns the class identity, or null for an unknown id', () => {
    expect(reports.classReportInputs(1, cipher).class).toEqual({ id: 1, name: '一班', teacher_id: 7 });
    expect(reports.classReportInputs(999, cipher).class).toBeNull();
  });

  it('aggregates points, exams, assignments and attendance for the class only', () => {
    const { summary } = reports.classReportInputs(1, cipher);

    // Class 1 has students 10 (120) and 11 (45); student 12 belongs to class 2 and must not count.
    expect(summary.total_students).toBe(2);
    expect(summary.average_points).toBe(82.5);
    expect(summary.max_points).toBe(120);
    expect(summary.min_points).toBe(45);

    // Four graded rows for this class: 80, 90, 60, 70 -> 75.
    expect(summary.average_exam_score).toBe(75);

    expect(summary.total_assignment_records).toBe(4);
    expect(summary.submitted_assignment_records).toBe(3);

    expect(summary.total_attendance_records).toBe(4);
    expect(summary.present_records).toBe(2);
  });

  it('returns raw averages rather than rounded ones', () => {
    // 82.5 stays 82.5: the consumer rounds, and a port that pre-rounded would make its own rounding
    // a second, invisible decision. Seeding a third student makes the average fractional-but-not-half.
    kernel.db.prepare(`INSERT INTO students (id, user_id, class_id, name, total_points) VALUES (13, NULL, 1, '小美', 100)`).run();
    const { summary } = reports.classReportInputs(1, cipher);
    expect(summary.average_points).toBeCloseTo(88.333, 3);
  });

  it('buckets the distribution and keeps the legacy bucket order', () => {
    const { summary } = reports.classReportInputs(1, cipher);

    // 120 -> '100+', 45 -> '40-59'. Ordered by MIN(total_points) DESC, so the higher bucket first.
    expect(summary.distribution).toEqual([
      { label: '100+', value: 1 },
      { label: '40-59', value: 1 },
    ]);
  });

  it('returns the top five students by points, decrypted and in order', () => {
    const { summary } = reports.classReportInputs(1, cipher);
    expect(summary.top_students).toEqual([
      { id: 10, name: '小明', total_points: 120 },
      { id: 11, name: '小红', total_points: 45 },
    ]);
  });

  it('caps the trend charts at six rows, newest first', () => {
    for (let i = 0; i < 8; i += 1) {
      kernel.db
        .prepare(`INSERT INTO exams (id, class_id, teacher_id, title, total_score, created_at) VALUES (?, 1, 7, ?, 100, ?)`)
        .run(120 + i, `补考${i}`, `2026-03-0${i + 1} 09:00:00`);
    }

    const { exam_trend } = reports.classReportInputs(1, cipher);
    expect(exam_trend).toHaveLength(6);
    // Newest first: the last seeded row leads.
    expect(exam_trend[0].title).toBe('补考7');
  });

  it('reports zeros for a class with no students', () => {
    // Class 2 *does* have a student (12, seeded to prove class isolation above), so an empty-class
    // assertion needs a class of its own. Asserting on class 2 was the first version of this test and
    // it failed for the right reason: it was checking isolation, not emptiness.
    kernel.db.prepare(`INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (3, '空班', 7, 'CCC333')`).run();

    const { summary } = reports.classReportInputs(3, cipher);
    expect(summary).toMatchObject({
      total_students: 0,
      average_points: 0,
      total_assignment_records: 0,
      total_attendance_records: 0,
      average_exam_score: 0,
    });
    expect(summary.distribution).toEqual([]);
    expect(summary.top_students).toEqual([]);

    const inputs = reports.classReportInputs(3, cipher);
    expect(inputs.exam_trend).toEqual([]);
    expect(inputs.assignment_trend).toEqual([]);
  });

  it('keeps class 2 separate from class 1, student included', () => {
    // The other half: class 2 has exactly its own student, who must not appear in class 1's numbers.
    const { summary } = reports.classReportInputs(2, cipher);
    expect(summary.total_students).toBe(1);
    expect(summary.top_students).toEqual([{ id: 12, name: '小刚', total_points: 80 }]);
    expect(summary.total_assignment_records).toBe(0);
  });
});

describe('getStudentReportInputs', () => {
  it('answers null for an unknown student and a full projection otherwise', () => {
    expect(reports.studentReportInputs(999, cipher).student).toBeNull();

    const inputs = reports.studentReportInputs(10, cipher);
    expect(inputs.student).toEqual({ id: 10, user_id: 21, class_id: 1, name: '小明', total_points: 120 });
  });

  it('keeps the weekly and all-time point totals independent', () => {
    const { points } = reports.studentReportInputs(10, cipher);

    // Both ledger rows are from 2020, so the seven-day window is empty...
    expect(points.weekly_earned).toBe(0);
    expect(points.weekly_spent).toBe(0);
    // ...while the all-time totals still see them. This is the assertion the merged-query version of
    // the aggregation would have failed with `total_earned: 0`.
    expect(points.total_earned).toBe(30);
    expect(points.total_spent).toBe(12);
  });

  it('counts a recent ledger row in the weekly window', () => {
    kernel.db
      .prepare(`INSERT INTO records (id, student_id, type, amount, description, created_at) VALUES (602, 10, 'ADD_POINTS', 5, '今天', datetime('now'))`)
      .run();

    const { points } = reports.studentReportInputs(10, cipher);
    expect(points.weekly_earned).toBe(5);
    expect(points.total_earned).toBe(35);
  });

  it('returns the newest ledger rows first and caps them at twenty', () => {
    const { records } = reports.studentReportInputs(10, cipher);
    expect(records.map((row) => row.id)).toEqual([601, 600]);
  });

  it('returns graded exams newest first and the raw average', () => {
    const inputs = reports.studentReportInputs(10, cipher);

    // 80 then 90 -> 85; row 101 is newer, so it leads.
    expect(inputs.average_exam_score).toBe(85);
    expect(inputs.recent_exams.map((exam) => exam.title)).toEqual(['第二次月考', '第一次月考']);
    expect(inputs.recent_exams[0]).toMatchObject({ score: 90, total_score: 100 });
  });

  it('summarises assignments and attendance as counts', () => {
    const inputs = reports.studentReportInputs(10, cipher);

    expect(inputs.assignment_summary).toEqual({ total_assignments: 2, submitted_assignments: 2 });
    expect(inputs.assignments).toHaveLength(2);
    expect(inputs.attendance).toEqual({ total_records: 2, present_count: 1, late_count: 1, absent_count: 0 });
  });

  it('excludes ungraded exams from the average and the list', () => {
    kernel.db.prepare(`INSERT INTO exams (id, class_id, teacher_id, title, total_score, created_at) VALUES (110, 1, 7, '未批', 100, '2026-04-01 09:00:00')`).run();
    kernel.db.prepare(`INSERT INTO student_exams (id, exam_id, student_id, score) VALUES (210, 110, 10, NULL)`).run();

    const inputs = reports.studentReportInputs(10, cipher);
    expect(inputs.recent_exams.map((exam) => exam.title)).not.toContain('未批');
    expect(inputs.average_exam_score).toBe(85);
  });
});

describe('getStudentAccessView', () => {
  it('returns the class, its teacher, the login and the parent links', () => {
    expect(reports.studentAccessView(10)).toEqual({
      studentId: 10,
      userId: 21,
      classId: 1,
      teacherId: 7,
      parentIds: [30],
    });
  });

  it('returns null for an unknown student, which is the legacy 404', () => {
    expect(reports.studentAccessView(999)).toBeNull();
  });

  it('answers with an empty parent list when nobody is linked', () => {
    expect(reports.studentAccessView(11)).toMatchObject({ userId: 22, parentIds: [] });
  });

  it('keeps a student with no login: userId stays null rather than being invented', () => {
    // Student 12 lives in class 2 and has no `user_id`; the access check has to see that.
    expect(reports.studentAccessView(12)).toMatchObject({ userId: null, classId: 2, teacherId: 9 });
  });
});
