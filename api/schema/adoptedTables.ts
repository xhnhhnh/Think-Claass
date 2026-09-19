/**
 * Schema for tables that plugins *adopt* rather than create.
 *
 * ## Why this file exists
 *
 * A plugin may only create tables under its own `p_<slug>_` prefix (enforced by
 * `migrationRunner` and guardrail G7). But P4.3b migrates domains whose tables
 * already exist under legacy names, and whose **column names are the HTTP contract** -
 * `SELECT *` rows are returned straight through to the frontend, which reads
 * `deposit_amount`, `interest_rate`, `average_buy_price` and parses `trend_history` as
 * JSON. Renaming those tables is a coordinated frontend change, not a rename.
 *
 * So the host owns creating them and the plugin declares them under `data.adopted`,
 * which is exactly what that declaration means: "this plugin owns a table that still
 * carries its legacy name".
 *
 * ## Why the DDL is here and not in api/db.ts
 *
 * The migration runs in two directions at once - the legacy composition still boots
 * `initDb()`, while the kernel composition exists to prove plugins need no legacy
 * code. If the adopted tables were only created inside `initDb()`, a plugin would
 * activate fine in the kernel composition and then fail on its first request. This
 * module is the single source, and both paths call it, so there is no second copy to
 * drift.
 *
 * The statements are byte-compatible with the ones in `api/db.ts` (`CREATE TABLE IF
 * NOT EXISTS`, same columns, same `UNIQUE(student_id, stock_id)`, same index), so
 * running both is a no-op. When `api/db.ts`'s boot DDL becomes numbered migrations in
 * P4.3c this module is where those migrations get their table definitions from, or is
 * deleted outright - see docs/migration/HANDOFF.md §9.
 */

import type { Database } from '@thinkclass/kernel';

/** Tables a plugin declares under `data.adopted`, by owning plugin slug. */
export const ADOPTED_TABLE_NAMES = {
  classroom: ['students', 'classes', 'records'],
  economy: ['bank_accounts', 'stocks', 'student_stocks'],
  dungeon: ['dungeon_runs'],
  gacha: ['pet_dictionary', 'gacha_pools', 'student_pets'],
  slg: ['territories', 'class_resources'],
  battles: ['class_battles'],
  challenge: ['challenge_records', 'world_bosses'],
  collaboration: ['task_nodes', 'student_task_nodes', 'team_quests', 'team_quest_progress', 'peer_reviews'],
  marketplace: ['auctions', 'blind_boxes', 'shop_items', 'redemption_tickets'],
  portal: ['articles', 'homepage_content', 'contact_messages'],
} as const;

/**
 * Tables plugins only *read*, which still have to exist for those reads to work.
 *
 * These are owned by domains that have not migrated yet (`question_bank` by the
 * system/settings surface, the legacy `pets` table by the not-yet-complete pet
 * migration). A plugin declares them in `data.reads`, which grants read access but no
 * creation right - and `ensureAdoptedSchema` only creates what plugins *own*. So on a
 * fresh kernel-composition database they would simply be missing, and the read would
 * fail at request time with "no such table" rather than at boot.
 *
 * Creating them here is deliberately temporary and deliberately read-only in intent:
 * once `system` and `pet` migrate, the table moves into the owning plugin's own
 * migration and leaves this list. It is not `data.adopted` for those plugins, because
 * adopting would grant write ownership of another domain's table - the opposite of the
 * problem being solved.
 */
const READ_ONLY_LEGACY_TABLES = ['question_bank', 'pets', 'users'] as const;

export function ensureReadOnlyLegacyTables(db: Database): void {
  db.exec(`
    -- Credentials live here. Plugins only ever read role / username to resolve a
    -- teacher or parent; the kernel owns authentication, so nothing else may depend on
    -- this table's shape. It is created here because the kernel composition never runs
    -- the api/db.ts boot DDL, and a plugin that reads it would otherwise fail at
    -- request time with "no such table".
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_activated INTEGER DEFAULT 0
    );

    -- Read by challenge (question content) and written by the not-yet-migrated system surface.
    CREATE TABLE IF NOT EXISTS question_bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      options TEXT,
      answer TEXT NOT NULL,
      explanation TEXT,
      teacher_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- The *legacy* pets table. Note this is NOT plugins/pet's p_pet_pets: that plugin
    -- owns its own namespaced table, while the legacy module and challenge both read
    -- this one. It disappears when api/modules/pet is deleted (HANDOFF 8.3.1).
    --
    -- last_fed_at and mood are ALTER-only in api/db.ts (addColumnIfNotExists at
    -- :1089-1090 and :1100). They must be listed here: this is the only creator on the
    -- kernel-composition path, and engagement's praise handler writes mood - a
    -- missing column would be "no such column: mood" at request time, in one code path
    -- that no unit test exercises.
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
      mood TEXT DEFAULT 'happy',
      last_fed_at DATETIME
    );
  `);
}

