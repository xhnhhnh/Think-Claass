-- homework plugin schema.
--
-- Owned entirely by this plugin: the `p_homework_` prefix is enforced by the migration runner,
-- which refuses DDL against any table the plugin does not own.
--
-- ## No foreign key to `classes` or `students`
--
-- Deliberate, and the same ruling `plugins/pet/migrations/0001_init.sql` records for its own
-- `student_id`: those tables belong to the classroom plugin, and a cross-owner foreign key is
-- exactly the schema coupling the plugin boundary exists to prevent. Referential integrity for
-- `class_id` / `student_id` is the classroom port's job. `classes` would also make this
-- migration fail on a kernel-only database, where that table does not exist yet.
--
-- ## Why the intra-plugin foreign keys look the way they do
--
-- The account-deletion cleanup registry orders its rules from `PRAGMA foreign_key_list`, so an
-- intra-plugin foreign key is what makes "children before parents" automatic rather than a
-- hand-maintained statement order. But an FK only helps if it is acyclic, and the obvious shape
-- here is not:
--
--   p_homework_answers   -> p_homework_questions   -> p_homework_assignments
--   p_homework_photos    -> p_homework_answers                                          (NO)
--
-- Adding `photos.answer_id` closes that cycle, and the dependency graph the registry builds
-- would then contain a loop. Question-scoped photos are therefore recorded in the *answer's*
-- `answer_json` (`{"photo_ids":[7]}`) instead of in a column, which keeps the photo table a
-- child of the submission only. That is a weaker link by construction - it is the answer row
-- that says a photo answers question 3 - and it is the honest one: a photo is evidence attached
-- to a submission, and a question reference is metadata about it.

CREATE TABLE IF NOT EXISTS p_homework_assignments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id      INTEGER NOT NULL,
  teacher_id    INTEGER NOT NULL,
  title         TEXT    NOT NULL,
  description   TEXT,
  due_at        TEXT,
  status        TEXT    NOT NULL DEFAULT 'draft',
  total_points  INTEGER NOT NULL DEFAULT 0,
  reward_points INTEGER NOT NULL DEFAULT 0,
  -- Provenance: the `assignments.id` this row was copied from, NULL for homework born here.
  -- The one-shot data migration is keyed on it (so it is idempotent and can be re-run), and the
  -- read bridge uses it to decide which legacy rows have NOT been copied yet - without it, a
  -- deployment that migrated would list every assignment twice, once from each table.
  legacy_id     INTEGER,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_p_homework_assignments_class ON p_homework_assignments (class_id);
CREATE INDEX IF NOT EXISTS idx_p_homework_assignments_teacher ON p_homework_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_p_homework_assignments_status ON p_homework_assignments (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_p_homework_assignments_legacy ON p_homework_assignments (legacy_id);

CREATE TABLE IF NOT EXISTS p_homework_questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES p_homework_assignments (id) ON DELETE CASCADE,
  order_no     INTEGER NOT NULL,
  type         TEXT    NOT NULL,
  stem         TEXT    NOT NULL,
  options_json TEXT,
  answer_json  TEXT,
  explanation  TEXT,
  points       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_p_homework_questions_assignment ON p_homework_questions (assignment_id);

-- `UNIQUE(assignment_id, student_id)` is what makes "start my attempt" idempotent, which is what
-- a page refresh needs: it must hand back the same in-progress submission, not a second one.
CREATE TABLE IF NOT EXISTS p_homework_submissions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id    INTEGER NOT NULL REFERENCES p_homework_assignments (id) ON DELETE CASCADE,
  student_id       INTEGER NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'draft',
  submitted_at     TEXT,
  score            INTEGER,
  total_points     INTEGER NOT NULL DEFAULT 0,
  teacher_feedback TEXT,
  ai_feedback      TEXT,
  ai_confidence    REAL,
  graded_by        TEXT,
  -- The `student_assignments.id` this row was copied from; see the note on the same column above.
  legacy_id        INTEGER,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_p_homework_submissions_assignment ON p_homework_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_p_homework_submissions_student ON p_homework_submissions (student_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_p_homework_submissions_legacy ON p_homework_submissions (legacy_id);

-- The AI columns, the auto-grader's column and the teacher's columns are separate on purpose.
--
-- `score` is the effective one and is always derived - the teacher's number when there is one,
-- otherwise `ai_score` when a provider filled it, otherwise `auto_score` - because "the AI proposed
-- 4/5 and the teacher accepted it" and "the teacher overrode it to 2/5" are different facts, and only
-- the second tells you whether the model is worth trusting.
--
-- `auto_score` is kept apart from `ai_score` because they come from different things. `auto_score` is
-- the deterministic grader the server runs on every submission, which needs no model and cannot be
-- reconfigured; `ai_score` is whatever provider was configured at the time. Folding them into one
-- column made `graded_by` report 'ai+teacher' on a deployment that had no AI provider at all, and
-- re-running the app after switching providers would have relabelled every historical auto-score.
CREATE TABLE IF NOT EXISTS p_homework_answers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id   INTEGER NOT NULL REFERENCES p_homework_submissions (id) ON DELETE CASCADE,
  question_id     INTEGER NOT NULL REFERENCES p_homework_questions (id) ON DELETE CASCADE,
  answer_json     TEXT,
  score           INTEGER,
  is_correct      INTEGER,
  auto_score      INTEGER,
  auto_source     TEXT,
  ai_score        INTEGER,
  ai_comment      TEXT,
  ai_confidence   REAL,
  ai_source       TEXT,
  teacher_score   INTEGER,
  teacher_comment TEXT,
  updated_at      TEXT    NOT NULL,
  UNIQUE (submission_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_p_homework_answers_submission ON p_homework_answers (submission_id);
CREATE INDEX IF NOT EXISTS idx_p_homework_answers_question ON p_homework_answers (question_id);

CREATE TABLE IF NOT EXISTS p_homework_photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES p_homework_submissions (id) ON DELETE CASCADE,
  storage_path  TEXT    NOT NULL,
  mime          TEXT    NOT NULL,
  size          INTEGER NOT NULL,
  sha256        TEXT    NOT NULL,
  uploaded_by   INTEGER,
  created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_p_homework_photos_submission ON p_homework_photos (submission_id);

CREATE TABLE IF NOT EXISTS p_homework_qa_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES p_homework_assignments (id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL,
  role          TEXT    NOT NULL,
  content       TEXT    NOT NULL,
  ai_source     TEXT,
  created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_p_homework_qa_assignment ON p_homework_qa_messages (assignment_id, student_id);
