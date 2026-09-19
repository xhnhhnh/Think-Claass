/**
 * The legacy boot schema, as a versioned migration.
 *
 * This is the original `api/db.ts` bootstrap DDL, byte-for-byte, moved here so BOTH
 * compositions can register it through `createKernel`. Until this move the legacy
 * composition created these tables from this DDL while the kernel composition created
 * the subset its plugins needed from `api/schema/adoptedTables.ts` - the same tables
 * defined twice, which is what produced the column-drift bugs during P4.3b (a missing
 * column is a silent wrong answer when the reader looks it up by name, not an error).
 *
 * `up` is a STRING on purpose. A string migration checksums its SQL text, so the
 * checksum is independent of this file's location: an already-migrated database still
 * matches and the runner does not flag it as modified. A function migration would
 * checksum its own source and could not be relocated without breaking every existing
 * deployment.
 *
 * The id keeps its `0000_` prefix so it still sorts before every kernel migration:
 * business tables must exist before the tables that reference them.
 *
 * It is kernel-owned rather than plugin-owned because it creates the shared substrate -
 * users, classes, students, records and the rest - that the kernel and every
 * foundation plugin assume. Nothing here is domain logic.
 */

import type { Migration } from '@thinkclass/kernel';

/**
 * The legacy boot schema, recorded in the migration ledger.
 *
 * This is the whole `initDb()` DDL block, unchanged, wrapped as a migration so it
 * runs exactly once and the ledger says so. Before this it re-ran on every boot with
 * `CREATE TABLE IF NOT EXISTS`, which made a failed upgrade indistinguishable from a
 * fresh install - the exact problem `runMigrations` exists to solve.
 *
 * `up` is a STRING on purpose. A string checksum is derived from the SQL text, so the
 * migration keeps its identity no matter where this file moves; a function migration
 * checksums its own source, so relocating one would make `runMigrations` refuse to
 * start against an already-migrated database.
 *
 * Id `0000_...` sorts before every kernel migration, which is correct: the legacy
 * schema is a prerequisite for the tables the kernel and plugins build on.
 */
export const BOOT_SCHEMA_MIGRATION_ID = '0000_legacy_boot_schema';

