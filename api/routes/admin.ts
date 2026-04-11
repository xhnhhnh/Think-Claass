import { Router, type Request, type Response } from 'express';
import express from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { spawn, execSync } from 'child_process';
import multer from 'multer';
import { closeDb, initDb, reopenDb } from '../db.js';
import { prisma } from '../prismaClient.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { requireActorRole } from '../utils/requestAuth.js';

const router = Router();
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

const upload = multer({ dest: os.tmpdir() });

function removeFileIfExists(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Super admin login
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const user = await prisma.users.findFirst({
    where: { username, password_hash: password, role: 'superadmin' }
  });
  if (user) {
    res.json({ success: true, user: { id: user.id, role: user.role, username: user.username } });
  } else {
    throw new ApiError(401, '账号或密码错误，请重试');
  }
}));

router.use((req: Request, _res: Response, next) => {
  try {
    requireActorRole(req, ['admin', 'superadmin']);
    next();
  } catch (error) {
    next(error);
  }
});

// Super admin stats
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsage = ((usedMem / totalMem) * 100).toFixed(2);
  
  const cpus = os.cpus();
  const cpuCount = cpus.length;
  let totalIdle = 0, totalTick = 0;
  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });
  const cpuUsage = (((totalTick - totalIdle) / totalTick) * 100).toFixed(2);
  
  const uptime = os.uptime();
  
  const totalUsers = await prisma.users.count({ where: { role: { in: ['teacher', 'student'] } } });
  const teachersCount = await prisma.users.count({ where: { role: 'teacher' } });
  const studentsCount = await prisma.users.count({ where: { role: 'student' } });
  const classesCount = await prisma.classes.count();
  const totalRecords = await prisma.records.count();
  const totalAssignments = await prisma.assignments.count();
  const totalLeaves = await prisma.leave_requests.count();
  const totalTeamQuests = await prisma.team_quests.count();
  const totalPointsRow = await prisma.pets.aggregate({ _sum: { experience: true } });
  const totalPoints = totalPointsRow._sum.experience || 0;

  res.json({
    success: true,
    data: {
      server: {
        cpuUsage: parseFloat(cpuUsage),
        cpuCount,
        totalMem,
        usedMem,
        freeMem,
        memUsage: parseFloat(memUsage),
        uptime,
        platform: os.platform(),
      },
      database: {
        totalUsers,
        teachers: teachersCount,
        students: studentsCount,
        classes: classesCount,
        totalActivity: totalRecords,
        totalAssignments,
        totalLeaves,
        totalTeamQuests,
        totalPoints,
      }
    }
  });
}));

// Export Data
router.get('/data/export', asyncHandler(async (req: Request, res: Response) => {
  const dbPath = path.join(process.cwd(), 'database.sqlite');
  if (!fs.existsSync(dbPath)) {
    throw new ApiError(404, '数据库文件不存在');
  }
  res.download(dbPath, `backup-${Date.now()}.sqlite`);
}));

// Import Data (Optimized with Prisma and Hot Reload)
router.post('/data/import', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, '未提供文件');
  }

  const uploadedFilePath = req.file.path;
  const dbPath = path.join(process.cwd(), 'database.sqlite');
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  const backupPath = path.join(os.tmpdir(), `database-import-backup-${Date.now()}.sqlite`);
  let importError: ApiError | null = null;
  let shouldRestoreBackup = false;
  let didDisconnectPrisma = false;
  let didCloseSqlite = false;

  try {
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(uploadedFilePath, 'r');
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const magic = buffer.toString('utf8', 0, 15);
    if (magic !== 'SQLite format 3') {
      throw new ApiError(400, '无效的 SQLite 文件');
    }

    console.log('Starting optimized database import...');

    await prisma.$disconnect();
    didDisconnectPrisma = true;
    closeDb();
    didCloseSqlite = true;

    removeFileIfExists(walPath);
    removeFileIfExists(shmPath);

    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      shouldRestoreBackup = true;
    }

    fs.copyFileSync(uploadedFilePath, dbPath);

    execSync('npx prisma db push --accept-data-loss --skip-generate', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      importError = error;
    } else {
      console.error('Database import failed:', error);
      importError = new ApiError(500, '数据库结构升级失败');
    }

    if (shouldRestoreBackup) {
      try {
        removeFileIfExists(walPath);
        removeFileIfExists(shmPath);
        fs.copyFileSync(backupPath, dbPath);
        if (importError.statusCode >= 500) {
          importError = new ApiError(importError.statusCode, '数据库导入失败，已自动回滚到导入前状态');
        }
      } catch (restoreError) {
        console.error('Database rollback failed:', restoreError);
        importError = new ApiError(500, '数据库导入失败，且自动回滚失败，请检查服务日志');
      }
    }
  } finally {
    removeFileIfExists(uploadedFilePath);

    if (didCloseSqlite) {
      removeFileIfExists(walPath);
      removeFileIfExists(shmPath);

      try {
        reopenDb();
      } catch (dbError) {
        console.error('Error reopening better-sqlite3 db:', dbError);
        if (!importError) {
          importError = new ApiError(500, '数据库导入完成，但 SQLite 连接恢复失败');
        } else {
          importError = new ApiError(500, `${importError.message}，且 SQLite 连接恢复失败`);
        }
      }
    }

    if (didDisconnectPrisma) {
      try {
        await prisma.$connect();
      } catch (prismaError) {
        console.error('Error reconnecting Prisma:', prismaError);
        if (!importError) {
          importError = new ApiError(500, '数据库导入完成，但 Prisma 连接恢复失败');
        } else {
          importError = new ApiError(500, `${importError.message}，且 Prisma 连接恢复失败`);
        }
      }
    }

    removeFileIfExists(backupPath);
  }

  if (importError) {
    throw importError;
  }

  res.json({ success: true, message: '导入成功，数据结构已自动升级并热加载完成！' });
}));

