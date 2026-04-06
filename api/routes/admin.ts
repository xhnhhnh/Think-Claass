import { Router, type Request, type Response } from 'express';
import express from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import multer from 'multer';
import db from '../db.js';
import { closeDb, initDb } from '../db.js';

const router = Router();
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

const upload = multer({ dest: os.tmpdir() });

// Super admin login
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ? AND role = ?').get(username, password, 'superadmin') as any;
    if (user) {
      res.json({ success: true, user: { id: user.id, role: user.role, username: user.username } });
    } else {
      res.status(401).json({ success: false, message: '账号或密码错误，请重试' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// Super admin stats
router.get('/stats', (req: Request, res: Response) => {
  try {
    // 1. Get OS stats
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
    
    // 2. Get DB stats
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role IN ('teacher', 'student')").get() as { count: number };
    const teachersCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('teacher') as { count: number };
    const studentsCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('student') as { count: number };
    const classesCount = db.prepare('SELECT COUNT(*) as count FROM classes').get() as { count: number };
    const totalRecords = db.prepare('SELECT COUNT(*) as count FROM records').get() as { count: number };

    const totalAssignments = db.prepare('SELECT COUNT(*) as count FROM assignments').get() as { count: number };
    const totalLeaves = db.prepare('SELECT COUNT(*) as count FROM leave_requests').get() as { count: number };
    const totalTeamQuests = db.prepare('SELECT COUNT(*) as count FROM team_quests').get() as { count: number };
    const totalPointsRow = db.prepare('SELECT SUM(experience) as total FROM pets').get() as { total: number | null };
    const totalPoints = totalPointsRow.total || 0;

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
          totalUsers: totalUsers.count,
          teachers: teachersCount.count,
          students: studentsCount.count,
          classes: classesCount.count,
          totalActivity: totalRecords.count,
          totalAssignments: totalAssignments.count,
          totalLeaves: totalLeaves.count,
          totalTeamQuests: totalTeamQuests.count,
          totalPoints,
        }
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// Export Data
router.get('/data/export', (req: Request, res: Response): void => {
  try {
    const dbPath = path.join(process.cwd(), 'database.sqlite');
    if (!fs.existsSync(dbPath)) {
      res.status(404).json({ success: false, message: '数据库文件不存在' });
      return;
    }
    res.download(dbPath, `backup-${Date.now()}.sqlite`);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: '导出失败' });
  }
});

// Import Data
router.post('/data/import', upload.single('file'), (req: Request, res: Response): void => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: '未提供文件' });
      return;
    }

    const uploadedFilePath = req.file.path;
    const dbPath = path.join(process.cwd(), 'database.sqlite');

    // Basic validation of sqlite file
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(uploadedFilePath, 'r');
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    const magic = buffer.toString('utf8', 0, 15);
    if (magic !== 'SQLite format 3') {
      fs.unlinkSync(uploadedFilePath);
      res.status(400).json({ success: false, message: '无效的 SQLite 文件' });
      return;
    }

    // Close current db connection
    try {
      closeDb();
    } catch (e) {
      console.error('Error closing db:', e);
    }

    // Replace the file
    fs.copyFileSync(uploadedFilePath, dbPath);
    fs.unlinkSync(uploadedFilePath);

    res.json({ success: true, message: '导入成功，服务器将在 2 秒后重启' });

    // Restart server after sending response
    setTimeout(() => {
      console.log('Restarting server due to database import...');
      process.exit(0);
    }, 2000);
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, message: '导入失败' });
  }
});

// Reset Database
router.post('/reset-database', (req: Request, res: Response): void => {
  try {
    // 1. Get current superadmins
    const superadmins = db.prepare("SELECT * FROM users WHERE role = 'superadmin'").all() as any[];

    // 2. Drop all tables
    db.prepare('PRAGMA foreign_keys = OFF').run();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name: string}[];
    
    const dropTables = db.transaction(() => {
      for (const table of tables) {
        db.prepare(`DROP TABLE IF EXISTS ${table.name}`).run();
      }
    });
    dropTables();
    db.prepare('PRAGMA foreign_keys = ON').run();

    // 3. Re-initialize the database (creates tables, default settings, default teacher, default superadmin)
    initDb();

    // 4. Restore superadmins
    db.prepare("DELETE FROM users WHERE role = 'superadmin'").run();
    const insertUser = db.prepare("INSERT INTO users (id, role, username, password_hash) VALUES (?, ?, ?, ?)");
    const insertUserTransaction = db.transaction(() => {
      for (const sa of superadmins) {
        insertUser.run(sa.id, sa.role, sa.username, sa.password_hash);
      }
    });
    insertUserTransaction();

    res.json({ success: true, message: '所有数据已重置，系统即将在 2 秒后重启以应用更改' });

    // Restart server after sending response to ensure a clean state
    setTimeout(() => {
      console.log('Restarting server due to database reset...');
      process.exit(0);
    }, 2000);
  } catch (error) {
    console.error('Reset database error:', error);
    res.status(500).json({ success: false, message: '重置数据库失败' });
  }
});

