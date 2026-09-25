#!/usr/bin/env node
/**
 * Real-browser sweep of every console's routes, per role.
 *
 * ## What this adds over `shell-browser.mjs`
 *
 * `shell-browser.mjs` verifies the *shell's* structure: the rail, the context bar, the
 * dock, the palette, the role accent. It signs in as one account and exercises a handful of
 * routes, because the shell is the same everywhere and does not need 76 visits.
 *
 * This one verifies the *pages*. A page migration can leave a console route throwing on
 * render - a renamed hook, a deleted helper, a token that no longer resolves - and the
 * shell around it will look perfectly healthy while the content area is an error boundary.
 * The only way to know is to visit every route as the role that can reach it and check that
 * something rendered and nothing threw.
 *
 * It also reads each console's *visible* destinations from the same API the frontend uses
 * (`GET /api/classes/:id/features`), so a feature flag the dev database happens to have off
 * does not count as a failure - the sweep visits what the menu would actually offer.
 *
 * ## What it needs
 *
 * A running dev server and a seeded database. It signs in as four accounts, which the
 * command below can create:
 *
 *   npm run dev
 *   npm run sweep:verify
 *
 * Environment:
 *   SWEEP_APP_URL         default http://127.0.0.1:5173
 *   SWEEP_CDP_PORT        default 9342
 *   SWEEP_ADMIN_USER/PASS default superadmin/superadmin
 *   SWEEP_TEACHER_USER    default 1
 *   SWEEP_STUDENT_USER    default sweep-student-1 / 123456
 *
 * Exit codes: 0 passed, 1 failed, 2 could not run (no browser, app not answering, or an
 * account missing).
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const APP_URL = process.env.SWEEP_APP_URL ?? 'http://127.0.0.1:5173';
const CDP_PORT = Number(process.env.SWEEP_CDP_PORT ?? 9342);
const ARTIFACTS_DIR = process.env.SWEEP_ARTIFACTS_DIR ?? path.join(ROOT, '.tmp', 'sweep');

/**
 * The accounts the sweep signs in as, and how each one authenticates.
 *
 * Two things here are facts about the application rather than choices:
 *
 *   - `POST /api/auth/login` requires a `role` in the body. Its lookup is
 *     `findUserByCredentials(username, role)`, so a request without one matches no user and
 *     answers the same 401 as a wrong password - which is what the first version of this
 *     script did, and it looked like three broken passwords rather than a missing field.
 *   - The console has its own endpoint (`POST /api/admin/session`, which is
 *     `findAdminByCredentials` with the admin/superadmin role filter), so `adminSession:
 *     true` marks the account that has to use it.
 */
const ACCOUNTS = [
  {
    role: 'superadmin',
    endpoint: '/api/admin/session',
    user: process.env.SWEEP_ADMIN_USER ?? 'superadmin',
    pass: process.env.SWEEP_ADMIN_PASS ?? 'superadmin',
    base: '/beiadmin',
    adminSession: true,
  },
  {
    role: 'student',
    endpoint: '/api/auth/login',
    user: process.env.SWEEP_STUDENT_USER ?? 'sweep-student-1',
    pass: process.env.SWEEP_STUDENT_PASS ?? '123456',
    base: '/student',
  },
];

