/**
 * homework-migrate - copy the legacy assignment data into the homework plugin's tables.
 *
 *   npm run homework:migrate -- --db database.sqlite           # migrate
 *   npm run homework:migrate:dry -- --db database.sqlite       # report, change nothing
 *
 * ## Why the database path is an argument and not `DATABASE_FILE`
 *
 * `tests/kernel/database-path-alignment.test.ts` enforces that the rule resolving `DATABASE_FILE`
 * exists in exactly three known files, because the repository reaches its database two ways (the
 * kernel's `better-sqlite3` handle and `@prisma/client`) and a fourth independent resolution is how
 * those two drift apart again - the bug that test was written for. A data-migration script reading
 * the environment would be exactly that fourth reader, so this one refuses to guess: the operator
 * names the file, and every run prints the absolute path it opened.
 *
 * The path is resolved against the current directory, so `--db database.sqlite` run from the
 * repository root means what it looks like. The `npm run` form above inherits that root as its cwd.
 *
 * ## What it does, and why it is not a plugin migration
 *
 * The legacy `assignments` / `student_assignments` pair modelled homework as a title, a due date and
 * one free-text box with one score. The new system models it as an interactive question paper plus a
 * per-question grade, so this is not a schema change - it is a *data* translation, and it has to
 * invent things the old model never had:
 *
 *   * `total_points` -> 100. The legacy model had no point total at all; a single score in a box. A
 *     denominator has to come from somewhere, and 100 is the only value that leaves the old marks
 *     meaning what they meant. The report prints how many rows this affected so the decision is
 *     visible rather than buried.
 *   * `status` -> 'published'. Legacy assignments had no status and were student-visible the moment
 *     they were created, so calling them drafts would hide work that pupils can currently see.
 *   * the free-text submission -> one `short` question worth the whole 100, with the pupil's text as
 *     its answer. That is the honest reading of "one box, one score": it keeps the writing and the
 *     mark attached to each other, and a teacher can split it into real questions afterwards.
 *
 * ## Idempotence
 *
 * Every write is keyed on `legacy_id` (the source row's id), which carries a UNIQUE index. Running
 * this twice copies nothing the second time, and it is safe to re-run after an interrupted run -
 * which matters because a deployment may well run it twice by accident.
 *
 * ## What it does NOT do
 *
 * It never deletes or modifies a legacy row. The old tables are left exactly as they were, so this is
 * reversible by dropping the copied rows, and the read bridge in `plugins/homework` stops surfacing a
 * legacy assignment the moment its copy exists.
 */

import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');

/** `--db <path>` (or `--db=<path>`). Required; see the header for why there is no default. */
function readDbArgument() {
  const index = argv.findIndex((value) => value === '--db' || value.startsWith('--db='));
  if (index === -1) return null;
  const token = argv[index];
  const value = token.startsWith('--db=') ? token.slice('--db='.length) : argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

const dbArgument = readDbArgument();
if (!dbArgument) {
  console.error('缺少 --db 参数。请指定要迁移的数据库文件，例如：');
  console.error('  npm run homework:migrate -- --db database.sqlite');
  process.exit(1);
}

const databaseFile = path.resolve(process.cwd(), dbArgument);

if (!fs.existsSync(databaseFile)) {
  console.error(`找不到数据库文件：${databaseFile}`);
  process.exit(1);
}

const db = new Database(databaseFile);
db.pragma('foreign_keys = ON');

const hasTable = (name) =>
  Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));

for (const table of ['assignments', 'student_assignments', 'p_homework_assignments', 'p_homework_questions', 'p_homework_submissions', 'p_homework_answers']) {
  if (!hasTable(table)) {
    console.error(
      `缺少表 ${table}。请先启动一次应用，让迁移跑完（node scripts/migration/homework-migrate.mjs 只搬运数据，不建表）。`,
    );
    process.exit(1);
  }
}

/** The denominator the legacy model never had. See the header. */
const LEGACY_TOTAL_POINTS = 100;

const legacyAssignments = db
  .prepare(
    `SELECT a.id, a.class_id, a.teacher_id, a.title, a.description, a.due_date, a.reward_points
       FROM assignments a
      WHERE NOT EXISTS (SELECT 1 FROM p_homework_assignments h WHERE h.legacy_id = a.id)
      ORDER BY a.id`,
  )
  .all();

const alreadyCopied = db
  .prepare('SELECT COUNT(*) AS n FROM p_homework_assignments WHERE legacy_id IS NOT NULL')
  .get().n;

const submissions = db
  .prepare(
    `SELECT sa.id, sa.assignment_id, sa.student_id, sa.status, sa.content, sa.score,
            sa.teacher_feedback, sa.submitted_at
       FROM student_assignments sa
      WHERE NOT EXISTS (SELECT 1 FROM p_homework_submissions hs WHERE hs.legacy_id = sa.id)
        AND sa.assignment_id IS NOT NULL
        AND sa.student_id IS NOT NULL
      ORDER BY sa.id`,
  )
  .all();

