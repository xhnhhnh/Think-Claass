#!/usr/bin/env node
/**
 * One-command, isolated design-review instance.
 *
 *   npm run demo
 *   npm run demo -- --reset
 *
 * Why this exists: the product has no seed on boot (a fresh deployment is
 * superadmin-only by design), so every design review of the teacher, student or parent
 * surface started with an empty database. This script copies `database.sqlite` into
 * `.tmp/demo/`, starts an API on a second port against that copy, creates a small but
 * realistic class over the public HTTP API, then starts a second Vite pointed at it.
 *
 * The real database is never written. The demo database is disposable; deleting
 * `.tmp/demo/` and running again is the reset. The script refuses to run under
 * NODE_ENV=production and never prints the superadmin credential.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DEMO_DIR = path.join(ROOT, '.tmp', 'demo');
const DEMO_DB = path.join(DEMO_DIR, 'database.sqlite');
const SOURCE_DB = path.join(ROOT, 'database.sqlite');
const API_PORT = Number(process.env.DEMO_API_PORT || 3002);
const WEB_PORT = Number(process.env.DEMO_WEB_PORT || 5174);
const API = `http://localhost:${API_PORT}/api`;
const WEB = `http://localhost:${WEB_PORT}`;

const TEACHER = { username: 'demo_teacher', password: 'Demo@123456' };
const PARENT = { username: 'demo_parent', password: '123456' };
const STUDENT_PASSWORD = '123456';
const STUDENT_NAMES = [
  '张子涵', '李思远', '王梓萌', '陈一诺', '赵天宇', '刘雨桐',
  '周子墨', '吴佳怡', '孙浩然', '徐梦瑶', '黄子轩', '郑诗涵',
];

const children = [];
let shuttingDown = false;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`\n[demo] ${message}\n`);
  shutdown(1);
}

function parseEnv(file) {
  const result = {};
  if (!fs.existsSync(file)) return result;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.reverse()) killTree(child);
  process.exit(code);
}

async function waitFor(url, label, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function request(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok || payload.success === false) {
    throw new Error(`${method} ${pathname} -> ${response.status}: ${payload.message || text.slice(0, 200)}`);
  }
  return payload;
}

async function seed() {
  const env = parseEnv(path.join(ROOT, '.env'));
  const adminUsername = env.SUPERADMIN_USERNAME;
  const adminPassword = env.SUPERADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    throw new Error('SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD missing from .env; cannot seed.');
  }

  log('  · 登录超级管理员');
  const adminSession = await request('/admin/session', {
    method: 'POST',
    body: { username: adminUsername, password: adminPassword },
  });
  const adminToken = adminSession.data.token;

  log('  · 创建演示教师');
  let teacherId;
  try {
    const created = await request('/admin/users', {
      method: 'POST',
      token: adminToken,
      body: { username: TEACHER.username, password: TEACHER.password },
    });
    teacherId = created.data?.id;
  } catch (error) {
    if (!/已存在|exist/i.test(error.message)) throw error;
    const users = await request('/admin/users', { token: adminToken });
    teacherId = users.items?.find((item) => item.username === TEACHER.username)?.id;
  }
  if (!teacherId) throw new Error('Teacher was created but no id was returned.');

  log('  · 教师登录并创建班级');
  const teacherLogin = await request('/auth/login', {
    method: 'POST',
    body: { username: TEACHER.username, password: TEACHER.password, role: 'teacher' },
  });
  const teacherToken = teacherLogin.token;
  const createdClass = await request('/classes', {
    method: 'POST',
    token: teacherToken,
    body: { name: '三年二班' },
  });
  const classRow = createdClass.class;
  const classId = classRow.id;

  log('  · 导入 12 名学生');
  const imported = await request('/students/batch-import', {
    method: 'POST',
    token: teacherToken,
    body: {
      class_id: classId,
      students: STUDENT_NAMES.map((name, index) => ({
        name,
        username: `demo_student_${String(index + 1).padStart(2, '0')}`,
      })),
    },
  });
  const students = imported.students ?? [];

  log('  · 开启课堂功能');
  const featureFlags = [
    'enable_achievements', 'enable_ai_study', 'enable_auction_blind_box', 'enable_challenge',
    'enable_chat_bubble', 'enable_class_brawl', 'enable_danmaku', 'enable_dungeon',
    'enable_economy', 'enable_family_tasks', 'enable_gacha', 'enable_guild_pk',
    'enable_lucky_draw', 'enable_parent_buff', 'enable_peer_review', 'enable_shop',
    'enable_slg', 'enable_task_tree', 'enable_tree_hole', 'enable_world_boss',
  ];
  await request(`/classes/${classId}/features`, {
    method: 'PUT',
    token: teacherToken,
    body: Object.fromEntries(featureFlags.map((flag) => [flag, true])),
  });

  log('  · 分组并加分');
  const groupNames = ['星火组', '探索组'];
  const groups = [];
  for (const name of groupNames) {
    const created = await request('/groups', {
      method: 'POST',
      token: teacherToken,
      body: { name, class_id: classId },
    });
    groups.push(created.group);
  }
  for (let index = 0; index < students.length; index += 1) {
    await request('/groups/assign', {
      method: 'POST',
      token: teacherToken,
      body: { studentId: students[index].id, groupId: groups[index % groups.length].id },
    });
    // One score call is capped at ±5 by the endpoint contract, so a demo balance is built
    // from a few realistic classroom entries rather than one impossible +12.
    for (let round = 0; round < 3; round += 1) {
      await request(`/students/${students[index].id}/points`, {
        method: 'POST',
        token: teacherToken,
        body: { amount: 3 + ((index + round) % 3), reason: round === 2 ? '小组合作' : '课堂参与' },
      });
    }
  }

  log('  · 布置作业与测验');
  const today = new Date();
  const isoDate = (offsetDays) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  };
  await request('/assignments', {
    method: 'POST',
    token: teacherToken,
    body: {
      class_id: classId,
      teacher_id: teacherId,
      title: '第三课 · 分数的初步认识',
      description: '完成练习册第 12–13 页，拍照上传解题过程。',
      due_date: isoDate(1),
      reward_points: 5,
    },
  });
  await request('/assignments', {
    method: 'POST',
    token: teacherToken,
    body: {
      class_id: classId,
      teacher_id: teacherId,
      title: '课堂小练 · 口算 10 题',
      description: '课内完成，同桌互批。',
      due_date: isoDate(0),
      reward_points: 2,
    },
  });

  // A real homework row with questions, so the homework console and the student's
  // "today" card show a populated, gradable assignment instead of only the legacy
  // read-only rows the bridge exposes.
  await request('/homework', {
    method: 'POST',
    token: teacherToken,
    body: {
      class_id: classId,
      title: '第三课 · 分数的初步认识（练习）',
      description: '先看例题，再完成下面三题；计算过程写在练习本上。',
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'published',
      reward_points: 5,
      questions: [
        {
          type: 'single',
          stem: '1/2 + 1/4 的结果是？',
          options: [
            { id: 'A', text: '3/4' },
            { id: 'B', text: '2/6' },
            { id: 'C', text: '1/6' },
            { id: 'D', text: '2/4' },
          ],
          reference: { choice: ['A'] },
          explanation: '先通分，再相加。',
          points: 2,
        },
        {
          type: 'blank',
          stem: '5/8 的分子是 ____。',
          reference: { accept: ['5'] },
          points: 1,
        },
        {
          type: 'short',
          stem: '用自己的话说一说：为什么 1/2 比 1/3 大？',
          reference: { text: '同样一个整体，平均分的份数越少，每一份越大。' },
          points: 2,
        },
      ],
    },
  });

  const exam = await request('/exams', {
    method: 'POST',
    token: teacherToken,
    body: {
      class_id: classId,
      teacher_id: teacherId,
      title: '第三单元测验',
      description: '分数的意义与简单计算。',
      exam_date: isoDate(3),
      total_score: 100,
    },
  });
  if (exam.data?.id) {
    await request(`/exams/${exam.data.id}/grades`, {
      method: 'PUT',
      token: teacherToken,
      body: {
        grades: students.map((student, index) => ({
          student_id: student.id,
          score: 72 + ((index * 7) % 26),
          feedback: index % 3 === 0 ? '计算再细心一点' : null,
        })),
      },
    });
  }

  log('  · 上架班级商店');
  for (const item of [
    { name: '免作业券', description: '可抵扣一次课堂作业（老师确认）。', price: 30, stock: 10 },
    { name: '小组加分卡', description: '给所在小组加 5 分，限本周使用。', price: 20, stock: 20 },
    { name: '精灵口粮', description: '喂给精灵，恢复一点体力。', price: 10, stock: 99 },
  ]) {
    await request('/shop', { method: 'POST', token: teacherToken, body: item });
  }

  log('  · 学生领养精灵');
  const studentLogin = await request('/auth/login', {
    method: 'POST',
    body: { username: students[0].username, password: STUDENT_PASSWORD, role: 'student' },
  });
  const studentToken = studentLogin.token;
  try {
    await request(`/pet/students/${students[0].id}/adoptions`, {
      method: 'POST',
      token: studentToken,
      body: { elementType: 'fire' },
    });
  } catch (error) {
    if (!/已领养|already/i.test(error.message)) throw error;
  }

  log('  · 创建演示家长');
  try {
    await request('/auth/register', {
      method: 'POST',
      body: {
        username: PARENT.username,
        password: PARENT.password,
        role: 'parent',
        name: '张子涵家长',
        invite_code: classRow.invite_code,
        student_id: students[0].id,
      },
    });
  } catch (error) {
    if (!/已存在|exist/i.test(error.message)) {
      log(`    (家长账号跳过：${error.message})`);
    }
  }

  log('  · 添加一条校园公告');
  await request('/admin/announcements', {
    method: 'POST',
    token: adminToken,
    body: {
      title: '欢迎使用 Think-Class 演示实例',
      content: '这是一份隔离的演示数据，可以放心点击、加分和提交作业。',
      type: 'system',
      is_active: 1,
    },
  });

  return {
    classId,
    classInviteCode: classRow.invite_code,
    studentCount: students.length,
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    fail('Refusing to run with NODE_ENV=production.');
  }
  if (!fs.existsSync(SOURCE_DB)) {
    fail(`No database.sqlite at ${SOURCE_DB}. Start the app once so the boot schema exists.`);
  }

  log('Think-Class demo instance');
  log(`  source database: ${path.relative(ROOT, SOURCE_DB)}`);
  log(`  demo database:   ${path.relative(ROOT, DEMO_DB)}`);

  fs.mkdirSync(DEMO_DIR, { recursive: true });
  if (fs.existsSync(DEMO_DB)) {
    fs.rmSync(DEMO_DB);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${DEMO_DB}${suffix}`;
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
    }
  }
  log('  · 备份数据库到演示目录');
  const source = new Database(SOURCE_DB, { readonly: true });
  try {
    await source.backup(DEMO_DB);
  } finally {
    source.close();
  }

  const env = {
    ...process.env,
    ...parseEnv(path.join(ROOT, '.env')),
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    DATABASE_FILE: DEMO_DB,
  };

  log(`  · 启动演示 API (${API_PORT})`);
  const api = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  children.push(api);
  api.on('exit', (code) => {
    if (!shuttingDown) fail(`Demo API exited with code ${code}.`);
  });

  await waitFor(`http://localhost:${API_PORT}/api/health`, 'demo API');
  log('  · API ready, seeding');
  const summary = await seed();
  log(`  · 数据就绪：${summary.studentCount} 名学生，班级邀请码 ${summary.classInviteCode}`);

  log(`  · 启动演示前端 (${WEB_PORT})`);
  const web = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'client:dev', '--', '--port', String(WEB_PORT), '--strictPort'],
    {
      cwd: ROOT,
      env: { ...env, VITE_PORT: String(WEB_PORT), VITE_PROXY_TARGET: `http://localhost:${API_PORT}` },
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32',
    },
  );
  children.push(web);
  web.on('exit', (code) => {
    if (!shuttingDown) fail(`Demo web exited with code ${code}.`);
  });

  await waitFor(WEB, 'demo web');

  log('');
  log('  ✓ 演示实例已就绪（数据只写入 .tmp/demo，真实数据库未改动）');
  log(`    前端：${WEB}`);
  log(`    管理后台：${WEB}/beiadmin/login`);
  log(`    教师：${TEACHER.username} / ${TEACHER.password}`);
  log(`    学生：demo_student_01 / ${STUDENT_PASSWORD}（共 ${summary.studentCount} 个学生账号）`);
  log(`    家长：${PARENT.username} / ${PARENT.password}（如创建成功）`);
  log('    按 Ctrl+C 停止；删除 .tmp/demo/ 可重置演示数据。');
  log('');
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((error) => {
  fail(error?.stack || String(error));
});
