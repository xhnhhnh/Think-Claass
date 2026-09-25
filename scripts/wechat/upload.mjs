#!/usr/bin/env node
/**
 * 上传小程序代码到微信「开发版本」。
 *
 * 为什么是一个脚本而不是手点：正式提报/复审会重复调用同一条上传路径，
 * CI 里需要一条命令；把它做成本仓库的一个小工具，就不用把上传步骤写在某个人的记忆里。
 *
 * ## 依赖要单独装（刻意不写进根 package.json）
 *
 * 这个脚本用的是 `miniprogram-ci`，而它**不是**本仓库的依赖：服务端镜像、
 * 部署流程、`npm ci` 的产物都与小程序上传无关，把它加进根 package.json 会让每次部署
 * 都多装一份只在小程序发布时用得到的东西。装法二选一：
 *
 *   # A. 临时装进本仓库（--no-save 不改 package.json）
 *   npm install --no-save miniprogram-ci
 *
 *   # B. 装到仓库外的独立目录，再指向它（推荐，完全不碰本仓库）
 *   mkdir -p ~/.think-class-ci && cd ~/.think-class-ci && npm init -y && npm install miniprogram-ci
 *   MINIPROGRAM_CI_DIR=~/.think-class-ci node scripts/wechat/upload.mjs
 *
 * ## 环境变量
 *
 *   MINIPROGRAM_APPID               必填。小程序 AppID（wx 开头），公众平台 → 开发管理 → 开发设置
 *   MINIPROGRAM_PRIVATE_KEY_PATH    必填。代码上传密钥文件路径（见下）
 *   MINIPROGRAM_VERSION             必填。上传的版本号，例如 1.0.0
 *   MINIPROGRAM_DESC                必填。版本描述，例如「竞赛提报版本：作业与课堂」
 *   MINIPROGRAM_PROJECT_PATH        选填。小程序项目目录，默认仓库根的 miniprogram/
 *   MINIPROGRAM_ROBOT               选填。上传机器人编号 1-30，默认 1
 *   MINIPROGRAM_CI_DIR              选填。装了 miniprogram-ci 的目录（见上面的装法 B）
 *
 * 上传密钥：微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传 → 生成并下载密钥，
 * 文件名形如 `private.<appid>.key`。**只能下载一次**，丢了必须在同一页面重置（旧的立即失效）。
 * 它是凭据：`.gitignore` **没有**忽略 `*.key`，所以放在仓库之外（例如 `~/.keys/`）最稳妥，
 * 别指望它不会被提交。
 *
 * ## 用法
 *
 *   MINIPROGRAM_APPID=wx1234567890abcdef \
 *   MINIPROGRAM_PRIVATE_KEY_PATH=~/.keys/private.wx1234567890abcdef.key \
 *   MINIPROGRAM_VERSION=1.0.0 \
 *   MINIPROGRAM_DESC='竞赛提报版本' \
 *   node scripts/wechat/upload.mjs
 *
 * 上传成功只代表"开发版本"里多了一个版本，还需要在公众平台提交审核并发布，
 * 见 docs/wechat/30-release-miniprogram.md。
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const REQUIRED_VARS = [
  {
    name: 'MINIPROGRAM_APPID',
    hint: '小程序 AppID（wx 开头）。公众平台 → 开发管理 → 开发设置 → 开发者 ID 里的 AppID(小程序 ID)。',
  },
  {
    name: 'MINIPROGRAM_PRIVATE_KEY_PATH',
    hint:
      '小程序代码上传密钥的文件路径。公众平台 → 开发管理 → 开发设置 → 小程序代码上传 → 生成并下载密钥；\n' +
      '    密钥只能下载一次，丢失需在同一页面重置（重置后旧文件立即失效）。',
  },
  {
    name: 'MINIPROGRAM_VERSION',
    hint: '本次上传的版本号，例如 1.0.0（公众平台把它当作开发版本号展示）。',
  },
  {
    name: 'MINIPROGRAM_DESC',
    hint: '本次上传的版本描述，例如「竞赛提报版本：作业与课堂」。审核员看的就是这一行。',
  },
];

function fail(message) {
  process.stderr.write(`\n[错误] ${message}\n`);
  process.exit(1);
}

function readMissingVars() {
  return REQUIRED_VARS.filter(({ name }) => {
    const value = process.env[name];
    return value === undefined || value.trim() === '';
  });
}

if (readMissingVars().length > 0) {
  const missing = readMissingVars();
  process.stderr.write('\n[错误] 缺少必需的环境变量，无法上传：\n\n');
  for (const { name, hint } of missing) {
    process.stderr.write(`  ${name}\n    ${hint}\n`);
  }
  process.stderr.write(
    '\n完整示例（bash）：\n' +
      "  MINIPROGRAM_APPID=wx1234567890abcdef \\\n" +
      '  MINIPROGRAM_PRIVATE_KEY_PATH=~/.keys/private.wx1234567890abcdef.key \\\n' +
      '  MINIPROGRAM_VERSION=1.0.0 \\\n' +
      "  MINIPROGRAM_DESC='竞赛提报版本' \\\n" +
      '  node scripts/wechat/upload.mjs\n\n' +
      '四个变量都必需，脚本不会替你猜任何默认值（猜错的 appid 或版本号会污染开发版本列表）。\n' +
      '变量含义与取法见 docs/wechat/30-release-miniprogram.md。\n\n',
  );
  process.exit(1);
}

const appid = process.env.MINIPROGRAM_APPID.trim();
const privateKeyPath = path.resolve(
  process.env.MINIPROGRAM_PRIVATE_KEY_PATH.trim().replace(/^~(?=[\\/])/, process.env.HOME ?? process.env.USERPROFILE ?? '~'),
);
const version = process.env.MINIPROGRAM_VERSION.trim();
const desc = process.env.MINIPROGRAM_DESC.trim();
const projectPath = path.resolve(REPO_ROOT, process.env.MINIPROGRAM_PROJECT_PATH?.trim() || 'miniprogram');
const robotRaw = process.env.MINIPROGRAM_ROBOT?.trim();

if (!/^wx[0-9a-f]{16}$/i.test(appid)) {
  process.stderr.write(
    `\n[警告] MINIPROGRAM_APPID 的值看起来不像小程序 AppID（期望 wx + 16 位十六进制）：${appid}\n` +
      '       如果这是从公众平台复制来的就继续；填错了上传会因为权限失败。\n\n',
  );
}

const robot = robotRaw ? Number.parseInt(robotRaw, 10) : 1;
if (!Number.isInteger(robot) || robot < 1 || robot > 30) {
  fail(`MINIPROGRAM_ROBOT 必须是 1-30 的整数，当前为 ${JSON.stringify(robotRaw)}。`);
}

if (!fs.existsSync(privateKeyPath) || !fs.statSync(privateKeyPath).isFile()) {
  fail(
    `上传密钥文件不存在：${privateKeyPath}\n` +
      '    从公众平台 → 开发管理 → 开发设置 → 小程序代码上传 下载，文件名形如 private.<appid>.key。\n' +
      '    注意路径里的 ~ 只会被展开成当前用户主目录（本脚本已处理），Windows 请用绝对路径。',
  );
}
if (fs.statSync(privateKeyPath).size === 0) {
  fail(`上传密钥文件是空的：${privateKeyPath}。重新下载或重置密钥后再试。`);
}

if (!fs.existsSync(projectPath)) {
  fail(
    `小程序项目目录不存在：${projectPath}\n` +
      '    默认取仓库根的 miniprogram/；用 MINIPROGRAM_PROJECT_PATH 指向别处。',
  );
}
if (!fs.existsSync(path.join(projectPath, 'project.config.json'))) {
  fail(
    `目录里没有 project.config.json：${projectPath}\n` +
      '    微信开发者工具打开的项目根目录必须包含 project.config.json（含 appid 与 miniprogramRoot）。',
  );
}

/** 解析 `miniprogram-ci`：先看 MINIPROGRAM_CI_DIR，再看仓库自身。CJS 包，用 createRequire。 */
function loadMiniprogramCi() {
  const searchDirs = [];
  if (process.env.MINIPROGRAM_CI_DIR?.trim()) {
    searchDirs.push(path.resolve(process.env.MINIPROGRAM_CI_DIR.trim()));
  }
  searchDirs.push(REPO_ROOT);

  const failures = [];
  for (const dir of searchDirs) {
    try {
      const requireFrom = createRequire(path.join(dir, 'noop.js'));
      return requireFrom('miniprogram-ci');
    } catch (error) {
      failures.push(`  ${dir} -> ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  }

  process.stderr.write(
    '\n[错误] 找不到 miniprogram-ci，无法上传。\n\n' +
      `已尝试的查找位置：\n${failures.join('\n')}\n\n` +
      '请任选一种方式安装（刻意不写进根 package.json，避免每次部署都多装一份）：\n\n' +
      '  # A. 临时装进本仓库（不改 package.json）\n' +
      '  npm install --no-save miniprogram-ci\n\n' +
      '  # B. 装到仓库外，再指向它（推荐）\n' +
      '  mkdir -p ~/.think-class-ci && cd ~/.think-class-ci && npm init -y && npm install miniprogram-ci\n' +
      '  MINIPROGRAM_CI_DIR=~/.think-class-ci node scripts/wechat/upload.mjs\n\n',
  );
  process.exit(1);
}

const ci = loadMiniprogramCi();

process.stdout.write(
  [
    '[信息] 开始上传小程序代码',
    `  AppID      : ${appid}`,
    `  项目目录   : ${projectPath}`,
    `  密钥文件   : ${privateKeyPath}`,
    `  版本 / 描述: ${version} / ${desc}`,
    `  上传机器人 : ${robot}`,
    '',
  ].join('\n'),
);

try {
  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    // 与官方示例一致：node_modules 不打进代码包。其余编译设置（es6 转换、压缩等）
    // 由项目自己的 project.config.json 决定，这里不覆盖 —— 覆盖会让工具里的行为
    // 和命令行上传的结果不一致，而"工具里好使、上传后不一样"是最难查的一类问题。
    ignores: ['node_modules/**/*'],
  });

  const result = await ci.upload({
    project,
    version,
    desc,
    robot,
    onProgressUpdate: (task) => {
      const message =
        typeof task === 'string' ? task : task?.message ?? task?.status ?? JSON.stringify(task);
      process.stdout.write(`[进度] ${message}\n`);
    },
  });

  process.stdout.write('\n[完成] 上传成功。\n');
  process.stdout.write(`  版本: ${version}\n  描述: ${desc}\n  机器人: ${robot}\n`);
  if (result !== undefined && result !== null) {
    process.stdout.write(`  返回: ${JSON.stringify(result)}\n`);
  }
  process.stdout.write(
    '\n下一步（上传不等于发布）：\n' +
      '  1. 公众平台 → 管理 → 版本管理 → 开发版本，确认这个版本在列表里；\n' +
      '  2. 选为体验版，用真机扫码走一遍关键流程；\n' +
      '  3. 提交审核（类目、隐私保护指引、功能页说明见 docs/wechat/30-release-miniprogram.md）；\n' +
      '  4. 审核通过后点发布 —— 竞赛要求作品在提报期内处于正式上线状态。\n\n',
  );
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `\n[错误] 上传失败：${reason}\n\n` +
      '常见原因，按出现频率：\n' +
      '  * 密钥与该 AppID 不匹配 / 密钥已被重置 —— 到公众平台重新生成并下载；\n' +
      '  * 当前微信号在该小程序里没有开发权限 —— 开发管理 → 成员管理 里加人；\n' +
      '  * 项目目录选错（上传了空目录或含 node_modules 的根目录）—— 检查 MINIPROGRAM_PROJECT_PATH；\n' +
      '  * 网络到微信接口不通（企业代理/CI 出口限制）。\n\n',
  );
  process.exit(1);
}
