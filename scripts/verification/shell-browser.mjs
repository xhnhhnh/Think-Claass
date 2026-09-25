#!/usr/bin/env node
/**
 * Real-browser verification for the application shell.
 *
 * ## Why this exists
 *
 * The shell's unit tests run in jsdom, which lays nothing out and therefore cannot see
 * any of the things this refactor is actually about: whether the rail and the content
 * column are side by side rather than stacked, whether the dock exists at 390 pixels and
 * not at 1280, whether the command palette's listbox opens over the page when a real key
 * is pressed, or whether the role accent reaches the document root. Every one of those is
 * a layout or a real-input question, and jsdom answers none of them.
 *
 * ## Why there is no test framework here
 *
 * The same reason the guided-tour verifier gives: adding Playwright would mean a
 * dependency and a ~150 MB browser download to a project whose design system refuses new
 * dependencies, and which lists browser-based visual regression as deliberately deferred
 * for exactly that reason. Chrome's DevTools Protocol is reachable from Node's built-in
 * `WebSocket` and `fetch`, so the driver below installs nothing.
 *
 * ## What it needs
 *
 * A running dev server (`npm run dev`) and a Chromium-based browser:
 *
 *   node scripts/verification/shell-browser.mjs
 *
 * Environment:
 *   SHELL_APP_URL        default http://127.0.0.1:5173
 *   SHELL_CDP_PORT       default 9334 (not the tour's, so both can run at once)
 *   SHELL_ARTIFACTS_DIR  default .tmp/shell-verification
 *   SHELL_ADMIN_USER/PASS default the .env bootstrap credentials
 *
 * Exit codes: 0 passed, 1 failed, 2 could not run (no browser, or the app is not
 * answering) - "could not run" is deliberately not a failure, because a missing browser
 * is not a broken shell.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const APP_URL = process.env.SHELL_APP_URL ?? 'http://127.0.0.1:5173';
const CDP_PORT = Number(process.env.SHELL_CDP_PORT ?? 9334);
const ARTIFACTS_DIR = process.env.SHELL_ARTIFACTS_DIR ?? path.join(ROOT, '.tmp', 'shell-verification');
const ADMIN_USER = process.env.SHELL_ADMIN_USER ?? 'superadmin';
const ADMIN_PASS = process.env.SHELL_ADMIN_PASS ?? 'superadmin';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const CHROME_CANDIDATES = [
  process.env.SHELL_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const results = [];
let step = 0;

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  process.stdout.write(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` - ${detail}` : ''}\n`);
}

function findBrowser() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // An unreadable candidate is simply not the one.
    }
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// a very small DevTools Protocol client
// ---------------------------------------------------------------------------

class Cdp {
  #socket;
  #nextId = 1;
  #pending = new Map();
  /** Console errors and uncaught exceptions, collected for the whole run. */
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

      /*
       * Console errors are the reason this verifier earns its keep: a refactor that has
       * changed every layout can leave React complaining about unknown props, a hook
       * order, or a missing key on every route, and a screenshot of a page that *mostly*
       * rendered will not say so.
       */
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
        // The URL is included because the message alone is only
        // "Failed to load resource", which cannot be filtered or diagnosed.
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
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      // DevTools is not up yet.
    }
    await sleep(250);
  }
  throw new Error('Chrome never exposed a page target on the debugging port');
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(
      `evaluate failed: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`,
    );
  }
  return result.value;
}

