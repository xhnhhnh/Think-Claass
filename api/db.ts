import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

import { createLogger, runMigrations, type Migration } from '@thinkclass/kernel';

/**
 * The database file this layer opens.
 *
 * `DATABASE_FILE` mirrors the kernel's own configuration key, so the two
 * connections in one process point at the same file. It also lets the boot probes
 * run against a throwaway database instead of the developer's `database.sqlite`.
 * Relative paths resolve against the working directory, preserving the historical
 * default when the variable is unset.
 */
const dbPath = process.env.DATABASE_FILE
  ? path.resolve(process.cwd(), process.env.DATABASE_FILE)
  : path.join(process.cwd(), 'database.sqlite');
type DatabaseInstance = InstanceType<typeof Database>;

function configureDb(connection: DatabaseInstance) {
  connection.pragma('journal_mode = WAL');
  connection.pragma('synchronous = NORMAL');
  connection.pragma('cache_size = -20000');
  connection.pragma('busy_timeout = 5000');
  connection.pragma('temp_store = MEMORY');
  connection.pragma('foreign_keys = ON');
  return connection;
}

function createDbConnection() {
  return configureDb(new Database(dbPath));
}

let db = createDbConnection();
const dbProxy = new Proxy({} as DatabaseInstance, {
  get(_target, prop) {
    const value = Reflect.get(db, prop, db);
    return typeof value === 'function' ? value.bind(db) : value;
  },
  set(_target, prop, value) {
    Reflect.set(db as object, prop, value);
    return true;
  },
  has(_target, prop) {
    return prop in db;
  },
  ownKeys() {
    return Reflect.ownKeys(db);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const descriptor = Object.getOwnPropertyDescriptor(db, prop);
    if (!descriptor) {
      return undefined;
    }
    return {
      ...descriptor,
      configurable: true,
    };
  },
});

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
  if (!db.open) {
    return;
  }
  db.close();
}

export function reopenDb() {
  if (db.open) {
    return dbProxy;
  }
  db = createDbConnection();
  initDb();
  return dbProxy;
}