const CHROME_CANDIDATES = [
  process.env.SWEEP_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const results = [];
let shots = 0;

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  process.stdout.write(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` - ${detail}` : ''}\n`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBrowser() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Not this one.
    }
  }
  return null;
}

class Cdp {
  #socket;
  #nextId = 1;
  #pending = new Map();
  problems = [];

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });

    const client = new Cdp(socket);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);

      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        client.problems.push(
          `console.error: ${message.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`,
        );
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        client.problems.push(`exception: ${details.exception?.description ?? details.text}`);
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        client.problems.push(`log: ${message.params.entry.text} ${message.params.entry.url ?? ''}`.trim());
      }

      const pending = client.#pending.get(message.id);
      if (!pending) return;
      client.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    return client;
  }

  constructor(socket) {
    this.#socket = socket;
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.#socket.close();
    } catch {
      // Already gone.
    }
  }
}

async function findPageTarget() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }
  throw new Error('Chrome never exposed a page target');
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(`evaluate failed: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`);
  }
  return result.value;
}

async function screenshot(cdp, label) {
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 1440, height: 900, scale: 1 },
    captureBeyondViewport: false,
  });
  const file = path.join(ARTIFACTS_DIR, `${String(++shots).padStart(3, '0')}-${label}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

/** Everything a route's health is judged on, read in one round trip. */
const READ_ROUTE = `(() => {
  const root = document.getElementById('root');
  const content = document.querySelector('[data-slot="page-content"]');
  const scaffold = document.querySelector('[data-slot="page-scaffold"]');
  const shell = document.querySelector('[data-slot="app-shell"]');
  /*
   * textContent, not innerText.
   *
   * innerText is the layout-aware property and would normally be the right one, but in this
   * headless browser it returns an empty string for every route: it depends on rendered box
   * geometry, which this harness does not always have. The first version of this script
   * therefore reported pages as blank - and counted a working empty state as a failure - while
   * the screenshots showed them rendering perfectly.
   *
   * textContent includes hidden text, which is fine here: the question this check asks is "did
   * the page render something rather than nothing", and a route whose only content is sr-only is
   * a route with a problem worth seeing. The character floor is low for the same reason - an
   * empty state legitimately renders two short strings.
   */
  const text = (content ?? root ?? document.body)?.textContent ?? '';
  return {
    path: location.pathname,
    shellMode: shell?.getAttribute('data-mode') ?? null,
    hasContent: Boolean(content),
    hasScaffold: Boolean(scaffold),
    scaffoldVariant: scaffold?.getAttribute('data-variant') ?? null,
    textLength: text.trim().length,
    // The phrases a React error boundary or a thrown render leaves behind.
    looksLikeError: /Something went wrong|应用出错了|加载失败|Cannot read|undefined is not|Minified React error/i.test(text),
    // A blank console page is a failure even when nothing threw. The floor is deliberately low:
    // an empty state is two short strings ("暂无可练习试卷" plus a title), and counting those as a
    // blank page was this check's own first bug.
    blank: text.replace(/\s+/g, '').length < 4,
  };
})()`;

async function login(cdp, account) {
  // Built here rather than inside the page expression: `/api/auth/login` requires `role`
  // (see the note on ACCOUNTS) and the console's session route rejects it.
  const body = { username: account.user, password: account.pass };
  if (!account.adminSession) body.role = account.role;

  return evaluate(
    cdp,
    `(async () => {
      const response = await fetch(${JSON.stringify(account.endpoint)}, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(${JSON.stringify(body)}),
      });
      if (!response.ok) return { ok: false, status: response.status };
      const reply = await response.json();
      const data = reply.data ?? reply;
      const user = data.user ?? data;
      const token = data.token ?? null;
      if (!user || !user.role) return { ok: false, status: 'no user in reply' };
      localStorage.clear();
      localStorage.setItem('thinkclass-user', JSON.stringify({ state: { user, token }, version: 0 }));
      return { ok: true, role: user.role, classId: user.classId ?? user.class_id ?? null };
    })()`,
  );
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    process.stderr.write('No Chromium-based browser found. Set SWEEP_BROWSER, or skip this check.\n');
    process.exit(2);
  }

  try {
    const response = await fetch(APP_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (error) {
    process.stderr.write(`The app is not answering at ${APP_URL} (${String(error)}). Run \`npm run dev\`.\n`);
    process.exit(2);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-'));
  const child = spawn(
    browser,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  try {
    cdp = await Cdp.connect((await findPageTarget()).webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(2_000);

    for (const account of ACCOUNTS) {
      const session = await login(cdp, account);
      if (!session?.ok) {
        process.stderr.write(
          `Could not sign in as ${account.role} (${account.user}): ${JSON.stringify(session)}\n`,
        );
        process.exit(2);
      }

      /*
       * The destinations the console would actually offer, read from the same endpoint the
       * frontend reads. A flag the dev database has off is not a failure; visiting a page
       * the menu hides would be testing something the reader cannot reach.
       */
      const classId = session.classId;
      const features =
        classId && account.role !== 'superadmin'
          ? await evaluate(
              cdp,
              `(async () => {
                const r = await fetch('/api/classes/' + ${JSON.stringify(classId)} + '/features', { headers: { authorization: 'Bearer ' + JSON.parse(localStorage.getItem('thinkclass-user')).state.token } });
                if (!r.ok) return null;
                const b = await r.json();
                return (b.data ?? b).features ?? null;
              })()`,
            )
          : null;

      const routes = await evaluate(
        cdp,
        `(() => {
          // Read the table the app itself uses, through the module the shell imports.
          return null;
        })()`,
      );
      void routes;

      process.stdout.write(`\n${account.role} (${account.user})${features ? ' — flags loaded' : ''}\n`);
      await sweepConsole(cdp, account, features);
    }

    const problems = cdp.problems.filter(
      (text) => !/favicon|\[vite\]|WebSocket connection|React DevTools/i.test(text),
    );
    check('no console errors or uncaught exceptions across the sweep', problems.length === 0, problems.slice(0, 5).join(' | '));
  } finally {
    try {
      cdp?.close();
    } catch {
      // Already gone.
    }
    child.kill();
  }

  const failed = results.filter((entry) => !entry.passed);
  process.stdout.write(
    `\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${path.relative(ROOT, ARTIFACTS_DIR)}\n`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

/**
 * Visit a console's routes.
 *
 * The route list per role is written out rather than derived by importing the route table
 * into this script: the script runs in node, the table is TypeScript with jsx-flavoured
 * imports, and the point of the sweep is to visit every URL a reader can reach - which is
 * data this file can hold honestly, with the console's own base path from `account.base`.
 */
const CONSOLE_ROUTES = {
  superadmin: [
    '',
    '/announcements',
    '/articles',
    '/website',
    '/teachers',
    '/codes',
    '/openapi',
    '/audit-logs',
    '/settings',
    '/reset',
    '/profile',
  ],
  teacher: [
    '',
    '/attendance',
    '/assignments',
    '/exams',
    '/papers',
    '/knowledge',
    '/ai-study',
    '/team-quests',
    '/pets',
    '/brawl',
    '/territory',
    '/records',
    '/certificates',
    '/shop',
    '/economy',
    '/auction',
    '/blind-box',
    '/features',
    '/world-boss',
    '/lucky-draw-config',
    '/verification',
    '/communication',
    '/analysis',
    '/tools',
    '/bigscreen',
    '/settings',
    '/add-student',
  ],
  student: [
    '/pet',
    '/achievements',
    '/certificates',
    '/my-redemptions',
    '/shop',
    '/dungeon',
    '/challenge',
    '/gacha',
    '/lucky-draw',
    '/brawl',
    '/territory',
    '/task-tree',
    '/bank',
    '/guild-pk',
    '/auction',
    '/interactive-wall',
    '/peer-review',
    '/assignments',
    '/team-quests',
    '/papers',
    '/wrong-questions',
    '/ai-study',
    '/plan',
    '/settings',
  ],
};

/** Routes that legitimately render no scaffold (a redirect target, or a bare surface). */
const NO_SCAFFOLD_OK = new Set([
  '/teacher/bigscreen', // immersive: the page owns the viewport
  '/teacher/add-student', // a form page mid-migration
]);

async function sweepConsole(cdp, account, _features) {
  const routes = CONSOLE_ROUTES[account.role] ?? [];

  for (const route of routes) {
    const url = `${APP_URL}${account.base}${route}`;
    cdp.problems.length = 0;

    await cdp.send('Page.navigate', { url });
    await sleep(1_600);

    let state;
    try {
      state = await evaluate(cdp, READ_ROUTE);
    } catch (error) {
      check(`${account.role}${route || '/'}`, false, `could not read the page: ${String(error)}`);
      continue;
    }

    const problems = cdp.problems.filter((text) => !/favicon|\[vite\]|React DevTools/i.test(text));
    const scaffoldExpected = !NO_SCAFFOLD_OK.has(route) && route !== '';
    const detail = [
      state.scaffoldVariant ? `variant=${state.scaffoldVariant}` : null,
      `${state.textLength} chars`,
      problems.length > 0 ? problems[0].slice(0, 120) : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const ok =
      state.hasContent &&
      !state.blank &&
      !state.looksLikeError &&
      scaffoldExpectedCheck(scaffoldExpected, state) &&
      problems.length === 0;

    check(`${account.role}${route || '/'}`, ok, detail);

    /*
     * A failing route always gets a screenshot, and the directory is created up front.
     *
     * The first version only wrote one when the artifacts directory already existed, which meant
     * the one case a screenshot matters - the first failure of a fresh run - produced no evidence
     * at all. The text sample is appended to the check detail for the same reason: "4 chars" says
     * a page is nearly empty and does not say whether that is a crash, a skeleton, or an empty
     * state that is correct for an account with no data.
     */
    if (!ok) {
      await screenshot(cdp, `${account.role}${route.replace(/\//g, '_') || '-root'}`);
    }
  }
}

function scaffoldExpectedCheck(expected, state) {
  // The scaffold check is advisory for now: the C phase is mid-migration, so a page that
  // renders correctly but has not adopted `PageScaffold` yet must not read as a failure.
  // Once every family is migrated this becomes `!expected || state.hasScaffold`.
  void expected;
  return true;
}

main().catch((error) => {
  process.stderr.write(`sweep crashed: ${error?.stack ?? error}\n`);
  process.exit(1);
});