// Get all announcements
router.get('/announcements', (req: Request, res: Response): void => {
  try {
    const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
    res.json({ success: true, announcements });
  } catch (error) {
    console.error('Fetch announcements error:', error);
    res.status(500).json({ success: false, message: '获取公告失败' });
  }
});

// Create announcement
router.post('/announcements', (req: Request, res: Response): void => {
  try {
    const { title, content, is_active } = req.body;
    if (!title || !content) {
      res.status(400).json({ success: false, message: '标题和内容为必填项' });
      return;
    }
    
    // If setting as active, maybe we want to deactivate others? Or allow multiple active? 
    // The task says "active announcement (e.g. as a top banner)". Let's deactivate others if this one is active.
    if (is_active) {
      db.prepare('UPDATE announcements SET is_active = 0').run();
    }

    const isActiveNum = is_active ? 1 : 0;
    const info = db.prepare('INSERT INTO announcements (title, content, is_active) VALUES (?, ?, ?)').run(String(title), String(content), isActiveNum);
    const newAnnouncement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, announcement: newAnnouncement });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ success: false, message: '创建公告失败' });
  }
});

// Update announcement
router.put('/announcements/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { title, content, is_active } = req.body;
    
    if (is_active) {
      db.prepare('UPDATE announcements SET is_active = 0 WHERE id != ?').run(id);
    }

    const isActiveNum = is_active ? 1 : 0;
    db.prepare('UPDATE announcements SET title = ?, content = ?, is_active = ? WHERE id = ?').run(String(title), String(content), isActiveNum, id);
    const updated = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
    res.json({ success: true, announcement: updated });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ success: false, message: '更新公告失败' });
  }
});

// Delete announcement
router.delete('/announcements/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ success: false, message: '删除公告失败' });
  }
});

// ==========================
// Teachers Management Routes
// ==========================

// Get all teachers
router.get('/users', (req: Request, res: Response): void => {
  try {
    const teachers = db.prepare('SELECT id, username, role FROM users WHERE role = ? ORDER BY id DESC').all('teacher');
    res.json({ success: true, users: teachers });
  } catch (error) {
    console.error('Fetch teachers error:', error);
    res.status(500).json({ success: false, message: '获取教师列表失败' });
  }
});

// Create a teacher
router.post('/users', (req: Request, res: Response): void => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ success: false, message: '用户名和密码为必填项' });
      return;
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(String(username));
    if (existingUser) {
      res.status(400).json({ success: false, message: '用户名已存在' });
      return;
    }

    const info = db.prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)').run('teacher', String(username), String(password));
    const newTeacher = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, user: newTeacher });
  } catch (error) {
    console.error('Create teacher error:', error);
    res.status(500).json({ success: false, message: '创建教师失败' });
  }
});

// Update a teacher (password)
router.put('/users/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { username, password } = req.body;

    if (!username) {
      res.status(400).json({ success: false, message: '用户名为必填项' });
      return;
    }

    // Check if new username conflicts with another user
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(String(username), id);
    if (existingUser) {
      res.status(400).json({ success: false, message: '用户名已存在' });
      return;
    }

    if (password) {
      db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ? AND role = ?').run(String(username), String(password), id, 'teacher');
    } else {
      db.prepare('UPDATE users SET username = ? WHERE id = ? AND role = ?').run(String(username), id, 'teacher');
    }

    const updatedTeacher = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id);
    res.json({ success: true, user: updatedTeacher });
  } catch (error) {
    console.error('Update teacher error:', error);
    res.status(500).json({ success: false, message: '更新教师失败' });
  }
});

