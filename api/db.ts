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
const IV_LENGTH = 16;

/**
 * The at-rest encryption key for `students.name`.
 *
 * **Deliberately has no default.** Until P4.3b.15 this fell back to a 32-character literal made of
 * consecutive digits, which lived in the source - so every deployment that never set
 * `ENCRYPTION_KEY` was encrypting children's names with a key published in the repository. A privacy
 * audit of the public clone found exactly that: the live database's three student names decrypted
 * with it.
 *
 * A default that is public is worse than no encryption, because it looks like encryption. So the
 * key is now required, and its absence is an error at the first name that needs it rather than a
 * silent fallback. Guardrail G18 (`tests/guardrails/no-default-encryption-key.test.ts`) keeps the
 * literal - and any future one - out of the source; this comment deliberately does not quote it.
 *
 * Read **lazily** on purpose: this module is imported by the whole legacy composition (`initDb`,
 * the maintenance code, the boot probes), and demanding the key at import time would make the
 * application unbootable for a deployment that never stores an encrypted name. Only actually
 * encrypting or decrypting requires it.
 */
export function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set: refusing to encrypt or decrypt at-rest values with a default key. ' +
        'Set it to the same 32-byte value every instance of this deployment uses (scripts/rotate-encryption-key.mjs ' +
        'can re-encrypt existing rows).',
    );
  }

  const key = Buffer.from(raw);
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes for aes-256-cbc; got ${key.length}`);
  }

  return key;
}

export function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey(), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  if (!text) return text;
  // Resolved before the try/catch: a missing key must fail loudly, not be swallowed by the
  // legacy-plaintext fallback below and silently return the ciphertext as if it were a name.
  const key = encryptionKey();
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
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


export function migrateLegacyHomeSchoolSenderRoles(connection: { exec: (sql: string) => unknown } = db) {
  connection.exec(`
    UPDATE messages
    SET sender_role = 'user'
    WHERE type = 'HOME_SCHOOL'
      AND (sender_role IS NULL OR sender_role = '' OR sender_role = 'student');
  `);
}

/**
 * The alphabet class invite codes are drawn from - the same base-36 set the legacy generator used.
 *
 * `Math.random().toString(36).substring(2, 8).toUpperCase()` was the old source. It is not a
 * CSPRNG, and it was not even fixed-length: a base-36 fraction shorter than six characters yielded
 * a shorter code. An invite code is a join credential for a class, so it comes from
 * `crypto.randomInt` over this alphabet instead, and is always exactly six characters.
 */
const INVITE_CODE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const INVITE_CODE_LENGTH = 6;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += INVITE_CODE_ALPHABET[crypto.randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

// The application schema lives in `api/schema/`, and `APP_MIGRATIONS` there is the single
// list BOTH compositions apply: this one through `initDb()`, the kernel one through
// `createKernel({ migrations })`. Until P4.3c.3 this file kept its own copy of the list,
// which is precisely how the two schemas drifted apart - see `api/schema/appMigrations.ts`.
//
// This module used to also perform schema DDL itself (`addColumnIfNotExists` calls, a raw
// `ALTER TABLE` trio, 20 `CREATE INDEX` statements). That was the second, silent
// definition: it ran only in this composition, so the kernel composition was short one
// column and 19 indexes. All of it is now migrations, and G17 fails if DDL reappears here.
import { APP_MIGRATIONS } from './schema/appMigrations.js';
export {
  APP_MIGRATIONS,
  BOOT_SCHEMA_MIGRATION_ID,
  LEGACY_COMPAT_COLUMNS_MIGRATION_ID,
  LEGACY_COMPAT_INDEXES_MIGRATION_ID,
  PAYMENT_TABLES_MIGRATION_ID,
  bootSchemaMigration,
  paymentTablesMigration,
} from './schema/appMigrations.js';

export function initDb() {
  db.pragma('foreign_keys = ON');

  // The schema is a versioned migration chain and the single definition of every table -
  // including the foundation tables (classes, students, records, bank_accounts, stocks,
  // student_stocks) that plugins declare under `data.adopted`, the compatibility columns
  // old databases gained from ALTERs, and the query indexes. Already-applied databases skip
  // what they have and the ledger records that fact, instead of re-running ~800 lines of DDL
  // silently on every start.
  runMigrations(db, APP_MIGRATIONS, {
    logger: createLogger('legacy-schema', { level: 'warn' }),
  });


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
    // `site_favicon` is deliberately empty: an empty value means "use the built-in mark", which
    // `SiteSettingsBootstrap` renders from `src/lib/brandIcon.ts`. It used to seed '/favicon.svg',
    // a file that no longer exists.
    db.prepare("INSERT INTO settings (key, value) VALUES ('site_favicon', '')").run();
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

  // `payment_environment` is a deployment decision, not something a seed can know. The payment
  // plugin reads it strictly and refuses to create an order when it is unset (503, naming the
  // setting), so production deliberately gets no row: an operator chooses `mock` / `sandbox` /
  // `production` before payments can be taken. Outside production the running process *is* a
  // simulated one, so the honest value is written for developer and test boots.
  const paymentEnvExists = db.prepare("SELECT key FROM settings WHERE key = 'payment_environment'").get();
  if (!paymentEnvExists && process.env.NODE_ENV !== 'production') {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payment_environment', 'mock')").run();
  }

  // Both payment channels default to off, matching `DEFAULT_SYSTEM_SETTINGS` in
  // `plugins/admin/src/admin.defaults.ts` (and its frontend parity copy). They used to be seeded
  // `'1'`, i.e. a fresh install accepted payments nobody had configured.
  const paymentWechatExists = db.prepare("SELECT key FROM settings WHERE key = 'payment_enable_wechat'").get();
  if (!paymentWechatExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payment_enable_wechat', '0')").run();
  }

  const paymentAlipayExists = db.prepare("SELECT key FROM settings WHERE key = 'payment_enable_alipay'").get();
  if (!paymentAlipayExists) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('payment_enable_alipay', '0')").run();
  }

  // The compatibility columns (operation_logs user attribution, articles metadata,
  // students.birthday, the 19 class feature flags, pets' artwork/mood/feeding columns,
  // shop_items and messages extras) are applied by `0000c_legacy_compat_columns` above.
  // They used to live here as `addColumnIfNotExists(...)` calls, which meant the kernel
  // composition - the one that never calls `initDb()` - did not have them.


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

  // Generate invite codes for classes that have none. The column and its unique index come
  // from `0000c_legacy_compat_columns` / `0000d_legacy_compat_indexes`; this stays here
  // because it is data backfill, not schema.
  const classesWithoutCode = db.prepare('SELECT id FROM classes WHERE invite_code IS NULL').all() as {id: number}[];
  for (const c of classesWithoutCode) {
    db.prepare('UPDATE classes SET invite_code = ? WHERE id = ?').run(generateInviteCode(), c.id);
  }

  // shop_items and pets compatibility columns, and users.is_activated, are part of
  // `0000c_legacy_compat_columns`. What remains here is the data backfill below.

  migrateLegacyHomeSchoolSenderRoles();

  // The first superadmin comes from the environment, and only from the environment.
  //
  // This used to fall back to `'Think'` / `'wx951004'` when the variables were unset - two literals
  // published in this repository - so every deployment that never set them shared one superadmin
  // password, and the credentials were readable in the source. There is no fallback now: a database
  // with no superadmin row and no variables refuses to boot and names the variables. The value is
  // still written as-is (the identity plugin upgrades the stored plaintext to a scrypt hash on the
  // first successful login - see `identity.service.ts`), which is unchanged behaviour.
  const superadmin = db.prepare('SELECT * FROM users WHERE role = ?').get('superadmin') as any;

  const adminUsername = process.env.SUPERADMIN_USERNAME;
  const adminPassword = process.env.SUPERADMIN_PASSWORD;

  if (superadmin) {
    // The existing row is the deployment's credential. The variables re-sync it when *both* are
    // set, which is how a deployment rotates the account; a partial pair changes nothing.
    if (adminUsername && adminPassword) {
      db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE role = ?').run(adminUsername, adminPassword, 'superadmin');
    }
  } else {
    if (!adminUsername || !adminPassword) {
      const missing = [
        !adminUsername ? 'SUPERADMIN_USERNAME' : null,
        !adminPassword ? 'SUPERADMIN_PASSWORD' : null,
      ].filter(Boolean).join(' and ');
      throw new Error(
        `Refusing to create the first superadmin without a credential: set ${missing}. ` +
          'The account used to be seeded with a username and password published in this repository, ' +
          'so every installation that did not override them shared the same superadmin login. That ' +
          'fallback is gone and there is no default - provide both variables, or restore a database ' +
          'that already has a superadmin row.',
      );
    }
    db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)').run('superadmin', adminUsername, adminPassword);
  }

  // Teachers, classes, shop items and point presets are deliberately NOT created here any more.
  // Every one of them used to be an invented example: a teacher `admin` with the plaintext password
  // `admin123`, a `默认班级`, four shop items and six point presets. They are real capabilities the
  // console already offers (teacher registration / `POST /api/admin/users`, `POST /api/classes`,
  // the shop page and the preset page), created by a person who means it, not by the boot.

  // Assign students without a class to the first existing class.
  //
  // This stays: it is a backfill for rows an import or an older schema left with `class_id IS NULL`,
  // not a fabricated default. With no class there is nothing to assign to, and none is created.
  const defaultClass = db.prepare('SELECT id FROM classes LIMIT 1').get() as { id: number };
  if (defaultClass) {
    db.prepare('UPDATE students SET class_id = ? WHERE class_id IS NULL').run(defaultClass.id);
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
  // 高频查询外键索引 (Performance Indexes)
  // =========================================
  // They live in `0000d_legacy_compat_indexes` now. Creating them here was invisible to the
  // kernel composition, which is how 19 indexes - including the two UNIQUE ones that back
  // `ON CONFLICT(parent_id, student_id)` and classes' invite-code uniqueness - came to be
  // missing there.

}

export default dbProxy;
