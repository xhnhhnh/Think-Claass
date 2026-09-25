-- ai-study plugin schema.
--
-- Owned entirely by this plugin: the `p_ai_study_` prefix is enforced by the migration
-- runner, which refuses DDL against any table the plugin does not own.
--
-- ## No foreign key to students / classes / questions
--
-- The same ruling `plugins/pet/migrations/0001_init.sql` and
-- `plugins/homework/migrations/0001_init.sql` record: those tables belong to other
-- plugins, a cross-owner foreign key is exactly the schema coupling the plugin boundary
-- exists to prevent, and referential integrity for `student_id` / `class_id` /
-- `question_id` is the port's job. It would also make this migration fail on a database
-- where those tables do not exist yet.
--
-- ## What the intra-plugin foreign keys buy
--
-- The account-deletion registry orders its rules from `PRAGMA foreign_key_list`, so an
-- intra-plugin foreign key is what makes "children before parents" automatic instead of a
-- hand-maintained statement order - the argument `plugins/homework` records for its own
-- keys. Answers point at items, items point at sets: one acyclic tree, no cycle to avoid.
--
-- ## The one partial unique index
--
-- "My current practice set" is defined as the single `open` set a student has. A partial
-- unique index is what makes that a fact the database enforces rather than a convention
-- every future writer has to remember - and it is what makes generating twice (a
-- double-click, a retry after a timeout) return the set that already exists instead of a
-- second one the student would have to choose between.
--
-- `created_at` / `updated_at` are TEXT written by the application, matching the rest of the
-- plugin tables in this repository (`plugins/pet`), not SQLite's `CURRENT_TIMESTAMP`.

CREATE TABLE IF NOT EXISTS p_ai_study_sets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL,
  -- The class the student was in when the set was made. Recorded rather than derived, so a
  -- set a teacher dispatched stays attributed to that class after the student moves.
  class_id       INTEGER,
  subject_id     INTEGER,
  -- 'self' (the student pressed 生成) or 'assigned' (a teacher dispatched it).
  source         TEXT    NOT NULL DEFAULT 'self',
  -- The actor who dispatched an 'assigned' set; NULL for a self-generated one.
  created_by     INTEGER,
  status         TEXT    NOT NULL DEFAULT 'open',
  -- Which ranking rule produced this set, so a stored set stays readable after the rule
  -- changes. See plugins/ai-study/plugin.json `_engine_note`.
  engine_version INTEGER NOT NULL DEFAULT 1,
  -- What the AI half of the request actually was: the provider that answered (or would
  -- have), whether it participated, and the line the UI prints verbatim.
  ai_source      TEXT    NOT NULL DEFAULT 'mock',
  ai_available   INTEGER NOT NULL DEFAULT 0,
  ai_message     TEXT    NOT NULL DEFAULT '',
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

-- At most one open set per student; see the note above.
CREATE UNIQUE INDEX IF NOT EXISTS idx_p_ai_study_sets_open
  ON p_ai_study_sets (student_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_p_ai_study_sets_student ON p_ai_study_sets (student_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_p_ai_study_sets_class ON p_ai_study_sets (class_id);

CREATE TABLE IF NOT EXISTS p_ai_study_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id        INTEGER NOT NULL REFERENCES p_ai_study_sets (id) ON DELETE CASCADE,
  -- A `questions` row owned by the learning plugin. No foreign key: see the header.
  question_id   INTEGER NOT NULL,
  order_no      INTEGER NOT NULL,
  -- Why this question is in this set, in the student's own language. Derived from the
  -- winning factor, never from a model alone.
  reason        TEXT    NOT NULL DEFAULT '',
  -- The rule's total for this candidate, and the factor breakdown behind it. Both stored
  -- so a set can be explained after the fact without re-running the rule over a bank that
  -- has since changed.
  score         INTEGER NOT NULL DEFAULT 0,
  factors_json  TEXT    NOT NULL DEFAULT '{}',
  -- Whether the model re-ranked this item, for provenance in the UI.
  ai_ranked     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_p_ai_study_items_set ON p_ai_study_items (set_id, order_no);
CREATE INDEX IF NOT EXISTS idx_p_ai_study_items_question ON p_ai_study_items (question_id);

CREATE TABLE IF NOT EXISTS p_ai_study_answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id      INTEGER NOT NULL REFERENCES p_ai_study_sets (id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES p_ai_study_items (id) ON DELETE CASCADE,
  answer_json TEXT,
  -- NULL means "nobody judged this" - a subjective question, or one with no reference
  -- answer configured. It is deliberately not 0: see `recordPracticeOutcome`.
  is_correct  INTEGER,
  spent_sec   INTEGER NOT NULL DEFAULT 0,
  -- The mastery the learning port reported back for this answer, or NULL when the port
  -- declined to judge and therefore did not touch the wrong-question book.
  mastery_score REAL,
  -- When the question's owner was asked to judge this answer, or NULL if it never was.
  --
  -- This is what makes submitting twice harmless. `is_correct` NULL cannot carry that job on
  -- its own ("not judged yet" and "judged, declined" are different states, and the second is
  -- a verdict), and without the distinction a retry after a mid-loop failure would write the
  -- same mastery step twice - the student's 错题本 would move twice for one answer.
  judged_at   TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE (item_id)
);

CREATE INDEX IF NOT EXISTS idx_p_ai_study_answers_set ON p_ai_study_answers (set_id);
