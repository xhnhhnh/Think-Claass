#!/usr/bin/env node
/**
 * Visual review for the four consoles, against a running instance.
 *
 *   npm run design:capture              # screenshots + a report
 *   npm run design:verify               # the same, plus the hard layout assertions
 *   DESIGN_BASE_URL=http://localhost:5173 npm run design:capture
 *
 * The demo instance (`npm run demo`) is the intended target: it has a teacher, a class,
 * students, homework, an exam and a pet, so a screenshot reviews the populated state rather
 * than an empty shell. The script logs in through the public API and writes the same zustand
 * payload the web client persists, so no test-only endpoint is involved.
 *
 * What this cannot judge: whether the page is beautiful. What it can judge is the part a
 * human reviewer keeps missing - horizontal overflow, more than one h1, an external texture
 * request, and the number of distinct radii / font sizes / shadows on one screen. The
 * thresholds are deliberately loose today; W5 lowers them as the pages migrate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CDP = process.env.DESIGN_CDP_URL || 'http://127.0.0.1:9222';
const BASE = (process.env.DESIGN_BASE_URL || 'http://localhost:5174').replace(/\/$/, '');
const OUT = path.resolve(ROOT, '.tmp', 'design-review');
const CHECK = process.argv.includes('--check');
const ALL = process.argv.includes('--all');
const DARK = process.env.DESIGN_DARK === '1' || process.argv.includes('--dark');

const ROUTES = [
  { role: 'admin', name: 'admin-dashboard', path: '/beiadmin' },
  { role: 'admin', name: 'admin-teachers', path: '/beiadmin/teachers' },
  { role: 'admin', name: 'admin-settings', path: '/beiadmin/settings' },
  { role: 'teacher', name: 'teacher-workbench', path: '/teacher' },
  { role: 'teacher', name: 'teacher-attendance', path: '/teacher/attendance' },
  { role: 'teacher', name: 'teacher-homework', path: '/teacher/homework' },
  { role: 'teacher', name: 'teacher-exams', path: '/teacher/exams' },
  { role: 'teacher', name: 'teacher-features', path: '/teacher/features' },
  { role: 'student', name: 'student-overview', path: '/student' },
  { role: 'student', name: 'student-shop', path: '/student/shop' },
  { role: 'student', name: 'student-pet', path: '/student/pet' },
  { role: 'parent', name: 'parent-dashboard', path: '/parent' },
];

const VIEWPORTS = ALL
  ? [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'phone', width: 390, height: 844 },
    ]
  : [{ name: 'desktop', width: 1440, height: 900 }];

const ACCOUNTS = {
  teacher: {
    username: process.env.DESIGN_TEACHER_USERNAME || 'demo_teacher',
    password: process.env.DESIGN_TEACHER_PASSWORD || 'Demo@123456',
  },
  student: {
    username: process.env.DESIGN_STUDENT_USERNAME || 'demo_student_01',
    password: process.env.DESIGN_STUDENT_PASSWORD || '123456',
  },
  parent: {
    username: process.env.DESIGN_PARENT_USERNAME || 'demo_parent',
    password: process.env.DESIGN_PARENT_PASSWORD || '123456',
  },
};

/**
 * Thresholds for `--check`. They are intentionally generous: this is the pre-migration
 * baseline, and the point of recording them is to lower them wave by wave, not to turn the
 * first run red and teach the reviewer to ignore it.
 */
const LIMITS = {
  overflowPx: 1,
  h1: 1,
  externalImages: 0,
  distinctRadii: 12,
  distinctFontSizes: 14,
  distinctShadows: 8,
  distinctWeights: 6,
};