// Reset Database
router.post('/reset-database', asyncHandler(async (req: Request, res: Response) => {
  // 1. Get current superadmins
  const superadmins = await prisma.users.findMany({ where: { role: 'superadmin' } });

  // 2. Drop all tables via better-sqlite3 to easily reset
  const { default: db } = await import('../db.js');
  db.prepare('PRAGMA foreign_keys = OFF').run();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name: string}[];
  
  const dropTables = db.transaction(() => {
    for (const table of tables) {
      db.prepare(`DROP TABLE IF EXISTS ${table.name}`).run();
    }
  });
  dropTables();
  db.prepare('PRAGMA foreign_keys = ON').run();

  // 3. Re-initialize the database
  initDb();

  // 4. Restore superadmins via Prisma
  await prisma.users.deleteMany({ where: { role: 'superadmin' } });
  if (superadmins.length > 0) {
    await prisma.users.createMany({
      data: superadmins.map(sa => ({
        id: sa.id,
        role: sa.role,
        username: sa.username,
        password_hash: sa.password_hash
      }))
    });
  }

  res.json({ success: true, message: '所有数据已重置' });
}));

// Get all announcements
router.get('/announcements', asyncHandler(async (req: Request, res: Response) => {
  const announcements = await prisma.announcements.findMany({ orderBy: { created_at: 'desc' } });
  res.json({ success: true, announcements });
}));

// Create announcement
router.post('/announcements', asyncHandler(async (req: Request, res: Response) => {
  const { title, content, is_active } = req.body;
  if (!title || !content) {
    throw new ApiError(400, '标题和内容为必填项');
  }
  
  if (is_active) {
    await prisma.announcements.updateMany({ data: { is_active: 0 } });
  }

  const newAnnouncement = await prisma.announcements.create({
    data: { title, content, is_active: is_active ? 1 : 0 }
  });
  res.json({ success: true, announcement: newAnnouncement });
}));

// Update announcement
router.put('/announcements/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, content, is_active } = req.body;
  
  if (is_active) {
    await prisma.announcements.updateMany({
      where: { id: { not: Number(id) } },
      data: { is_active: 0 }
    });
  }

  const updated = await prisma.announcements.update({
    where: { id: Number(id) },
    data: { title, content, is_active: is_active ? 1 : 0 }
  });
  res.json({ success: true, announcement: updated });
}));

// Delete announcement
router.delete('/announcements/:id', asyncHandler(async (req: Request, res: Response) => {
  await prisma.announcements.delete({ where: { id: Number(req.params.id) } });
  res.json({ success: true });
}));

// Get all teachers
router.get('/users', asyncHandler(async (req: Request, res: Response) => {
  const teachers = await prisma.users.findMany({
    where: { role: 'teacher' },
    select: { id: true, username: true, role: true },
    orderBy: { id: 'desc' }
  });
  res.json({ success: true, users: teachers });
}));

// Create a teacher
router.post('/users', asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    throw new ApiError(400, '用户名和密码为必填项');
  }

  const existingUser = await prisma.users.findUnique({ where: { username } });
  if (existingUser) {
    throw new ApiError(400, '用户名已存在');
  }

  const newTeacher = await prisma.users.create({
    data: { role: 'teacher', username, password_hash: password },
    select: { id: true, username: true, role: true }
  });
  res.json({ success: true, user: newTeacher });
}));