/**
 * A legacy submission status in the new vocabulary.
 *
 * `completed` and `graded` both mean "a human finished with it"; the legacy UI only ever wrote
 * `submitted`, `graded` and `completed`, and anything unrecognised becomes `submitted` rather than
 * `draft` - the safe direction, because a draft is editable by the pupil and re-opening their
 * finished work would be the more damaging mistake.
 */
function mapStatus(status) {
  if (status === 'completed' || status === 'graded') return 'graded';
  if (status === 'submitted') return 'submitted';
  if (status === 'returned') return 'returned';
  return status ? 'submitted' : 'draft';
}

/** `YYYY-MM-DD` and the various SQLite/JS forms the legacy columns hold, normalised to ISO-ish. */
function mapTimestamp(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

const now = new Date().toISOString();
const report = { assignments: 0, questions: 0, submissions: 0, answers: 0, skippedExisting: alreadyCopied };

const copyAssignments = db.transaction((rows) => {
  for (const legacy of rows) {
    // The one question the legacy model implies: the pupil's whole answer, worth the whole paper.
    const homeworkId = db
      .prepare(
        `INSERT INTO p_homework_assignments
           (class_id, teacher_id, title, description, due_at, status, total_points, reward_points,
            legacy_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?)`,
      )
      .run(
        legacy.class_id ?? 0,
        legacy.teacher_id ?? 0,
        legacy.title ?? `作业 #${legacy.id}`,
        legacy.description ?? null,
        mapTimestamp(legacy.due_date),
        LEGACY_TOTAL_POINTS,
        legacy.reward_points ?? 0,
        legacy.id,
        now,
        now,
      ).lastInsertRowid;

    db.prepare(
      `INSERT INTO p_homework_questions
         (assignment_id, order_no, type, stem, options_json, answer_json, explanation, points, created_at)
       VALUES (?, 1, 'short', ?, '[]', ?, ?, ?, ?)`,
    ).run(
      homeworkId,
      legacy.title ? `${legacy.title}（迁移前的作业，请老师按需拆分题目）` : '迁移前的作业',
      JSON.stringify({ text: '', rubric: [] }),
      legacy.description ?? null,
      LEGACY_TOTAL_POINTS,
      now,
    );

    report.assignments += 1;
    report.questions += 1;
  }
});

const copySubmissions = db.transaction((rows) => {
  const questionOf = db.prepare(
    'SELECT id FROM p_homework_questions WHERE assignment_id = ? ORDER BY order_no LIMIT 1',
  );
  const homeworkOf = db.prepare('SELECT id FROM p_homework_assignments WHERE legacy_id = ?');

  for (const legacy of rows) {
    const homework = homeworkOf.get(legacy.assignment_id);
    // No copy of the parent: either the assignment row is gone or it was skipped, and inventing a
    // homework to hang this off would be worse than reporting it.
    if (!homework) continue;

    const status = mapStatus(legacy.status);
    const submissionId = db
      .prepare(
        `INSERT INTO p_homework_submissions
           (assignment_id, student_id, status, submitted_at, score, total_points, teacher_feedback,
            legacy_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        homework.id,
        legacy.student_id,
        status,
        mapTimestamp(legacy.submitted_at),
        legacy.score ?? null,
        LEGACY_TOTAL_POINTS,
        legacy.teacher_feedback ?? null,
        legacy.id,
        now,
        now,
      ).lastInsertRowid;

    const question = questionOf.get(homework.id);
    if (question) {
      db.prepare(
        `INSERT INTO p_homework_answers
           (submission_id, question_id, answer_json, score, is_correct, teacher_score, teacher_comment, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
      ).run(
        submissionId,
        question.id,
        JSON.stringify({ text: legacy.content ?? '' }),
        legacy.score ?? null,
        // The legacy score was a human's, so it migrates to `teacher_score` and not to `auto_score` -
        // attributing a teacher's mark to the machine would corrupt exactly the signal the two
        // columns exist to keep apart.
        legacy.score ?? null,
        legacy.teacher_feedback ?? null,
        now,
      );
      report.answers += 1;
    }

    report.submissions += 1;
  }
});

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        databaseFile,
        wouldCopy: { assignments: legacyAssignments.length, submissions: submissions.length },
        alreadyCopied,
        note: `每条旧作业会生成 1 道简答题，满分 ${LEGACY_TOTAL_POINTS}；已有 legacy_id 的行不会重复复制。`,
      },
      null,
      2,
    ),
  );
  db.close();
  process.exit(0);
}

copyAssignments(legacyAssignments);
copySubmissions(submissions);

console.log(
  JSON.stringify(
    {
      databaseFile,
      copied: report,
      note: `旧作业的满分按 ${LEGACY_TOTAL_POINTS} 分迁移；旧表未被修改，可随时回滚（删除 p_homework_* 中 legacy_id 非空的行）。`,
    },
    null,
    2,
  ),
);

db.close();
