import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const dbPath = path.join(process.cwd(), 'database.sqlite');
let db = new Database(dbPath);

// 优化 SQLite 内存占用和性能
db.pragma('journal_mode = WAL');
db.pragma('cache_size = -2000'); // 限制缓存大小为 2MB
db.pragma('foreign_keys = ON'); // 启用外键约束

// =======================
// 加密/解密工具 (模拟或真实)
// =======================
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 chars
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  if (!text) return text;
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    // If decryption fails, return original text (for backward compatibility)
    return text;
  }
}

export function closeDb() {
  db.close();
}

export function reopenDb() {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('cache_size = -2000'); // 限制缓存大小为 2MB
  db.pragma('foreign_keys = ON'); // 启用外键约束
  initDb();
}

export function initDb() {
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE,
      teacher_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      enable_chat_bubble INTEGER DEFAULT 1,
      enable_peer_review INTEGER DEFAULT 1,
      enable_tree_hole INTEGER DEFAULT 1,
      enable_shop INTEGER DEFAULT 1,
      enable_lucky_draw INTEGER DEFAULT 1,
      enable_challenge INTEGER DEFAULT 1,
      enable_family_tasks INTEGER DEFAULT 1,
      enable_world_boss INTEGER DEFAULT 1,
      enable_guild_pk INTEGER DEFAULT 1,
      enable_auction_blind_box INTEGER DEFAULT 1,
      enable_achievements INTEGER DEFAULT 1,
      enable_parent_buff INTEGER DEFAULT 1,
      pet_selection_mode TEXT DEFAULT 'student'
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      class_id INTEGER,
      name TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      available_points INTEGER DEFAULT 0
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
      attack_power INTEGER DEFAULT 10
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

    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id),
      type TEXT NOT NULL, -- 'ADD_POINTS', 'DEDUCT_POINTS', 'BUY_ITEM', 'FEED_PET'
      amount INTEGER NOT NULL,
      description TEXT,
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
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  `);

  // 初始化首页内容默认数据
  const heroExists = db.prepare("SELECT section_key FROM homepage_content WHERE section_key = 'hero'").get();
  if (!heroExists) {
    db.prepare("INSERT INTO homepage_content (section_key, content_json) VALUES (?, ?)").run('hero', '{}');
  }

  const featuresExists = db.prepare("SELECT section_key FROM homepage_content WHERE section_key = 'features'").get();
  if (!featuresExists) {
    db.prepare("INSERT INTO homepage_content (section_key, content_json) VALUES (?, ?)").run('features', '[]');
  }

  // 初始化默认设置
  const titleExists = db.prepare("SELECT key FROM settings WHERE key = 'site_title'").get();
  if (!titleExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('site_title', '学习王国 - 精灵成长系统')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('site_favicon', '/favicon.svg')").run();
  }

  // Add allowTeacherRegExists
  const allowTeacherRegExists = db.prepare("SELECT key FROM settings WHERE key = 'allow_teacher_registration'").get();
  if (!allowTeacherRegExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('allow_teacher_registration', '1')").run();
  }

  // Add birthday column to students if not exists (migration)
  try {
    db.exec('ALTER TABLE students ADD COLUMN birthday TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add feature flags to classes if not exists (migration)
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_chat_bubble INTEGER DEFAULT 1;');
  } catch (e) {
    // Column might already exist, ignore error
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_peer_review INTEGER DEFAULT 1;');
  } catch (e) {
    // Column might already exist, ignore error
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_tree_hole INTEGER DEFAULT 1;');
  } catch (e) {
    // Column might already exist, ignore error
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_shop INTEGER DEFAULT 1;');
  } catch (e) {
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_lucky_draw INTEGER DEFAULT 1;');
  } catch (e) {
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_challenge INTEGER DEFAULT 1;');
  } catch (e) {
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_family_tasks INTEGER DEFAULT 1;');
  } catch (e) {
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_world_boss INTEGER DEFAULT 1;');
  } catch (e) { }

  try {
    db.exec("ALTER TABLE world_bosses ADD COLUMN status TEXT DEFAULT 'active';");
  } catch (e) { }

  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_guild_pk INTEGER DEFAULT 1;');
  } catch (e) {
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_auction_blind_box INTEGER DEFAULT 1;');
  } catch (e) {
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_achievements INTEGER DEFAULT 1;');
  } catch (e) {
  }
  try {
    db.exec('ALTER TABLE classes ADD COLUMN enable_parent_buff INTEGER DEFAULT 1;');
  } catch (e) {
  }

  // Add last_active_date to parent_activity
  try {
    db.exec('ALTER TABLE parent_activity ADD COLUMN last_active_date TEXT;');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_activity_parent_student ON parent_activity(parent_id, student_id);');
  } catch (e) {
  }

  // Add pet_selection_mode column to classes if not exists (migration)
  try {
    db.exec('ALTER TABLE classes ADD COLUMN pet_selection_mode TEXT DEFAULT "student";');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add image_stage columns to pets if not exists (migration)
  try {
    db.exec('ALTER TABLE pets ADD COLUMN image_stage1 TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE pets ADD COLUMN image_stage2 TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE pets ADD COLUMN image_stage3 TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE pets ADD COLUMN image_stage4 TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE pets ADD COLUMN image_stage5 TEXT;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE pets ADD COLUMN image_stage6 TEXT;');
  } catch (e) {}

  // Add mood column to pets if not exists (migration)
  try {
    db.exec('ALTER TABLE pets ADD COLUMN mood TEXT DEFAULT "happy";');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add group_id column to students if not exists (migration)
  try {
    db.exec('ALTER TABLE students ADD COLUMN group_id INTEGER REFERENCES student_groups(id);');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add last_checkin_date column to students if not exists (migration)
  try {
    db.exec('ALTER TABLE students ADD COLUMN last_checkin_date TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add invite_code column if not exists (migration)
  try {
    db.exec('ALTER TABLE classes ADD COLUMN invite_code TEXT;');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_invite_code ON classes(invite_code);');
    // Generate codes for existing classes
    const classesWithoutCode = db.prepare('SELECT id FROM classes WHERE invite_code IS NULL').all() as {id: number}[];
    for (const c of classesWithoutCode) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      db.prepare('UPDATE classes SET invite_code = ? WHERE id = ?').run(code, c.id);
    }
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add is_active column if not exists (migration)
  try {
    db.exec('ALTER TABLE shop_items ADD COLUMN is_active INTEGER DEFAULT 1;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add custom_image column to pets if not exists (migration)
  try {
    db.exec('ALTER TABLE pets ADD COLUMN custom_image TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add last_fed_at column to pets if not exists (migration)
  try {
    db.exec('ALTER TABLE pets ADD COLUMN last_fed_at DATETIME DEFAULT CURRENT_TIMESTAMP;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add teacher_id column to shop_items if not exists (migration)
  try {
    db.exec('ALTER TABLE shop_items ADD COLUMN teacher_id INTEGER REFERENCES users(id);');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add holiday columns to shop_items if not exists (migration)
  try {
    db.exec('ALTER TABLE shop_items ADD COLUMN is_holiday_limited INTEGER DEFAULT 0;');
    db.exec('ALTER TABLE shop_items ADD COLUMN holiday_start_time TEXT;');
    db.exec('ALTER TABLE shop_items ADD COLUMN holiday_end_time TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add sender_role column to messages if not exists (migration)
  try {
    db.exec('ALTER TABLE messages ADD COLUMN sender_role TEXT DEFAULT "student";');
    db.exec('UPDATE messages SET sender_role = "user" WHERE type = "HOME_SCHOOL";');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Insert initial teacher user if not exists
  const teacher = db.prepare('SELECT * FROM users WHERE role = ?').get('teacher') as any;
  let teacherId = teacher?.id;
  if (!teacher) {
    const info = db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)').run('teacher', 'admin', 'admin123');
    teacherId = info.lastInsertRowid;
  }

  // Insert initial superadmin user if not exists, or update existing to Think
  const superadmin = db.prepare('SELECT * FROM users WHERE role = ?').get('superadmin') as any;
  if (!superadmin) {
    db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)').run('superadmin', 'Think', 'wx951004');
  } else {
    // Update existing superadmin to the new credentials
    db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE role = ?').run('Think', 'wx951004', 'superadmin');
  }

  // Create default class if no classes exist
  const classes = db.prepare('SELECT COUNT(*) as count FROM classes').get() as { count: number };
  if (classes.count === 0 && teacherId) {
    db.prepare('INSERT INTO classes (name, teacher_id) VALUES (?, ?)').run('默认班级', teacherId);
  }

  // Assign students without a class to the default class
  const defaultClass = db.prepare('SELECT id FROM classes LIMIT 1').get() as { id: number };
  if (defaultClass) {
    db.prepare('UPDATE students SET class_id = ? WHERE class_id IS NULL').run(defaultClass.id);
  }

  // Insert some initial shop items if not exists
  const items = db.prepare('SELECT COUNT(*) as count FROM shop_items').get() as { count: number };
  if (items.count === 0 && teacherId) {
    const insertItem = db.prepare('INSERT INTO shop_items (name, description, price, teacher_id) VALUES (?, ?, ?, ?)');
    insertItem.run('免抄写卡', '可免去一次家庭作业的抄写任务', 50, teacherId);
    insertItem.run('选座位权', '下周可优先选择自己的座位', 100, teacherId);
    insertItem.run('免值日卡', '免去一次班级值日任务', 80, teacherId);
    insertItem.run('零食大礼包', '兑换一份零食大礼包', 200, teacherId);
  }

  // Insert initial point presets if not exists
  const presets = db.prepare('SELECT COUNT(*) as count FROM point_presets').get() as { count: number };
  if (presets.count === 0 && teacherId) {
    const insertPreset = db.prepare('INSERT INTO point_presets (label, amount, teacher_id) VALUES (?, ?, ?)');
    insertPreset.run('发言', 2, teacherId);
    insertPreset.run('作业优秀', 5, teacherId);
    insertPreset.run('帮助同学', 3, teacherId);
    insertPreset.run('作业未交', -5, teacherId);
    insertPreset.run('迟到', -2, teacherId);
    insertPreset.run('上课纪律差', -2, teacherId);
  }

  // Drop foreign key constraints on messages.sender_id
  try {
    const tableInfo = db.prepare("PRAGMA foreign_key_list('messages')").all() as any[];
    const hasSenderIdFk = tableInfo.some(fk => fk.from === 'sender_id');
    if (hasSenderIdFk) {
      db.exec(`
        PRAGMA foreign_keys=off;
        CREATE TABLE IF NOT EXISTS messages_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          class_id INTEGER REFERENCES classes(id),
          sender_id INTEGER,
          receiver_id INTEGER REFERENCES students(id),
          content TEXT NOT NULL,
          is_anonymous INTEGER DEFAULT 0,
          type TEXT NOT NULL,
          sender_role TEXT DEFAULT 'student',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO messages_new SELECT * FROM messages;
        DROP TABLE messages;
        ALTER TABLE messages_new RENAME TO messages;
        PRAGMA foreign_keys=on;
      `);
    }
  } catch (e) {
    console.error('Migration error for messages table:', e);
  }
}

export default db;