// Update a teacher
router.put('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, password } = req.body;

  if (!username) {
    throw new ApiError(400, '用户名为必填项');
  }

  const existingUser = await prisma.users.findFirst({
    where: { username, id: { not: Number(id) } }
  });
  if (existingUser) {
    throw new ApiError(400, '用户名已存在');
  }

  const dataToUpdate: any = { username };
  if (password) dataToUpdate.password_hash = password;

  const updatedTeacher = await prisma.users.update({
    where: { id: Number(id), role: 'teacher' },
    data: dataToUpdate,
    select: { id: true, username: true, role: true }
  });
  res.json({ success: true, user: updatedTeacher });
}));

// Delete a user
router.delete('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const user = await prisma.users.findUnique({ where: { id } });
  if (!user) return res.json({ success: true });

  // For complex deletions, we still use better-sqlite3 for now to avoid massive Prisma rewrites
  // We'll migrate this to Prisma cascading deletes in the future
  const { default: db } = await import('../db.js');
  db.transaction(() => {
    if (user.role === 'teacher') {
      db.prepare('DELETE FROM point_presets WHERE teacher_id = ?').run(id);
      db.prepare('DELETE FROM question_bank WHERE teacher_id = ?').run(id);
      const shopItems = db.prepare('SELECT id FROM shop_items WHERE teacher_id = ?').all(id) as any[];
      for (const item of shopItems) {
        db.prepare('DELETE FROM redemption_tickets WHERE item_id = ?').run(item.id);
      }
      db.prepare('DELETE FROM shop_items WHERE teacher_id = ?').run(id);
      db.prepare('DELETE FROM lucky_draw_config WHERE teacher_id = ?').run(id);
      db.prepare('DELETE FROM operation_logs WHERE teacher_id = ?').run(id);
      db.prepare('DELETE FROM praises WHERE teacher_id = ?').run(id);
      db.prepare('DELETE FROM class_announcements WHERE teacher_id = ?').run(id);

      const classes = db.prepare('SELECT id FROM classes WHERE teacher_id = ?').all(id) as any[];
      for (const cls of classes) {
        const students = db.prepare('SELECT id, user_id FROM students WHERE class_id = ?').all(cls.id) as any[];
        for (const student of students) {
          db.prepare('DELETE FROM pets WHERE student_id = ?').run(student.id);
          db.prepare('DELETE FROM records WHERE student_id = ?').run(student.id);
          db.prepare('DELETE FROM redemption_tickets WHERE student_id = ?').run(student.id);
          db.prepare('DELETE FROM praises WHERE student_id = ?').run(student.id);
          db.prepare('DELETE FROM certificates WHERE student_id = ?').run(student.id);
          db.prepare('DELETE FROM family_tasks WHERE student_id = ?').run(student.id);
          db.prepare('DELETE FROM challenge_records WHERE student_id = ?').run(student.id);
          db.prepare('DELETE FROM parent_students WHERE student_id = ?').run(student.id);
          db.prepare('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?').run(student.id, student.id);
          if (student.user_id) {
            db.prepare('DELETE FROM users WHERE id = ?').run(student.user_id);
          }
        }
        db.prepare('DELETE FROM students WHERE class_id = ?').run(cls.id);
        db.prepare('DELETE FROM student_groups WHERE class_id = ?').run(cls.id);
        db.prepare('DELETE FROM messages WHERE class_id = ?').run(cls.id);
      }
      db.prepare('DELETE FROM classes WHERE teacher_id = ?').run(id);
    } else if (user.role === 'student') {
      const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(id) as any;
      if (student) {
        db.prepare('DELETE FROM pets WHERE student_id = ?').run(student.id);
        db.prepare('DELETE FROM records WHERE student_id = ?').run(student.id);
        db.prepare('DELETE FROM redemption_tickets WHERE student_id = ?').run(student.id);
        db.prepare('DELETE FROM praises WHERE student_id = ?').run(student.id);
        db.prepare('DELETE FROM certificates WHERE student_id = ?').run(student.id);
        db.prepare('DELETE FROM family_tasks WHERE student_id = ?').run(student.id);
        db.prepare('DELETE FROM challenge_records WHERE student_id = ?').run(student.id);
        db.prepare('DELETE FROM parent_students WHERE student_id = ?').run(student.id);
        db.prepare('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?').run(student.id, student.id);
        db.prepare('DELETE FROM students WHERE id = ?').run(student.id);
      }
    } else if (user.role === 'parent') {
      db.prepare('DELETE FROM family_tasks WHERE parent_id = ?').run(id);
      db.prepare('DELETE FROM parent_students WHERE parent_id = ?').run(id);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  })();
  res.json({ success: true });
}));