export const bootSchemaMigration: Migration = {
  id: BOOT_SCHEMA_MIGRATION_ID,
  owner: 'legacy',
  up: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_activated INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      element_type TEXT NOT NULL,
      custom_image TEXT,
      image_stage1 TEXT,
      image_stage2 TEXT,
      image_stage3 TEXT,
      image_stage4 TEXT,
      image_stage5 TEXT,
      image_stage6 TEXT,
      level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      attack_power INTEGER DEFAULT 10,
      -- mood and last_fed_at were ALTER-only (addColumnIfNotExists at the bottom of
      -- this file). They are listed here too because this migration is now the schema
      -- source for BOTH compositions, and the kernel one never runs those ALTERs -
      -- engagement's praise handler writes mood, so its absence is a runtime failure in
      -- exactly one code path.
      mood TEXT DEFAULT 'happy',
      last_fed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      stock INTEGER DEFAULT 999,
      is_active INTEGER DEFAULT 1,
      teacher_id INTEGER REFERENCES users(id),
      is_holiday_limited INTEGER DEFAULT 0,
      holiday_start_time TEXT,
      holiday_end_time TEXT
    );

    CREATE TABLE IF NOT EXISTS lucky_draw_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER REFERENCES users(id),
      cost_points INTEGER NOT NULL DEFAULT 10,
      prize_name TEXT NOT NULL,
      prize_type TEXT NOT NULL, -- 'POINTS', 'ITEM', 'NOTHING'
      prize_value INTEGER, -- points amount or item id
      probability INTEGER NOT NULL DEFAULT 0, -- 0-10000 (0-100%)
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redemption_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      item_id INTEGER REFERENCES shop_items(id),
      code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending', -- 'pending', 'used'
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS point_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      amount INTEGER NOT NULL,
      teacher_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS student_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class_id INTEGER REFERENCES classes(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS praises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER REFERENCES users(id),
      student_id INTEGER REFERENCES students(id),
      content TEXT NOT NULL,
      color TEXT DEFAULT 'bg-yellow-100',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      title TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      sender_id INTEGER,
      receiver_id INTEGER REFERENCES students(id),
      content TEXT NOT NULL,
      is_anonymous INTEGER DEFAULT 0,
      type TEXT NOT NULL, -- 'PEER_REVIEW' or 'TREE_HOLE'
      sender_role TEXT DEFAULT 'student',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS family_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      parent_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      points INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS class_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      teacher_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS parent_students (
      parent_id INTEGER REFERENCES users(id),
      student_id INTEGER REFERENCES students(id),
      PRIMARY KEY (parent_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS question_bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      options TEXT,
      answer TEXT NOT NULL,
      explanation TEXT,
      teacher_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activation_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'unused', -- 'unused', 'used'
      used_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS activation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      source TEXT NOT NULL,
      activation_code TEXT,
      order_id INTEGER,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      contact_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS challenge_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      score INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS homepage_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_key TEXT UNIQUE NOT NULL,
      content_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT NOT NULL,
      cover_image TEXT,
      category TEXT,
      is_published INTEGER DEFAULT 0,
      view_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS world_bosses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      hp INTEGER NOT NULL DEFAULT 10000,
      max_hp INTEGER NOT NULL DEFAULT 10000,
      level INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      start_time DATETIME,
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL,
      description TEXT,
      starting_price INTEGER NOT NULL DEFAULT 0,
      current_price INTEGER NOT NULL DEFAULT 0,
      highest_bidder_id INTEGER,
      status TEXT DEFAULT 'active',
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS blind_boxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL DEFAULT 100,
      teacher_id INTEGER REFERENCES users(id),
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      title TEXT NOT NULL,
      description TEXT,
      points_reward INTEGER NOT NULL DEFAULT 0,
      parent_node_id INTEGER REFERENCES task_nodes(id),
      x_pos INTEGER DEFAULT 0,
      y_pos INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_task_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      task_node_id INTEGER REFERENCES task_nodes(id),
      status TEXT DEFAULT 'locked', -- 'locked', 'unlocked', 'completed'
      completed_at DATETIME,
      UNIQUE(student_id, task_node_id)
    );

    CREATE TABLE IF NOT EXISTS danmaku_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      color TEXT DEFAULT '#ffffff',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS class_battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiator_class_id INTEGER REFERENCES classes(id),
      target_class_id INTEGER REFERENCES classes(id),
      status TEXT DEFAULT 'pending', -- 'pending', 'active', 'ended', 'rejected'
      start_time DATETIME,
      end_time DATETIME,
      winner_class_id INTEGER REFERENCES classes(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- =========================================
    -- PHASE 4 MEGA UPDATE TABLES
    -- =========================================

    -- SLG Territory System
    CREATE TABLE IF NOT EXISTS territories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'forest', 'mine', 'city', 'magic_spring'
      level INTEGER DEFAULT 1,
      cost_to_unlock INTEGER NOT NULL,
      current_contribution INTEGER DEFAULT 0,
      x_pos INTEGER NOT NULL,
      y_pos INTEGER NOT NULL,
      status TEXT DEFAULT 'locked', -- 'locked', 'unlocking', 'owned'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS class_resources (
      class_id INTEGER PRIMARY KEY REFERENCES classes(id),
      wood INTEGER DEFAULT 0,
      stone INTEGER DEFAULT 0,
      magic_dust INTEGER DEFAULT 0,
      gold INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Gacha & Pet System
    CREATE TABLE IF NOT EXISTS pet_dictionary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      element TEXT NOT NULL,
      rarity TEXT NOT NULL, -- 'N', 'R', 'SR', 'SSR'
      base_power INTEGER NOT NULL,
      description TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      pet_dict_id INTEGER REFERENCES pet_dictionary(id),
      level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 0, -- Only one active pet at a time
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gacha_pools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      name TEXT NOT NULL,
      cost_points INTEGER NOT NULL,
      ssr_rate REAL DEFAULT 0.01,
      sr_rate REAL DEFAULT 0.1,
      r_rate REAL DEFAULT 0.3,
      n_rate REAL DEFAULT 0.59,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Roguelike Dungeon (Endless Tower)
    CREATE TABLE IF NOT EXISTS dungeon_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      current_floor INTEGER DEFAULT 1,
      max_floor INTEGER DEFAULT 1,
      active_buffs TEXT, -- JSON array
      current_hp INTEGER DEFAULT 100,
      max_hp INTEGER DEFAULT 100,
      status TEXT DEFAULT 'active', -- 'active', 'died', 'completed'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      achievement_name TEXT NOT NULL,
      description TEXT,
      unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS parent_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER REFERENCES users(id),
      student_id INTEGER REFERENCES students(id),
      activity_type TEXT NOT NULL,
      description TEXT,
      points_awarded INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      teacher_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      due_date DATETIME,
      reward_points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER REFERENCES assignments(id),
      student_id INTEGER REFERENCES students(id),
      status TEXT DEFAULT 'pending',
      content TEXT,
      score INTEGER,
      teacher_feedback TEXT,
      submitted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      teacher_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      exam_date DATETIME,
      total_score INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER REFERENCES exams(id),
      student_id INTEGER REFERENCES students(id),
      score INTEGER,
      feedback TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      student_id INTEGER REFERENCES students(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      parent_id INTEGER REFERENCES users(id),
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      reviewer_id INTEGER REFERENCES users(id),
      review_comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS team_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      teacher_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      target_score INTEGER NOT NULL,
      reward_points INTEGER NOT NULL,
      start_date DATETIME,
      end_date DATETIME,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS team_quest_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER REFERENCES team_quests(id),
      student_id INTEGER REFERENCES students(id),
      contribution_score INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS peer_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reviewer_id INTEGER REFERENCES students(id),
      reviewee_id INTEGER REFERENCES students(id),
      assignment_id INTEGER REFERENCES assignments(id),
      score INTEGER,
      comment TEXT,
      -- ALTER-only in the compatibility block below; listed here as well so the kernel
      -- composition (which skips those ALTERs) has the column collaboration writes.
      team_quest_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      stage TEXT,
      grade INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, stage, grade)
    );

    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      name TEXT NOT NULL,
      code TEXT,
      parent_id INTEGER REFERENCES knowledge_nodes(id),
      importance INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_subject_id ON knowledge_nodes(subject_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_parent_id ON knowledge_nodes(parent_id);

    CREATE TABLE IF NOT EXISTS knowledge_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      from_node_id INTEGER NOT NULL REFERENCES knowledge_nodes(id),
      to_node_id INTEGER NOT NULL REFERENCES knowledge_nodes(id),
      edge_type TEXT NOT NULL,
      weight REAL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(from_node_id, to_node_id, edge_type)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_edges_subject_id ON knowledge_edges(subject_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_edges_from_node_id ON knowledge_edges(from_node_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_edges_to_node_id ON knowledge_edges(to_node_id);

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER REFERENCES users(id),
      subject_id INTEGER REFERENCES subjects(id),
      stem TEXT NOT NULL,
      type TEXT NOT NULL,
      options_json TEXT,
      answer_json TEXT,
      explanation TEXT,
      difficulty INTEGER DEFAULT 3,
      is_subjective INTEGER DEFAULT 0,
      default_points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_questions_teacher_id ON questions(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions(subject_id);

    CREATE TABLE IF NOT EXISTS question_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      node_id INTEGER NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      weight REAL DEFAULT 1,
      UNIQUE(question_id, node_id)
    );

    CREATE INDEX IF NOT EXISTS idx_question_knowledge_node_id ON question_knowledge(node_id);

    CREATE TABLE IF NOT EXISTS papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL REFERENCES users(id),
      class_id INTEGER REFERENCES classes(id),
      subject_id INTEGER REFERENCES subjects(id),
      title TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'draft',
      total_points INTEGER NOT NULL DEFAULT 0,
      exam_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_papers_teacher_id ON papers(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_papers_class_id ON papers(class_id);
    CREATE INDEX IF NOT EXISTS idx_papers_subject_id ON papers(subject_id);

    CREATE TABLE IF NOT EXISTS paper_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_paper_assets_paper_id ON paper_assets(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_assets_sha256 ON paper_assets(sha256);

    CREATE TABLE IF NOT EXISTS paper_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      order_no INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(paper_id, order_no)
    );

    CREATE INDEX IF NOT EXISTS idx_paper_sections_paper_id ON paper_sections(paper_id);

    CREATE TABLE IF NOT EXISTS paper_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      section_id INTEGER REFERENCES paper_sections(id),
      question_id INTEGER NOT NULL REFERENCES questions(id),
      order_no INTEGER NOT NULL,
      points_override INTEGER,
      difficulty_override INTEGER,
      rubric_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(paper_id, order_no)
    );

    CREATE INDEX IF NOT EXISTS idx_paper_items_paper_id ON paper_items(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_items_question_id ON paper_items(question_id);

    CREATE TABLE IF NOT EXISTS paper_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id),
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      submitted_at DATETIME,
      total_time_sec INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_paper_submissions_paper_id ON paper_submissions(paper_id);
    CREATE INDEX IF NOT EXISTS idx_paper_submissions_student_id ON paper_submissions(student_id);

    CREATE TABLE IF NOT EXISTS paper_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL REFERENCES paper_submissions(id) ON DELETE CASCADE,
      paper_item_id INTEGER NOT NULL REFERENCES paper_items(id) ON DELETE CASCADE,
      answer_json TEXT,
      score INTEGER DEFAULT 0,
      is_correct INTEGER DEFAULT 0,
      time_spent_sec INTEGER DEFAULT 0,
      error_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(submission_id, paper_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_paper_answers_paper_item_id ON paper_answers(paper_item_id);

    CREATE TABLE IF NOT EXISTS rubric_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_item_id INTEGER NOT NULL REFERENCES paper_items(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      points INTEGER NOT NULL,
      keywords_json TEXT,
      step_order INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(paper_item_id, step_order)
    );

    CREATE INDEX IF NOT EXISTS idx_rubric_points_paper_item_id ON rubric_points(paper_item_id);

    CREATE TABLE IF NOT EXISTS rubric_point_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      answer_id INTEGER NOT NULL REFERENCES paper_answers(id) ON DELETE CASCADE,
      rubric_point_id INTEGER NOT NULL REFERENCES rubric_points(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(answer_id, rubric_point_id)
    );

    CREATE INDEX IF NOT EXISTS idx_rubric_point_scores_rubric_point_id ON rubric_point_scores(rubric_point_id);

    CREATE TABLE IF NOT EXISTS wrong_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      first_wrong_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_wrong_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      wrong_count INTEGER NOT NULL DEFAULT 1,
      mastery_score REAL DEFAULT 0,
      cleared_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_wrong_questions_question_id ON wrong_questions(question_id);

    CREATE TABLE IF NOT EXISTS wrong_question_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wrong_question_id INTEGER NOT NULL REFERENCES wrong_questions(id) ON DELETE CASCADE,
      practice_source TEXT NOT NULL,
      is_correct INTEGER DEFAULT 0,
      spent_sec INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_wrong_question_attempts_wrong_question_id ON wrong_question_attempts(wrong_question_id);

    CREATE TABLE IF NOT EXISTS study_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      target_exam_date DATETIME,
      target_score INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_study_plans_student_id ON study_plans(student_id);

    CREATE TABLE IF NOT EXISTS study_plan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      knowledge_node_id INTEGER REFERENCES knowledge_nodes(id),
      question_id INTEGER REFERENCES questions(id),
      due_date DATETIME,
      estimated_min INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_study_plan_items_plan_id ON study_plan_items(plan_id);
    CREATE INDEX IF NOT EXISTS idx_study_plan_items_knowledge_node_id ON study_plan_items(knowledge_node_id);

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER REFERENCES users(id),
      student_id INTEGER REFERENCES students(id),
      class_id INTEGER REFERENCES classes(id),
      subject_id INTEGER REFERENCES subjects(id),
      source TEXT NOT NULL,
      content_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notes_teacher_id ON notes(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_notes_student_id ON notes(student_id);
    CREATE INDEX IF NOT EXISTS idx_notes_class_id ON notes(class_id);

    CREATE TABLE IF NOT EXISTS note_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_note_assets_note_id ON note_assets(note_id);
    CREATE INDEX IF NOT EXISTS idx_note_assets_sha256 ON note_assets(sha256);

    CREATE TABLE IF NOT EXISTS note_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_note_products_note_id ON note_products(note_id);

    CREATE TABLE IF NOT EXISTS knowledge_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      knowledge_node_id INTEGER NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_products_node_id ON knowledge_products(knowledge_node_id);

    -- ---------------------------------------------------------------------
    -- Foundation tables.
    --
    -- These six used to be created by api/schema/adoptedTables.ts rather than by this
    -- DDL, because P4.3b moved their definitions out of initDb() so plugin manifests
    -- could declare them under data.adopted. When this migration became the single
    -- schema source (P4.3c.2) that split silently cost the kernel composition six tables
    -- - students and classes above all - and the only reason the test suite passed was
    -- that the test helper still called the old module directly.
    --
    -- They belong here, ahead of the tables that reference them, and their column lists
    -- include every column api/db.ts once added with addColumnIfNotExists: a column
    -- missing from a CREATE is not an error, it is a silent wrong answer for any reader
    -- that looks it up by name.
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE,
      teacher_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      settings TEXT,
      enable_chat_bubble INTEGER DEFAULT 0,
      enable_peer_review INTEGER DEFAULT 0,
      enable_tree_hole INTEGER DEFAULT 0,
      enable_shop INTEGER DEFAULT 0,
      enable_lucky_draw INTEGER DEFAULT 0,
      enable_challenge INTEGER DEFAULT 0,
      enable_family_tasks INTEGER DEFAULT 0,
      enable_world_boss INTEGER DEFAULT 0,
      enable_guild_pk INTEGER DEFAULT 0,
      enable_auction_blind_box INTEGER DEFAULT 0,
      enable_achievements INTEGER DEFAULT 0,
      enable_parent_buff INTEGER DEFAULT 0,
      enable_task_tree INTEGER DEFAULT 0,
      enable_danmaku INTEGER DEFAULT 0,
      enable_class_brawl INTEGER DEFAULT 0,
      enable_slg INTEGER DEFAULT 0,
      enable_gacha INTEGER DEFAULT 0,
      enable_economy INTEGER DEFAULT 0,
      enable_dungeon INTEGER DEFAULT 0,
      pet_selection_mode TEXT DEFAULT 'student'
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      class_id INTEGER,
      group_id INTEGER,
      name TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      available_points INTEGER DEFAULT 0,
      last_checkin_date TEXT,
      birthday TEXT
    );

    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_records_student_id ON records(student_id);

    CREATE TABLE IF NOT EXISTS bank_accounts (
      student_id INTEGER PRIMARY KEY REFERENCES students(id),
      deposit_amount INTEGER DEFAULT 0,
      interest_rate REAL DEFAULT 0.05,
      last_interest_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      current_price INTEGER NOT NULL,
      trend_history TEXT,
      volatility REAL DEFAULT 0.1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      stock_id INTEGER REFERENCES stocks(id),
      shares INTEGER DEFAULT 0,
      average_buy_price REAL DEFAULT 0,
      UNIQUE(student_id, stock_id)
    );
  `,
};