function addColumnIfNotExists(tableName: string, columnName: string, columnDef: string) {
  const info = db.pragma(`table_info(${tableName})`) as any[];
  if (!info.some(c => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  }
}

export function migrateLegacyHomeSchoolSenderRoles(connection: { exec: (sql: string) => unknown } = db) {
  connection.exec(`
    UPDATE messages
    SET sender_role = 'user'
    WHERE type = 'HOME_SCHOOL'
      AND (sender_role IS NULL OR sender_role = '' OR sender_role = 'student');
  `);
}

// The boot schema lives in api/schema/legacyBootSchema.ts. It is the single definition of
// every table, used by BOTH compositions: here through the migration ledger, and by the
// kernel composition through `createKernel({ migrations })`. Re-exported because this
// module was its historical home and callers still import it from `api/db.ts`.
import { bootSchemaMigration as bootSchema } from './schema/legacyBootSchema.js';
export { BOOT_SCHEMA_MIGRATION_ID, bootSchemaMigration } from './schema/legacyBootSchema.js';

export function initDb() {
  db.pragma('foreign_keys = ON');

  // The boot schema is a versioned migration and the single definition of every table -
  // including the foundation tables (classes, students, records, bank_accounts, stocks,
  // student_stocks) that plugins declare under `data.adopted`. Already-applied databases
  // skip it and the ledger records that fact, instead of re-running ~800 lines of DDL
  // silently on every start.
  runMigrations(db, [bootSchema], { logger: createLogger('legacy-schema', { level: 'warn' }) });


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
    db.prepare("INSERT INTO settings (key, value) VALUES ('site_title', 'Think-Class')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('site_favicon', '/favicon.svg')").run();
  }

  // Add allowTeacherRegExists
  const allowTeacherRegExists = db.prepare("SELECT key FROM settings WHERE key = 'allow_teacher_registration'").get();
  if (!allowTeacherRegExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('allow_teacher_registration', '1')").run();
  }

  // Add revenue_enabled
  const revenueEnabledExists = db.prepare("SELECT key FROM settings WHERE key = 'revenue_enabled'").get();
  if (!revenueEnabledExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('revenue_enabled', '0')").run();
  }

  // Add revenue_mode
  const revenueModeExists = db.prepare("SELECT key FROM settings WHERE key = 'revenue_mode'").get();
  if (!revenueModeExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('revenue_mode', 'activation_code')").run();
  }

  const teacherAnalyticsExists = db.prepare("SELECT key FROM settings WHERE key = 'enable_teacher_analytics'").get();
  if (!teacherAnalyticsExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('enable_teacher_analytics', '1')").run();
  }

  const parentReportExists = db.prepare("SELECT key FROM settings WHERE key = 'enable_parent_report'").get();
  if (!parentReportExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('enable_parent_report', '1')").run();
  }

  const paymentPriceExists = db.prepare("SELECT key FROM settings WHERE key = 'payment_price'").get();
  if (!paymentPriceExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payment_price', '99.00')").run();
  }

  const paymentCurrencyExists = db.prepare("SELECT key FROM settings WHERE key = 'payment_currency'").get();
  if (!paymentCurrencyExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payment_currency', 'CNY')").run();
  }

  const paymentDescriptionExists = db.prepare("SELECT key FROM settings WHERE key = 'payment_description'").get();
  if (!paymentDescriptionExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payment_description', 'Think-Class 平台激活')").run();
  }

  const paymentEnvExists = db.prepare("SELECT key FROM settings WHERE key = 'payment_environment'").get();
  if (!paymentEnvExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payment_environment', 'mock')").run();
  }

  const paymentWechatExists = db.prepare("SELECT key FROM settings WHERE key = 'payment_enable_wechat'").get();
  if (!paymentWechatExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payment_enable_wechat', '1')").run();
  }

  const paymentAlipayExists = db.prepare("SELECT key FROM settings WHERE key = 'payment_enable_alipay'").get();
  if (!paymentAlipayExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payment_enable_alipay', '1')").run();
  }

  // Add user_id and role to operation_logs if not exists (migration)
  addColumnIfNotExists('operation_logs', 'user_id', 'INTEGER REFERENCES users(id)');
  addColumnIfNotExists('operation_logs', 'role', 'TEXT');

  // Add missing columns to articles if not exists (migration)
  addColumnIfNotExists('articles', 'summary', 'TEXT');
  addColumnIfNotExists('articles', 'cover_image', 'TEXT');
  addColumnIfNotExists('articles', 'category', 'TEXT');
  addColumnIfNotExists('articles', 'is_published', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('articles', 'view_count', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('articles', 'created_at', 'DATETIME');
  addColumnIfNotExists('articles', 'updated_at', 'DATETIME');

  // Add birthday column to students if not exists (migration)
  addColumnIfNotExists('students', 'birthday', 'TEXT');

  // Add feature flags to classes if not exists (migration)
  addColumnIfNotExists('classes', 'enable_chat_bubble', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_peer_review', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_tree_hole', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_shop', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_lucky_draw', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_challenge', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_family_tasks', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_world_boss', 'INTEGER DEFAULT 0');

  addColumnIfNotExists('classes', 'enable_task_tree', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_danmaku', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_class_brawl', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_slg', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_gacha', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_economy', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_dungeon', 'INTEGER DEFAULT 0');

  addColumnIfNotExists('world_bosses', 'status', "TEXT DEFAULT 'active'");

  addColumnIfNotExists('classes', 'enable_guild_pk', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_auction_blind_box', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_achievements', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'enable_parent_buff', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('classes', 'settings', 'TEXT');

  const classFeatureDefaultOffMigrationKey = 'class_features_default_off_migration_v1';
  const classFeatureDefaultOffMigrationExists = db
    .prepare('SELECT key FROM settings WHERE key = ?')
    .get(classFeatureDefaultOffMigrationKey);
  if (!classFeatureDefaultOffMigrationExists) {
    db.exec(`
      UPDATE classes
      SET
        enable_chat_bubble = 0,
        enable_peer_review = 0,
        enable_tree_hole = 0,
        enable_shop = 0,
        enable_lucky_draw = 0,
        enable_challenge = 0,
        enable_family_tasks = 0,
        enable_world_boss = 0,
        enable_guild_pk = 0,
        enable_auction_blind_box = 0,
        enable_achievements = 0,
        enable_parent_buff = 0,
        enable_task_tree = 0,
        enable_danmaku = 0,
        enable_class_brawl = 0,
        enable_slg = 0,
        enable_gacha = 0,
        enable_economy = 0,
        enable_dungeon = 0
    `);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(classFeatureDefaultOffMigrationKey, '1');
  }

  // Add last_active_date to parent_activity
  addColumnIfNotExists('parent_activity', 'last_active_date', 'TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_activity_parent_student ON parent_activity(parent_id, student_id);');

  // Add pet_selection_mode column to classes if not exists (migration)
  addColumnIfNotExists('classes', 'pet_selection_mode', "TEXT DEFAULT 'student'");

  // Add image_stage columns to pets if not exists (migration)
  addColumnIfNotExists('pets', 'image_stage1', 'TEXT');
  addColumnIfNotExists('pets', 'image_stage2', 'TEXT');
  addColumnIfNotExists('pets', 'image_stage3', 'TEXT');
  addColumnIfNotExists('pets', 'image_stage4', 'TEXT');
  addColumnIfNotExists('pets', 'image_stage5', 'TEXT');
  addColumnIfNotExists('pets', 'image_stage6', 'TEXT');

  // Add mood column to pets if not exists (migration)
  addColumnIfNotExists('pets', 'mood', "TEXT DEFAULT 'happy'");

  // Add group_id column to students if not exists (migration)
  addColumnIfNotExists('students', 'group_id', 'INTEGER REFERENCES student_groups(id)');

  // Add team_quest_id column to peer_reviews if not exists (migration)
  addColumnIfNotExists('peer_reviews', 'team_quest_id', 'INTEGER REFERENCES team_quests(id)');

  // Add last_checkin_date column to students if not exists (migration)
  addColumnIfNotExists('students', 'last_checkin_date', 'TEXT');

  // Add invite_code column if not exists (migration)
  addColumnIfNotExists('classes', 'invite_code', 'TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_invite_code ON classes(invite_code);');
  // Generate codes for existing classes
  const classesWithoutCode = db.prepare('SELECT id FROM classes WHERE invite_code IS NULL').all() as {id: number}[];
  for (const c of classesWithoutCode) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    db.prepare('UPDATE classes SET invite_code = ? WHERE id = ?').run(code, c.id);
  }

  // Add is_active column if not exists (migration)
  addColumnIfNotExists('shop_items', 'is_active', 'INTEGER DEFAULT 1');

  // Add custom_image column to pets if not exists (migration)
  addColumnIfNotExists('pets', 'custom_image', 'TEXT');

  // Add last_fed_at column to pets if not exists (migration)
  addColumnIfNotExists('pets', 'last_fed_at', 'DATETIME');

  // Add teacher_id column to shop_items if not exists (migration)
  addColumnIfNotExists('shop_items', 'teacher_id', 'INTEGER REFERENCES users(id)');

  // Add holiday columns to shop_items if not exists (migration)
  try {
    db.exec('ALTER TABLE shop_items ADD COLUMN is_holiday_limited INTEGER DEFAULT 0;');
    db.exec('ALTER TABLE shop_items ADD COLUMN holiday_start_time TEXT;');
    db.exec('ALTER TABLE shop_items ADD COLUMN holiday_end_time TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  // Add sender_role column to messages if not exists (migration)
  addColumnIfNotExists('messages', 'sender_role', "TEXT DEFAULT 'student'");
  migrateLegacyHomeSchoolSenderRoles();

  // Add is_activated column to users if not exists (migration)
  addColumnIfNotExists('users', 'is_activated', 'INTEGER DEFAULT 0');

  // Insert initial teacher user if not exists
  const teacher = db.prepare('SELECT * FROM users WHERE role = ?').get('teacher') as any;
  let teacherId = teacher?.id;
  if (!teacher) {
    const info = db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)').run('teacher', 'admin', 'admin123');
    teacherId = info.lastInsertRowid;
  }

  // Insert initial superadmin user if not exists, or update existing from env vars
  const superadmin = db.prepare('SELECT * FROM users WHERE role = ?').get('superadmin') as any;
  
  const adminUsername = process.env.SUPERADMIN_USERNAME;
  const adminPassword = process.env.SUPERADMIN_PASSWORD;

  if (!superadmin) {
    db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)').run('superadmin', adminUsername || 'Think', adminPassword || 'wx951004');
  } else if (adminUsername && adminPassword) {
    // Only update existing superadmin if credentials are explicitly provided via env vars
    db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE role = ?').run(adminUsername, adminPassword, 'superadmin');
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

  // =========================================
  // 创建高频查询外键索引 (Performance Indexes)
  // =========================================
  const indexesToCreate = [
    // 用户与班级
    'CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);',
    'CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);',
    
    // 游戏化系统
    'CREATE INDEX IF NOT EXISTS idx_pets_student_id ON pets(student_id);',
    'CREATE INDEX IF NOT EXISTS idx_shop_items_teacher_id ON shop_items(teacher_id);',
    'CREATE INDEX IF NOT EXISTS idx_redemption_tickets_student_id ON redemption_tickets(student_id);',
    
    // 学习与教务
    'CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON assignments(class_id);',
    'CREATE INDEX IF NOT EXISTS idx_exams_class_id ON exams(class_id);',
    'CREATE INDEX IF NOT EXISTS idx_attendance_records_class_id ON attendance_records(class_id);',
    'CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON attendance_records(student_id);',
    'CREATE INDEX IF NOT EXISTS idx_messages_class_id ON messages(class_id);',
    'CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);',
    'CREATE INDEX IF NOT EXISTS idx_operation_logs_teacher_id ON operation_logs(teacher_id);',
    'CREATE INDEX IF NOT EXISTS idx_activation_events_user_id ON activation_events(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_activation_events_order_id ON activation_events(order_id);',
    
    // SLG 及其他
    'CREATE INDEX IF NOT EXISTS idx_territories_class_id ON territories(class_id);',
    'CREATE INDEX IF NOT EXISTS idx_student_pets_student_id ON student_pets(student_id);',
    'CREATE INDEX IF NOT EXISTS idx_dungeon_runs_student_id ON dungeon_runs(student_id);'
  ];

  for (const sql of indexesToCreate) {
    db.exec(sql);
  }

}

export default dbProxy;