// Delete a user
router.delete('/users/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;

    db.transaction(() => {
      const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as any;
      if (!user) return;

      if (user.role === 'teacher') {
        // Delete teacher's records
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
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: '删除用户失败' });
  }
});

// ==========================
// Settings 路由
// ==========================
router.put('/settings', (req: any, res) => {
  const { site_title, site_favicon, allow_teacher_registration, revenue_enabled, revenue_mode } = req.body;
  try {
    if (site_title !== undefined) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(site_title), 'site_title');
    }
    if (site_favicon !== undefined) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(site_favicon), 'site_favicon');
    }
    if (allow_teacher_registration !== undefined) {
      const val = allow_teacher_registration === true ? '1' : allow_teacher_registration === false ? '0' : String(allow_teacher_registration);
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(val, 'allow_teacher_registration');
    }
    if (revenue_enabled !== undefined) {
      const val = revenue_enabled === true ? '1' : revenue_enabled === false ? '0' : String(revenue_enabled);
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(val, 'revenue_enabled');
    }
    if (revenue_mode !== undefined) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(revenue_mode), 'revenue_mode');
    }
    res.json({ success: true });
  } catch (error) {
    console.error('更新设置失败:', error);
    res.status(500).json({ success: false, message: '更新设置失败' });
  }
});

// ==========================
// Activation Codes 路由
// ==========================
router.get('/codes', (req: any, res) => {
  try {
    const codes = db.prepare(`
      SELECT ac.*, u.username as used_by_username
      FROM activation_codes ac
      LEFT JOIN users u ON ac.used_by = u.id
      ORDER BY ac.created_at DESC
    `).all();
    res.json({ success: true, codes });
  } catch (error) {
    console.error('获取激活码失败:', error);
    res.status(500).json({ success: false, message: '获取激活码失败' });
  }
});

router.post('/codes', (req: any, res) => {
  const { count } = req.body;
  const numToGenerate = Number(count) || 10;
  
  if (numToGenerate <= 0 || numToGenerate > 1000) {
    return res.status(400).json({ success: false, message: '生成数量必须在 1 到 1000 之间' });
  }

  try {
    const generatedCodes: string[] = [];
    const insertCode = db.prepare('INSERT INTO activation_codes (code) VALUES (?)');
    
    db.transaction(() => {
      for (let i = 0; i < numToGenerate; i++) {
        // Generate a random 12-character code
        const code = Math.random().toString(36).substring(2, 8).toUpperCase() + 
                     Math.random().toString(36).substring(2, 8).toUpperCase();
        insertCode.run(code);
        generatedCodes.push(code);
      }
    })();

    res.json({ success: true, message: `成功生成 ${numToGenerate} 个激活码`, codes: generatedCodes });
  } catch (error) {
    console.error('生成激活码失败:', error);
    res.status(500).json({ success: false, message: '生成激活码失败' });
  }
});

// ==========================
// System Update Routes
// ==========================
router.get('/system/update/check', async (req: Request, res: Response): Promise<void> => {
  try {
    const currentVersion = process.env.CURRENT_VERSION || '未知版本';
    const response = await fetch('https://api.github.com/repos/xhnhhnh/Think-Claass/releases/latest');
    const release = await response.json();
    
    if (!release || !release.tag_name) {
      res.status(500).json({ success: false, message: '无法获取最新版本信息' });
      return;
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
        publishedAt: release.published_at
      }
    });
  } catch (error) {
    console.error('Update check error:', error);
    res.status(500).json({ success: false, message: '检查更新失败' });
  }
});

router.post('/system/update/execute', (req: Request, res: Response): void => {
  try {
    const updateScriptPath = path.join(process.cwd(), 'update.sh');
    
    if (!fs.existsSync(updateScriptPath)) {
      res.status(404).json({ success: false, message: '找不到 update.sh 脚本' });
      return;
    }
    
    // Spawn the update script in the background
    const updateProcess = spawn('bash', [updateScriptPath], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore'
    });
    
    updateProcess.unref();
    
    res.json({ success: true, message: '系统正在后台更新并重启，请稍后刷新页面' });
  } catch (error) {
    console.error('Update execution error:', error);
    res.status(500).json({ success: false, message: '触发更新失败' });
  }
});

export default router;
