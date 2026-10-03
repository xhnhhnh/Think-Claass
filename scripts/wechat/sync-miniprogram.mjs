#!/usr/bin/env node
/**
 * 把源码目录 `miniprogram/` 同步到微信开发者工具打开的工作副本 `wechat/`。
 *
 * ## 为什么需要它
 *
 * 工具打开的是一个**目录**，而进版本库的是另一个：`miniprogram/` 是源码（`git` 跟踪），`wechat/`
 * 是给工具直接打开的副本（`.gitignore` 忽略，见根 `.gitignore`）。两边内容必须一致，否则会出现最难查的
 * 一类问题——**在工具里改的东西 push 上去没有，或者 push 的东西工具里看不到**。这个脚本已实测踩过一次：
 * 同一份登录页只改了一边，工具里跑的是旧代码。
 *
 * ## 两个文件刻意不同步
 *
 *   config/index.ts  `wechat/` 里是**本机联调值**（`BASE_URL` 指向局域网 IP 以便真机调试、
 *                    `DEV_LOGIN_OPENID` 非空以便免 AppSecret 登录）。这些是开发者自己的，不是仓库的。
 *   README.md        `wechat/` 那份的第 1 节写的是"打开 `wechat/` 目录"，只在那个位置成立。
 *
 * 除这两处外，任何差异都会被复制并**复核**：脚本结束前重新比对两棵树，不一致就非零退出。
 *
 * ## 用法
 *
 *   node scripts/wechat/sync-miniprogram.mjs          # 同步并校验
 *   node scripts/wechat/sync-miniprogram.mjs --check   # 只校验、不写（可放进 CI）
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(REPO_ROOT, 'miniprogram');
const DST = path.join(REPO_ROOT, 'wechat');

/** The two files the working copy owns; see the header. */
const KEEP_LOCAL = new Set(['config/index.ts', 'README.md']);

const checkOnly = process.argv.includes('--check');

/**
 * Every file under `root`, keyed by its path relative to it.
 *
 * `.git` is skipped for both trees. That is not hypothetical: the first version of this script walked
 * into it, copied the repository's git directory into the working copy, and left `wechat/` looking
 * like a *separate* repository - which made `git status` answer about that copy instead of this repo.
 * A mini program has no business carrying git metadata into the developer tool either.
 */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'miniprogram_npm']);

function walk(root, prefix = '') {
  const out = new Map();
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      for (const [key, value] of walk(root, rel)) out.set(key, value);
    } else if (entry.isFile()) {
      out.set(rel, path.join(root, rel));
    }
  }
  return out;
}

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const src = walk(SRC);
const dst = walk(DST);

const copied = [];
const stale = [];

for (const [rel, srcPath] of src) {
  if (KEEP_LOCAL.has(rel)) continue;
  const dstPath = path.join(DST, rel);
  if (fs.existsSync(dstPath) && digest(dstPath) === digest(srcPath)) continue;
  if (checkOnly) {
    stale.push(rel);
    continue;
  }
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.copyFileSync(srcPath, dstPath);
  copied.push(rel);
}

const extra = [...dst.keys()].filter((rel) => !src.has(rel));

if (copied.length) {
  console.log(`同步 ${copied.length} 个文件：`);
  for (const rel of copied) console.log(`  ${rel}`);
}

if (stale.length) {
  console.error(`\n[失败] ${stale.length} 个文件与源码不一致（--check 模式不写盘）：`);
  for (const rel of stale) console.error(`  ${rel}`);
  console.error('\n运行 `node scripts/wechat/sync-miniprogram.mjs` 修好它。');
  process.exit(1);
}

if (extra.length) {
  console.error(`\n[失败] wechat/ 里存在源码没有的文件（应当为空）：`);
  for (const rel of extra) console.error(`  ${rel}`);
  process.exit(1);
}

console.log(
  `\n[通过] 两棵树一致，差异仅限刻意保留的 ${[...KEEP_LOCAL].join(' 与 ')}。\n` +
    `        miniprogram/ ${src.size} 个文件，wechat/ ${dst.size} 个文件。`,
);
