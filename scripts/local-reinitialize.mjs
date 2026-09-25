/** Rebuild one unpublished local instance after a verified backup. No default credentials. */
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import Database from 'better-sqlite3';
import { parse } from 'dotenv';
import { loadConfig } from '@thinkclass/kernel';

const root = path.resolve(import.meta.dirname, '..');
const envPath = path.join(root, '.env');
const dbPath = path.join(root, 'database.sqlite');
const dryRun = process.argv.includes('--check');
const generateCredentials = process.argv.includes('--generate');
const existingEnv = await fs.readFile(envPath).catch(() => null);
const configuredDbPath = loadConfig({ rootDir: root, env: { ...parse(existingEnv ?? ''), ...process.env } }).databaseFile;

function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex'); }

async function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

async function secretPrompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('请在交互式终端运行，不能通过日志或管道传入密码');
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') { cleanup(); process.stdout.write('\n'); resolve(value); return; }
        if (char === '\u0003') { cleanup(); reject(new Error('已取消')); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ' && char !== '\u007f') value += char;
      }
    };
    const cleanup = () => { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

function restrictToCurrentUser(target, directory = false) {
  if (process.platform !== 'win32') return;
  const whoami = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
  const sid = whoami.match(/S-\d+(?:-\d+)+/)?.[0];
  if (!sid) throw new Error('无法确认当前 Windows 用户；未执行清理。');
  execFileSync('icacls', [target, '/inheritance:r', '/grant:r', `*${sid}:${directory ? '(OI)(CI)' : ''}F`], { stdio: 'pipe' });
}

const active = await portOpen(Number(process.env.PORT || 3001));
const dbExists = await fs.stat(dbPath).then(() => true, () => false);
const envExists = await fs.stat(envPath).then(() => true, () => false);
if (dryRun) {
  console.log(JSON.stringify({ project: root, databasePresent: dbExists, configPresent: envExists, appServerActive: active, databasePathMatches: configuredDbPath === dbPath, ready: !active && dbExists && envExists && configuredDbPath === dbPath }, null, 2));
  process.exit(active || !dbExists || !envExists || configuredDbPath !== dbPath ? 1 : 0);
}
if (active) throw new Error('本地 API 服务仍在运行。请先关闭 3001 端口上的 Think-Class 服务，再执行初始化。');
if (!dbExists || !envExists) throw new Error('找不到当前数据库或 .env；未执行清理。');
if (!generateCredentials && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('必须在交互式终端设置新超管凭据。');

if (configuredDbPath !== dbPath) {
  throw new Error('当前数据库路径配置指向其他位置；未执行清理。请先核对目标实例。');
}

let username;
let password;
if (generateCredentials) {
  username = `admin_${randomBytes(5).toString('hex')}`;
  password = randomBytes(32).toString('base64url');
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { username = (await rl.question('新超管用户名（3–32 位，字母开头）：')).trim(); }
  finally { rl.close(); }
  password = await secretPrompt('新超管密码（至少 12 位，输入不显示）：');
  const repeat = await secretPrompt('再次输入密码（输入不显示）：');
  if (password !== repeat) throw new Error('两次输入不一致，未执行清理。');
}
if (!/^[A-Za-z][A-Za-z0-9_.-]{2,31}$/.test(username)) throw new Error('用户名格式无效，未执行清理。');
if (password.length < 12) throw new Error('密码过短，未执行清理。');

const salt = randomBytes(16).toString('hex');
const passwordHash = `scrypt$16384$8$1$${salt}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
const encryptionKey = randomBytes(24).toString('base64'); // exactly 32 UTF-8 bytes
const newEnv = `DATABASE_URL="file:./database.sqlite"\nSUPERADMIN_USERNAME=${username}\nSUPERADMIN_PASSWORD=${passwordHash}\nENCRYPTION_KEY=${encryptionKey}\n`;
const backupRoot = path.join(os.homedir(), 'Think-Class-backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(backupRoot, `before-local-reinitialize-${stamp}`);
await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
restrictToCurrentUser(backupDir, true);

// A SQLite online backup captures a consistent database even if WAL pages remain on disk.
const sourceDb = new Database(dbPath, { readonly: true, fileMustExist: true });
try { await sourceDb.backup(path.join(backupDir, 'database.sqlite')); }
finally { sourceDb.close(); }
await fs.copyFile(envPath, path.join(backupDir, 'runtime.env'));
const backupDb = await fs.readFile(path.join(backupDir, 'database.sqlite'));
const backupEnv = await fs.readFile(path.join(backupDir, 'runtime.env'));
const manifest = {
  createdAt: new Date().toISOString(),
  sourceDatabase: dbPath,
  databaseSha256: sha256(backupDb),
  configSha256: sha256(backupEnv),
  databaseBytes: backupDb.length,
  configBytes: backupEnv.length,
};
await fs.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
if (sha256(await fs.readFile(path.join(backupDir, 'database.sqlite'))) !== manifest.databaseSha256 ||
    sha256(await fs.readFile(path.join(backupDir, 'runtime.env'))) !== manifest.configSha256) {
  throw new Error('备份校验失败；未执行清理。');
}

if (generateCredentials) {
  const credentialPath = path.join(backupDir, 'new-superadmin.txt');
  await fs.writeFile(credentialPath, `用户名：${username}\n密码：${password}\n`, { mode: 0o600, flag: 'wx' });
  restrictToCurrentUser(credentialPath);
}

const tempEnv = path.join(root, `.env.reinitialize-${process.pid}`);
await fs.writeFile(tempEnv, newEnv, { mode: 0o600, flag: 'wx' });
restrictToCurrentUser(tempEnv);

// Exact project-owned files only, after the backup has passed. No recursive deletion.
for (const suffix of ['', '-wal', '-shm']) await fs.rm(`${dbPath}${suffix}`, { force: true });
await fs.rename(tempEnv, envPath);
console.log(`本地实例已清理。备份：${backupDir}`);
console.log(`数据库 SHA-256：${manifest.databaseSha256}`);
console.log(`配置 SHA-256：${manifest.configSha256}`);
console.log('新凭据及加密密钥未写入日志。请启动服务并使用新超管账号登录。');
if (generateCredentials) console.log(`新超管凭据仅保存在：${path.join(backupDir, 'new-superadmin.txt')}`);