// Settings
router.put('/settings', asyncHandler(async (req: Request, res: Response) => {
  const {
    site_title,
    site_favicon,
    allow_teacher_registration,
    revenue_enabled,
    revenue_mode,
    enable_teacher_analytics,
    enable_parent_report,
    payment_price,
    payment_currency,
    payment_description,
    payment_environment,
    payment_enable_wechat,
    payment_enable_alipay,
  } = req.body;
  const updates = [];
  if (site_title !== undefined) updates.push({ key: 'site_title', value: String(site_title) });
  if (site_favicon !== undefined) updates.push({ key: 'site_favicon', value: String(site_favicon) });
  if (allow_teacher_registration !== undefined) updates.push({ key: 'allow_teacher_registration', value: String(allow_teacher_registration) });
  if (revenue_enabled !== undefined) updates.push({ key: 'revenue_enabled', value: String(revenue_enabled) });
  if (revenue_mode !== undefined) updates.push({ key: 'revenue_mode', value: String(revenue_mode) });
  if (enable_teacher_analytics !== undefined) updates.push({ key: 'enable_teacher_analytics', value: String(enable_teacher_analytics) });
  if (enable_parent_report !== undefined) updates.push({ key: 'enable_parent_report', value: String(enable_parent_report) });
  if (payment_price !== undefined) updates.push({ key: 'payment_price', value: String(payment_price) });
  if (payment_currency !== undefined) updates.push({ key: 'payment_currency', value: String(payment_currency) });
  if (payment_description !== undefined) updates.push({ key: 'payment_description', value: String(payment_description) });
  if (payment_environment !== undefined) updates.push({ key: 'payment_environment', value: String(payment_environment) });
  if (payment_enable_wechat !== undefined) updates.push({ key: 'payment_enable_wechat', value: String(payment_enable_wechat) });
  if (payment_enable_alipay !== undefined) updates.push({ key: 'payment_enable_alipay', value: String(payment_enable_alipay) });

  for (const update of updates) {
    await prisma.settings.upsert({
      where: { key: update.key },
      update: { value: update.value },
      create: { key: update.key, value: update.value }
    });
  }
  res.json({ success: true });
}));

// Activation Codes
router.get('/codes', asyncHandler(async (req: Request, res: Response) => {
  const { default: db } = await import('../db.js');
  const codes = db.prepare(`
    SELECT ac.*, u.username as used_by_username, ae.source as activation_source, ae.remark as activation_remark
    FROM activation_codes ac
    LEFT JOIN users u ON ac.used_by = u.id
    LEFT JOIN activation_events ae ON ae.activation_code = ac.code
    ORDER BY ac.created_at DESC
  `).all();
  res.json({ success: true, codes });
}));

router.post('/codes', asyncHandler(async (req: Request, res: Response) => {
  const { count } = req.body;
  const numToGenerate = Number(count) || 10;
  
  if (numToGenerate <= 0 || numToGenerate > 1000) {
    throw new ApiError(400, '生成数量必须在 1 到 1000 之间');
  }

  const generatedCodes: string[] = [];
  const { default: db } = await import('../db.js');
  const insertCode = db.prepare('INSERT INTO activation_codes (code) VALUES (?)');
  
  db.transaction(() => {
    for (let i = 0; i < numToGenerate; i++) {
      const code = randomBytes(8).toString('hex').toUpperCase();
      insertCode.run(code);
      generatedCodes.push(code);
    }
  })();

  res.json({ success: true, message: `成功生成 ${numToGenerate} 个激活码`, codes: generatedCodes });
}));

// System Update Routes
router.get('/system/update/check', asyncHandler(async (req: Request, res: Response) => {
  const currentVersion = process.env.CURRENT_VERSION || '未知版本';
  const response = await fetch('https://api.github.com/repos/xhnhhnh/Think-Claass/releases/latest');
  const release = await response.json();
  
  if (!release || !release.tag_name) {
    throw new ApiError(500, '无法获取最新版本信息');
  }
  
  const latestVersion = release.tag_name;
  const hasUpdate = latestVersion !== currentVersion;
  
  res.json({
    success: true,
    data: {
      currentVersion,
      latestVersion,
      hasUpdate,
      releaseNotes: release.body,
      publishedAt: release.published_at,
      platform: process.platform
    }
  });
}));

router.post('/system/update/execute', asyncHandler(async (req: Request, res: Response) => {
  if (req.body?.confirmation !== 'UPDATE') {
    throw new ApiError(400, '缺少更新确认标记');
  }

  if (process.platform === 'win32') {
    throw new ApiError(400, 'Windows 环境暂不支持一键更新，请手动下载最新 Release 包解压覆盖（注意保留 database.sqlite 和 .env 文件）。');
  }

  const updateScriptPath = path.join(process.cwd(), 'update.sh');
  
  if (!fs.existsSync(updateScriptPath)) {
    throw new ApiError(404, '找不到 update.sh 脚本');
  }
  
  const updateProcess = spawn('bash', [updateScriptPath], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore'
  });
  
  updateProcess.unref();
  res.json({ success: true, message: '系统正在后台更新并重启，请稍后刷新页面' });
}));

export default router;