function loadEnv() {
  const result = {};
  const file = path.join(ROOT, '.env');
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

async function newTarget(url) {
  const response = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Cannot create a Chrome target: ${response.status}. Is headless Chrome on ${CDP}?`);
  return response.json();
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ws, send };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The login expression for one role.
 *
 * Admin goes through `/api/admin/session` and wraps its payload in `data`; the other three
 * through `/api/auth/login` and answer the payload at the top level. The credentials are
 * interpolated in Node, and only the matching branch is read, so `ACCOUNTS` never needs an
 * `admin` entry.
 */
function loginExpression(role, env) {
  const credentials = role === 'admin'
    ? { username: env.SUPERADMIN_USERNAME || '', password: env.SUPERADMIN_PASSWORD || '' }
    : { ...ACCOUNTS[role], role };
  return `
    (async () => {
      const admin = ${JSON.stringify(role === 'admin')};
      const response = await fetch('/api/' + (admin ? 'admin/session' : 'auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(${JSON.stringify(credentials)}),
      });
      const payload = await response.json();
      const data = admin ? payload.data : payload;
      if (!payload.success || !data || !data.token) return 'ERR:' + (payload.message || response.status);
      const user = data.user;
      localStorage.clear();
      localStorage.setItem('thinkclass-user', JSON.stringify({
        state: { user: { ...user, classFeatures: data.classFeatures || user.classFeatures }, token: data.token },
        version: 0,
      }));
      localStorage.setItem('thinkclass-startup-guide-seen-' + user.id, '1');
      localStorage.setItem('thinkclass-shell', JSON.stringify({
        state: { theme: ${JSON.stringify(DARK ? 'dark' : 'light')} },
        version: 0,
      }));
      return 'ok';
    })()
  `;
}

async function measure(send) {
  const expression = `(() => {
    const visible = [...document.querySelectorAll('body *')].filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const count = (values) => [...new Set(values.filter(Boolean))];
    const radii = count(visible.map((el) => getComputedStyle(el).borderRadius).filter((value) => value !== '0px'));
    const sizes = count(visible.map((el) => getComputedStyle(el).fontSize));
    const shadows = count(visible.map((el) => getComputedStyle(el).boxShadow).filter((value) => value !== 'none'));
    const weights = count(visible.map((el) => getComputedStyle(el).fontWeight));
    const externalImages = [...document.querySelectorAll('img')]
      .map((img) => img.currentSrc || img.src)
      .filter((src) => src && !src.startsWith(location.origin) && !src.startsWith('data:') && !src.startsWith('blob:'));
    return {
      url: location.pathname,
      title: document.title,
      h1: document.querySelectorAll('h1').length,
      overflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      externalImages: [...new Set(externalImages)],
      distinctRadii: radii.length,
      distinctFontSizes: sizes.length,
      distinctShadows: shadows.length,
      distinctWeights: weights.length,
    };
  })()`;
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  return result.result.value;
}

function failuresFor(metric) {
  const failures = [];
  if (metric.overflowPx > LIMITS.overflowPx) failures.push(`horizontal overflow ${metric.overflowPx}px`);
  if (metric.h1 > LIMITS.h1) failures.push(`${metric.h1} h1 elements`);
  if (metric.externalImages.length > LIMITS.externalImages) failures.push(`external images: ${metric.externalImages.join(', ')}`);
  if (metric.distinctRadii > LIMITS.distinctRadii) failures.push(`${metric.distinctRadii} distinct radii`);
  if (metric.distinctFontSizes > LIMITS.distinctFontSizes) failures.push(`${metric.distinctFontSizes} distinct font sizes`);
  if (metric.distinctShadows > LIMITS.distinctShadows) failures.push(`${metric.distinctShadows} distinct shadows`);
  if (metric.distinctWeights > LIMITS.distinctWeights) failures.push(`${metric.distinctWeights} distinct font weights`);
  return failures;
}

async function reviewRole(role, routes, env, report) {
  console.log(`\n[${role}] login`);
  const target = await newTarget('about:blank');
  const { ws, send } = await connect(target);
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: `${BASE}/login` });
    await wait(3500);
    const result = await send('Runtime.evaluate', {
      expression: loginExpression(role, env),
      awaitPromise: true,
      returnByValue: true,
    });
    if (String(result.result.value).startsWith('ERR:')) {
      throw new Error(`${role} login failed: ${String(result.result.value).slice(4)}`);
    }
    console.log(`[${role}] logged in`);

    for (const route of routes) {
      for (const viewport of VIEWPORTS) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: viewport.width < 600,
        });
        await send('Page.navigate', { url: `${BASE}${route.path}` });
        await wait(4500);
        const metrics = await measure(send);
        const screenshot = await send('Page.captureScreenshot', { format: 'png' });
        const file = path.join(OUT, role, `${route.name}-${viewport.name}${DARK ? '-dark' : ''}.png`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
        const page = { ...route, viewport: viewport.name, file: path.relative(ROOT, file), ...metrics };
        page.failures = failuresFor(page);
        report.pages.push(page);
        console.log(`${route.name} ${viewport.name}: ${page.failures.length === 0 ? 'ok' : `WARN ${page.failures.join('; ')}`}`);
      }
    }
  } finally {
    ws.close();
    await fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const env = loadEnv();
  const report = { base: BASE, dark: DARK, startedAt: new Date().toISOString(), pages: [] };

  try {
    await fetch(`${BASE}/login`);
  } catch {
    throw new Error(`Cannot reach ${BASE}. Start the app or the demo instance first.`);
  }

  for (const role of ['admin', 'teacher', 'student', 'parent']) {
    const routes = ROUTES.filter((route) => route.role === role);
    await reviewRole(role, routes, env, report);
  }

  const hardFailures = report.pages.filter((page) =>
    page.failures.some((failure) =>
      failure.startsWith('horizontal overflow') ||
      failure.includes('h1 elements') ||
      failure.startsWith('external images'),
    ),
  );

  fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${report.pages.length} pages reviewed -> ${path.relative(ROOT, OUT)}`);

  if (CHECK && hardFailures.length > 0) {
    console.error(`\n${hardFailures.length} page(s) have hard layout failures.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