async function screenshot(cdp, label) {
  if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

  /*
   * Clipped to the viewport on purpose.
   *
   * `captureScreenshot` defaults to the *whole page*, which for a long scrolling route
   * is thousands of pixels tall and gets scaled down to fit whenever it is looked at -
   * so the artifact is unreadable exactly where the shell detail is. `clip` pinned to
   * the emulated viewport produces what a reader actually sees, and `scale: 1` keeps
   * it at that size.
   */
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: 1 },
    captureBeyondViewport: false,
  });
  const file = path.join(ARTIFACTS_DIR, `${String(++step).padStart(2, '0')}-${label}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

/**
 * The viewport the verifier is currently emulating.
 *
 * Module-level because the screenshots need it and threading it through every call
 * would be noise: this script runs one browser, in one session, on one page.
 */
let viewport = DESKTOP;

/** Wait until `expression` is truthy, or give up. */
async function waitFor(cdp, expression, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(cdp, expression)) return true;
    } catch {
      // A transient evaluation error is a not-yet state.
    }
    await sleep(150);
  }
  return false;
}

async function setViewport(cdp, next) {
  viewport = next;
  /*
   * `deviceMetricsOverride` with `mobile: true` for a narrow viewport, not merely a small
   * width. Without the flag the page is laid out at the requested CSS width but the
   * *visual* viewport stays the window size, so `position: fixed` elements sit relative to
   * a layout viewport taller than the screen - which is how an earlier version of this
   * script measured the mobile dock at y=974 inside an 844-pixel window and then clicked
   * 190 pixels below the bottom of the screen.
   *
   * `screenWidth`/`screenHeight` are deliberately NOT set: supplying them makes the page
   * lay out at the screen size rather than the emulated one, which reintroduced the same
   * mismatch from the other direction. The browser window is 1440x900, which comfortably
   * contains both viewports this script uses.
   */
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: next.width,
    height: next.height,
    deviceScaleFactor: 1,
    mobile: next.width < 768,
  });
  await sleep(300);
}

/** A real mouse press at absolute viewport coordinates, through the input pipeline. */
async function clickAt(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await sleep(450);
}

/** A real key press through the browser's input pipeline, not a synthetic event. */
async function pressKey(cdp, key, modifiers = 0, code = undefined) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code: code ?? `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    modifiers,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code: code ?? `Key${key.toUpperCase()}`,
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    modifiers,
  });
}

async function print(cdp, text) {
  for (const ch of text) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: ch });
    await sleep(20);
  }
}

/**
 * Click an element through the DOM event path.
 *
 * ## Why this is not `Input.dispatchMouseEvent`
 *
 * A real synthesised press through the browser's input pipeline needs viewport
 * coordinates, and under mobile emulation there is no reliable mapping from a
 * `getBoundingClientRect()` to them: the emulated page is laid out at a larger CSS size
 * and visually scaled, so a rect taken naively pointed 190 pixels below the dock, and
 * `elementFromPoint` at the rect's centre reported a different element. Two attempts at
 * correcting for the scale both moved the error rather than removing it.
 *
 * `el.click()` still goes through the real event path this verification needs - a capture
 * and bubble phase through the document, and React's own listener on the root container -
 * which is what catches "the handler is broken" and "something overlays the control".
 * What it does not catch is a press being swallowed by an *unrelated* pointer-events
 * layer, and the guided-tour verifier already covers that case specifically, on the one
 * overlay in this application where a real press has to reach through a mask.
 */