/** Create every adopted table if it does not already exist. */
export function ensureAdoptedSchema(db: Database): void {
  db.exec(`
    -- classroom: students and classes.
    --
    -- classes.teacher_id and students.user_id referenced users(id) in the original
    -- boot DDL. That reference is dropped here on purpose: "users" belongs to the
    -- legacy auth module, which this module must not depend on - a plugin host that
    -- had to create the user table would know about identity. SQLite does not enforce
    -- a foreign key whose target table is absent, and when api/db.ts runs it creates
    -- "users" anyway, so the real schema is unchanged.
    --
    -- The column list must stay complete: api/db.ts grows an existing classes table
    -- with addColumnIfNotExists, so a definition here that omits a column is only ever
    -- wrong on a database this module created itself - which is exactly the kernel
    -- composition and every test. The failure is silent and specific: checkClassFeature
    -- reads classes.<feature> by name, so a missing column answers "feature disabled"
    -- for every class instead of erroring.
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE,
      teacher_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      settings TEXT,
      -- The 19 legacy class feature flags. P4.1 replaced them with capability
      -- assignments, but a class that was never configured still resolves through
      -- these columns, which is what classroom.public.check*Feature falls back to.
      -- Dropping them is P7 work and must follow a data migration.
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
      -- group_id is read by collaboration to group team-quest progress, and
      -- birthday / last_checkin_date are read by insights. All three arrive in
      -- api/db.ts through addColumnIfNotExists, so they must be in this definition:
      -- this is the only creator on the kernel-composition path, and a missing column
      -- here is a silent wrong answer rather than an error.
      group_id INTEGER,
      name TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      available_points INTEGER DEFAULT 0,
      last_checkin_date TEXT,
      birthday TEXT
    );

    -- classroom: the shared point ledger.
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_records_student_id ON records(student_id);

    -- economy: bank accounts and the classroom stock market.
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

    -- P4.3b.2: the five domains split out of the old "game" god-module (plus the
    -- challenge/world-boss pair). Same reasoning as above - they already exist under
    -- legacy names, a plugin may only CREATE names prefixed p_<slug>_, and their column
    -- names are what the controllers return.
    CREATE TABLE IF NOT EXISTS dungeon_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      current_floor INTEGER DEFAULT 1,
      max_floor INTEGER DEFAULT 1,
      active_buffs TEXT,
      current_hp INTEGER DEFAULT 100,
      max_hp INTEGER DEFAULT 100,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    CREATE TABLE IF NOT EXISTS pet_dictionary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      element TEXT NOT NULL,
      rarity TEXT NOT NULL,
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
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_student_pets_student_id ON student_pets(student_id);

    CREATE TABLE IF NOT EXISTS territories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      cost_to_unlock INTEGER NOT NULL,
      current_contribution INTEGER DEFAULT 0,
      x_pos INTEGER NOT NULL,
      y_pos INTEGER NOT NULL,
      status TEXT DEFAULT 'locked',
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

    CREATE TABLE IF NOT EXISTS class_battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiator_class_id INTEGER REFERENCES classes(id),
      target_class_id INTEGER REFERENCES classes(id),
      status TEXT DEFAULT 'pending',
      start_time DATETIME,
      end_time DATETIME,
      winner_class_id INTEGER REFERENCES classes(id),
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

    -- P4.3b.3: collaboration's own tables. peer_reviews.team_quest_id arrives in
    -- api/db.ts through addColumnIfNotExists, so it belongs in the CREATE here.
    -- NOTE for whoever edits this file next: SQL comments here must not contain
    -- backticks - this whole block is a template literal, and one backtick silently
    -- ends it. tsc catches it, but only after a confusing parse error.
    CREATE TABLE IF NOT EXISTS student_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class_id INTEGER REFERENCES classes(id),
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
      status TEXT DEFAULT 'locked',
      completed_at DATETIME,
      UNIQUE(student_id, task_node_id)
    );

    CREATE TABLE IF NOT EXISTS team_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER REFERENCES classes(id),
      teacher_id INTEGER,
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
      assignment_id INTEGER,
      score INTEGER,
      comment TEXT,
      team_quest_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- P4.3b.3: marketplace. shop_items and redemption_tickets are shared with
    -- engagement, which is migrated in the same batch; see SHARED_WRITE_TABLES in the
    -- manifest-conformance guardrail for how that overlap is tracked.
    CREATE TABLE IF NOT EXISTS shop_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      stock INTEGER DEFAULT 999,
      is_active INTEGER DEFAULT 1,
      teacher_id INTEGER,
      is_holiday_limited INTEGER DEFAULT 0,
      holiday_start_time TEXT,
      holiday_end_time TEXT
    );

    CREATE TABLE IF NOT EXISTS redemption_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      item_id INTEGER REFERENCES shop_items(id),
      code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_redemption_tickets_student_id ON redemption_tickets(student_id);
    CREATE INDEX IF NOT EXISTS idx_shop_items_teacher_id ON shop_items(teacher_id);

    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_name TEXT NOT NULL,
      item_description TEXT,
      starting_price INTEGER NOT NULL,
      current_price INTEGER,
      highest_bidder_id INTEGER REFERENCES students(id),
      seller_id INTEGER,
      status TEXT DEFAULT 'active',
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS blind_boxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      reward_type TEXT,
      reward_value INTEGER,
      probability INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- P4.3b.4: portal. The public website surface; independent of students and classes.
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

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