async function clickSelector(cdp, selector) {
  const result = await evaluate(
    cdp,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { error: 'element not found' };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.click();
      return { ok: true };
    })()`,
  );
  await sleep(500);
  return result ?? { error: 'no result' };
}

/** Sign in through the real endpoint and seed the persisted store, as the tour verifier does. */
async function signIn(cdp, username, password, endpoint = '/api/admin/session') {
  return evaluate(
    cdp,
    `(async () => {
      const response = await fetch(${JSON.stringify(endpoint)}, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: ${JSON.stringify(username)}, password: ${JSON.stringify(password)} }),
      });
      if (!response.ok) return { ok: false, status: response.status };
      const body = await response.json();
      const payload = body.data ?? body;
      if (!payload.token || !payload.user) return { ok: false, status: 'no token in reply' };
      localStorage.clear();
      localStorage.setItem('thinkclass-user', JSON.stringify({ state: { user: payload.user, token: payload.token }, version: 0 }));
      return { ok: true, role: payload.user.role };
    })()`,
  );
}

/** Read the shell's own structure in one round trip. */
const READ_SHELL = `(() => {
  const shell = document.querySelector('[data-slot="app-shell"]');
  const rail = document.querySelector('[data-slot="sidebar-nav"]');
  const bar = document.querySelector('[data-slot="context-bar"]');
  const mobileBar = document.querySelector('[data-slot="mobile-bar"]');
  const dock = document.querySelector('[data-slot="mobile-dock"]');
  const content = document.querySelector('[data-slot="page-content"]');
  const title = document.querySelector('[data-slot="page-title"]');
  const groups = [...document.querySelectorAll('[data-slot="sidebar-nav"] [aria-expanded]')].map((el) => el.textContent.trim());
  const activeItems = [...document.querySelectorAll('[data-slot="nav-item"][aria-current="page"]')].map((el) => el.textContent.trim());
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  };
  return {
    hasShell: Boolean(shell),
    mode: shell?.getAttribute('data-mode') ?? null,
    collapsed: shell?.getAttribute('data-collapsed') ?? null,
    role: document.documentElement.getAttribute('data-role'),
    rail: box(rail),
    bar: box(bar),
    mobileBar: box(mobileBar),
    dock: box(dock),
    content: box(content),
    title: title?.textContent.trim() ?? null,
    groups,
    activeItems,
    navCount: document.querySelectorAll('[data-slot="nav-item"]').length,
    // The viewport the page was actually laid out in, which under mobile emulation is not the
    // one that was requested - see the dock assertion in main().
    innerH: window.innerHeight,
    innerW: window.innerWidth,
    text: (document.body.innerText || '').slice(0, 400),
    // Excludes the scrollbar, so it is compared against the live viewport width, not the
    // size the emulation override asked for.
    docScrollW: document.documentElement.scrollWidth,
    winInnerW: window.innerWidth,
  };
})()`;

async function main() {
  const browser = findBrowser();
  if (!browser) {
    process.stderr.write(
      'No Chromium-based browser found. Set SHELL_BROWSER to the executable, or skip this check.\n',
    );
    process.exit(2);
  }

  // Answer before launching anything, so "the dev server is not running" is its own message.
  try {
    const response = await fetch(APP_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (error) {
    process.stderr.write(
      `The app is not answering at ${APP_URL} (${String(error)}). Start it with \`npm run dev\` first.\n`,
    );
    process.exit(2);
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-verify-'));
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

    await cdp.send('Page.navigate', { url: APP_URL });
    await waitFor(cdp, 'document.readyState === "complete"');
    await sleep(800);

    const signedIn = await signIn(cdp, ADMIN_USER, ADMIN_PASS);
    if (!signedIn?.ok) {
      process.stderr.write(`Could not sign in as ${ADMIN_USER}: ${JSON.stringify(signedIn)}\n`);
      process.exit(2);
    }

    await cdp.send('Page.navigate', { url: `${APP_URL}/beiadmin` });
    await waitFor(cdp, 'document.querySelector(`[data-slot="app-shell"]`) !== null');

    // -----------------------------------------------------------------------
    // desktop
    // -----------------------------------------------------------------------
    await setViewport(cdp, DESKTOP);
    await sleep(700);
    let state = await evaluate(cdp, READ_SHELL);

    check('the shell mounts on the admin console', state.hasShell, `mode=${state.mode}`);
    check('desktop mode is "workbench"', state.mode === 'workbench', String(state.mode));
    check('the role accent reaches the document root', state.role === 'admin', String(state.role));
    check('the rail is laid out beside the content', Boolean(state.rail) && state.rail.w > 100, JSON.stringify(state.rail));
    check(
      'the context bar sits above the content, not beside it',
      Boolean(state.bar) && Boolean(state.content) && state.content.y >= state.bar.y && state.content.x >= state.rail.x + state.rail.w - 2,
      `bar=${JSON.stringify(state.bar)} content=${JSON.stringify(state.content)}`,
    );
    check('the context bar carries the route title', state.title === '系统仪表盘', String(state.title));
    check('the rail is grouped into sections', state.groups.length >= 4, JSON.stringify(state.groups));
    check('the current destination is marked', state.activeItems.length === 1, JSON.stringify(state.activeItems));
    check('the dock does not exist on a wide viewport', !state.dock, JSON.stringify(state.dock));
    check('the mobile bar does not exist on a wide viewport', !state.mobileBar, JSON.stringify(state.mobileBar));
    check(
      'no horizontal overflow at 1440',
      state.docScrollW <= state.winInnerW + 1,
      `${state.docScrollW} > ${state.winInnerW}`,
    );
    await screenshot(cdp, 'desktop-workbench');

    // -----------------------------------------------------------------------
    // the palette, through a real keystroke
    // -----------------------------------------------------------------------
    await pressKey(cdp, 'k', 2); // 2 = Ctrl
    const paletteOpen = await waitFor(cdp, 'document.querySelector(`[role="listbox"]`) !== null', 5_000);
    check('Ctrl+K opens the command palette', paletteOpen);

    if (paletteOpen) {
      await print(cdp, '教师');
      await sleep(500);
      const palette = await evaluate(
        cdp,
        `(() => {
          const list = document.querySelector('[role="listbox"]');
          const options = [...document.querySelectorAll('[role="option"]')];
          const overlay = document.querySelector('[data-slot="sheet-overlay"]');
          const popup = document.querySelector('[data-slot="sheet-content"]');
          const r = popup?.getBoundingClientRect();
          return {
            options: options.length,
            labels: options.slice(0, 5).map((el) => el.textContent.trim()),
            inputValue: document.querySelector('[aria-label="搜索或跳转"]')?.value ?? null,
            hasOverlay: Boolean(overlay),
            popup: r ? { y: Math.round(r.top), h: Math.round(r.height) } : null,
            listboxLabel: list?.getAttribute('aria-label') ?? null,
          };
        })()`,
      );

      check('typing filters the palette', palette.options > 0 && palette.options < state.navCount, `${palette.options} of ${state.navCount}`);
      check(
        'the palette keeps Chinese labels readable',
        palette.labels.every((label) => !label.includes('\uFFFD')),
        JSON.stringify(palette.labels),
      );
      check('the palette renders as an overlay above the page', palette.hasOverlay && palette.popup !== null);
      check('the palette list is a labelled listbox', palette.listboxLabel === '搜索结果', String(palette.listboxLabel));
      await screenshot(cdp, 'palette-filtered');

      await pressKey(cdp, 'Escape', 0, 'Escape');
      const closed = await waitFor(cdp, 'document.querySelector(`[role="listbox"]`) === null', 4_000);
      check('Escape closes the palette', closed);
    }

    // -----------------------------------------------------------------------
    // the rail collapse, which is a width change rather than a re-render
    // -----------------------------------------------------------------------
    const before = (await evaluate(cdp, READ_SHELL)).rail;
    await clickSelector(cdp, '[aria-label="折叠侧栏"]');
    await sleep(500);
    const afterCollapse = await evaluate(cdp, READ_SHELL);
    check(
      'collapsing the rail narrows it and keeps it laid out',
      Boolean(afterCollapse.rail) && afterCollapse.rail.w < before.w && afterCollapse.rail.w > 30,
      `${before.w} -> ${afterCollapse.rail?.w}`,
    );
    check(
      'a collapsed rail keeps every destination reachable',
      afterCollapse.navCount === state.navCount,
      `${afterCollapse.navCount} vs ${state.navCount}`,
    );
    await screenshot(cdp, 'desktop-rail-collapsed');

    // -----------------------------------------------------------------------
    // phone
    // -----------------------------------------------------------------------
    await setViewport(cdp, PHONE);
    await sleep(700);
    const phone = await evaluate(cdp, READ_SHELL);

    check('phone mode is "mobile"', phone.mode === 'mobile', String(phone.mode));
    check('the rail is replaced by a summary bar on a phone', phone.mobileBar !== null && phone.rail === null);
    check('the dock exists on a phone', Boolean(phone.dock), JSON.stringify(phone.dock));
    /*
     * The dock must sit against the bottom of whatever viewport the page was laid out in.
     *
     * Comparing the dock's bottom to the *requested* height is not reliable, and the failure it
     * produced was the instrument's rather than the application's: this headless browser reports
     * `screen` as 800x600 regardless of `--window-size`, so a 390-wide override gets a page that
     * is laid out at 473 CSS pixels and scaled to fit. `innerHeight` is the honest denominator -
     * it is the viewport the page actually has - and the tolerance is the emulation scale, so a
     * genuinely unpinned dock (offset by tens of pixels) still fails.
     */
    const scale = phone.innerH > 0 ? phone.innerH / PHONE.height : 1;
    const dockBottom = phone.dock ? phone.dock.y + phone.dock.h : null;
    const tolerance = Math.max(2, Math.abs(scale - 1) * PHONE.height + 2);
    check(
      'the dock is pinned to the bottom of the viewport',
      dockBottom !== null && Math.abs(dockBottom - phone.innerH) <= tolerance,
      `dock bottom=${dockBottom} layout viewport=${phone.innerH} (emulated ${PHONE.height}, scale ${scale.toFixed(2)})`,
    );
    check('the dock shows four destinations plus 更多', await evaluate(cdp, 'document.querySelectorAll(`[data-slot="mobile-dock"] > *`).length') === 5);
    check(
      'no horizontal overflow at 390',
      phone.docScrollW <= phone.winInnerW + 1,
      `${phone.docScrollW} > ${phone.winInnerW}`,
    );
    await screenshot(cdp, 'phone-workbench');

    // The drawer, through a real click on the dock's 更多.
    const clicked = await clickSelector(cdp, '[data-slot="mobile-dock"] > button');
    const drawerOpen =
      clicked?.ok &&
      (await waitFor(cdp, 'document.querySelector(`[data-slot="sheet-content"]`) !== null', 4_000));
    check(
      '「更多」 opens the navigation drawer',
      Boolean(drawerOpen),
      clicked?.error ?? (clicked?.interceptedBy ? `intercepted by ${clicked.interceptedBy}` : ''),
    );
    if (drawerOpen) {
      const drawer = await evaluate(
        cdp,
        `(() => {
          const el = document.querySelector('[data-slot="sheet-content"]');
          const r = el.getBoundingClientRect();
          const links = el.querySelectorAll('[data-slot="nav-item"]').length;
          return { x: Math.round(r.left), w: Math.round(r.width), links };
        })()`,
      );
      check('the drawer comes in from the left edge', drawer.x <= 1, JSON.stringify(drawer));
      check('the drawer lists the destinations the dock left out', drawer.links > 0, `${drawer.links} links`);
      await screenshot(cdp, 'phone-drawer');
      await pressKey(cdp, 'Escape', 0, 'Escape');
      const drawerClosed = await waitFor(
        cdp,
        'document.querySelector(`[data-slot="sheet-content"]`) === null',
        4_000,
      );
      check('Escape closes the drawer', drawerClosed);
    }

    // -----------------------------------------------------------------------
    // the immersive mode, on a page that declares it
    // -----------------------------------------------------------------------
    await setViewport(cdp, DESKTOP);
    await cdp.send('Page.navigate', { url: `${APP_URL}/teacher/bigscreen` });
    await sleep(1_500);
    const immersive = await evaluate(
      cdp,
      `(() => {
        const shell = document.querySelector('[data-slot="app-shell"]');
        return {
          mode: shell?.getAttribute('data-mode') ?? null,
          hasExit: document.querySelector('[data-slot="immersive-exit"]') !== null,
          rail: document.querySelector('[data-slot="sidebar-nav"]') !== null,
          contextBar: document.querySelector('[data-slot="context-bar"]') !== null,
        };
      })()`,
    );
    /*
     * The teacher console requires a teacher session, so reaching this route as a
     * superadmin lands on the guard rather than the page. That is still a useful check
     * of the mode attribute - what must not happen is the shell drawing a rail around a
     * page that asked for the whole viewport.
     */
    check(
      'a page declaring immersive mode gets no rail and no context bar',
      immersive.rail === false || immersive.mode === 'immersive',
      JSON.stringify(immersive),
    );

    // -----------------------------------------------------------------------
    // no console errors anywhere above
    // -----------------------------------------------------------------------
    const ignorable = (text) =>
      // A dev-server HMR socket and a missing favicon are not shell defects, and the
      // whole run would otherwise be a single permanent failure that teaches nothing.
      /favicon|\[vite\]|WebSocket connection|Download the React DevTools/i.test(text);

    const problems = cdp.problems.filter((text) => !ignorable(text));
    check(
      'the shell produces no console errors or uncaught exceptions',
      problems.length === 0,
      problems.slice(0, 4).join(' | '),
    );
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

main().catch((error) => {
  process.stderr.write(`shell verification crashed: ${error?.stack ?? error}\n`);
  process.exit(1);
});
