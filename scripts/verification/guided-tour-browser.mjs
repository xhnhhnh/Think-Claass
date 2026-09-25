#!/usr/bin/env node
/**
 * Real-browser verification for the guided tour.
 *
 * ## Why this exists
 *
 * The tour's unit tests run in jsdom, which does not lay anything out: every element reports a 0x0
 * box. So those tests can prove the *logic* - a step advances when its action is performed, the
 * fallback copy appears, the seen flag is written - and cannot prove a single *pixel*. Whether the
 * spotlight lands on the element it names, whether the pointer sits inside it, whether the tooltip
 * covers the very button it is telling you to press, and above all whether a real click reaches the
 * control *through* the mask are all questions only a real renderer can answer.
 *
 * The decisive one is the last: the whole design depends on the overlay being `pointer-events-none`
 * so the reader's press lands on the application. A synthetic `element.click()` would pass even if
 * the mask were swallowing every mouse event, so this dispatches a real mouse press at the element's
 * coordinates through the browser's own input pipeline - the same path a reader's hand takes.
 *
 * ## Why there is no test framework here
 *
 * Adding Playwright would mean adding a dependency and a ~150 MB browser download to a project whose
 * design system explicitly refuses new dependencies (`docs/design-system.md` §2) and lists
 * browser-based visual regression as deferred for exactly that reason. Chrome's DevTools Protocol is
 * reachable from Node's built-in `WebSocket` and its built-in `fetch`, so the entire driver below is
 * about a hundred lines and installs nothing.
 *
 * ## What it needs
 *
 * A running dev server (`npm run dev`) and a Chromium-based browser. Run:
 *
 *   node scripts/verification/guided-tour-browser.mjs
 *
 * Environment:
 *   TOUR_APP_URL         default http://127.0.0.1:5173
 *   TOUR_CDP_PORT        default 9333
 *   TOUR_ARTIFACTS_DIR   default .tmp/tour-verification
 *   TOUR_ADMIN_USER/PASS default the .env bootstrap credentials
 *
 * Exit codes: 0 passed, 1 failed, 2 could not run (no browser, or the app is not answering) - a
 * "could not run" is deliberately not a failure, because a missing browser is not a broken tour.
 *
 * ## Scope
 *
 * It verifies the console's tour, which needs no class, no students and no data of any kind beyond
 * the superadmin that every instance has. The teacher tour - the one with the typing steps on the
 * setup wizard - is covered by the unit tests; verifying it here would mean creating an account,
 * and a verification script that writes to the database it is checking is a bad instrument.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const APP_URL = process.env.TOUR_APP_URL ?? 'http://127.0.0.1:5173';
const CDP_PORT = Number(process.env.TOUR_CDP_PORT ?? 9333);
const ARTIFACTS_DIR = process.env.TOUR_ARTIFACTS_DIR ?? path.join(ROOT, '.tmp', 'tour-verification');
const ADMIN_USER = process.env.TOUR_ADMIN_USER ?? 'superadmin';
const ADMIN_PASS = process.env.TOUR_ADMIN_PASS ?? 'superadmin';

/**
 * Ask the browser to report `prefers-reduced-motion: reduce`, the way an OS setting would.
 *
 * Worth a pass of its own, because this is the mode where a tour quietly stops being a tour: the
 * first implementation removed *every* animation under it, leaving a static box and a pointer that
 * demonstrated nothing. The check below is mode-aware - it only requires that the pointer *is*
 * animating something, not that it moves.
 */
const EMULATE_REDUCED = process.argv.includes('--reduce');

/** Generous, because a cold Vite transform of the first route can take a few seconds. */
const TOOLTIP_TIMEOUT_MS = 20_000;
/** The spotlight animates between steps; this is how long to wait for it to settle. */
const SETTLE_TIMEOUT_MS = 4_000;
/** The spotlight pads the target by this much - `PADDING` in TourSpotlight.tsx. */
const SPOTLIGHT_PADDING = 8;
const EDGE_TOLERANCE = 1.5;

const CHROME_CANDIDATES = [
  process.env.TOUR_BROWSER,
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
  const mark = passed ? 'PASS' : 'FAIL';
  process.stdout.write(`  [${mark}] ${name}${detail ? ` - ${detail}` : ''}\n`);
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

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });

    const client = new Cdp(socket);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
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

// ---------------------------------------------------------------------------
// page helpers
// ---------------------------------------------------------------------------

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
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(ARTIFACTS_DIR, `${String(++step).padStart(2, '0')}-${label}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

/**
 * Everything one assertion needs, read in a single round trip.
 *
 * The rects are what the browser actually painted, and `pointerEvents`/`boxShadow` are the two
 * computed properties the design depends on: the first is why the reader's click gets through, the
 * second is the dimming itself.
 */
function readState(anchor) {
  return `(() => {
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top, left: b.left, width: b.width, height: b.height, right: b.right, bottom: b.bottom };
    };
    const spotlight = document.querySelector('[data-slot="tour-spotlight"]');
    const tooltip = document.querySelector('[data-slot="tour-tooltip"]');
    const cursor = document.querySelector('[data-slot="tour-cursor"]');
    const title = document.querySelector('#guided-tour-title');
    const target = ${anchor ? `document.querySelector('[data-tour="${anchor}"]')` : 'null'};
    const text = tooltip ? tooltip.textContent : '';
    const counter = text.match(/第\\s*\\d+\\s*\\/\\s*\\d+\\s*步/);
    return {
      path: location.pathname,
      hasTooltip: Boolean(tooltip),
      title: title ? title.textContent : null,
      counter: counter ? counter[0] : null,
      body: text,
      target: rect(target),
      spotlight: rect(spotlight),
      tooltip: rect(tooltip),
      cursor: rect(cursor),
      spotlightBoxShadow: spotlight ? getComputedStyle(spotlight).boxShadow : null,
      spotlightPointerEvents: spotlight ? getComputedStyle(spotlight).pointerEvents : null,
      seenKeys: Object.keys(localStorage).filter((k) => k.startsWith('thinkclass-startup-guide-seen')),
    };
  })()`;
}

async function waitForTooltip(cdp, anchor) {
  const deadline = Date.now() + TOOLTIP_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(cdp, readState(anchor));
    if (last.hasTooltip) return last;
    await sleep(200);
  }
  return last;
}

/**
 * Wait until the spotlight has finished sliding to where it belongs.
 *
 * Both the target and the spotlight are sampled together, so "settled" means the animation reached
 * the right place rather than merely that two consecutive samples agreed.
 */
async function waitForSpotlightOnTarget(cdp, anchor) {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(cdp, readState(anchor));
    if (last.spotlight && last.target && edgesMatch(last.spotlight, last.target, SPOTLIGHT_PADDING)) {
      return last;
    }
    await sleep(120);
  }
  return last;
}

function edgesMatch(spotlight, target, padding) {
  return (
    Math.abs(spotlight.left - (target.left - padding)) <= EDGE_TOLERANCE &&
    Math.abs(spotlight.top - (target.top - padding)) <= EDGE_TOLERANCE &&
    Math.abs(spotlight.width - (target.width + padding * 2)) <= EDGE_TOLERANCE * 2 &&
    Math.abs(spotlight.height - (target.height + padding * 2)) <= EDGE_TOLERANCE * 2
  );
}

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function inside(inner, outer) {
  if (!inner || !outer) return false;
  const centreX = inner.left + inner.width / 2;
  const centreY = inner.top + inner.height / 2;
  return (
    centreX >= outer.left &&
    centreX <= outer.right &&
    centreY >= outer.top &&
    centreY <= outer.bottom
  );
}

/** A real mouse press, through the browser's input pipeline rather than through the DOM API. */
async function clickAt(cdp, x, y) {
  const common = { x, y, button: 'left', clickCount: 1, buttons: 1 };
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common, buttons: 0 });
}

async function pressEscape(cdp) {
  const key = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
}

/**
 * Count how many distinct values the pointer's gesture layer takes over about a second.
 *
 * Two channels, because the two motion modes use different ones: normally the gesture is a movement
 * and the transform changes, and under reduced motion it is an opacity pulse and the transform must
 * *not* change. One distinct value on both means the pointer is doing nothing at all, which is the
 * defect this guards.
 */
async function sampleGesture(cdp, samples = 12, gapMs = 120) {
  const read = `(() => {
    const inner = document.querySelector('[data-slot="tour-cursor"]')?.firstElementChild;
    if (!inner) return null;
    const style = getComputedStyle(inner);
    return { transform: style.transform, opacity: style.opacity };
  })()`;

  const transforms = new Set();
  const opacities = new Set();
  for (let i = 0; i < samples; i += 1) {
    const value = await evaluate(cdp, read);
    if (value) {
      transforms.add(value.transform);
      opacities.add(value.opacity);
    }
    await sleep(gapMs);
  }
  return { transforms: transforms.size, opacities: opacities.size };
}

// ---------------------------------------------------------------------------
// the session
// ---------------------------------------------------------------------------

async function signInThroughTheApi(cdp, username, password) {
  /*
   * A real login against the real endpoint, then the persisted store is seeded with the token that
   * came back. Driving the login *form* would mean fighting React's controlled inputs for no extra
   * coverage: this script is about the tour, and a session is a prerequisite, not the subject.
   */
  return evaluate(
    cdp,
    `(async () => {
      const response = await fetch('/api/admin/session', {
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
      return { ok: true, role: payload.user.role, id: payload.user.id };
    })()`,
  );
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    process.stderr.write(
      'No Chromium-based browser found. Set TOUR_BROWSER to the executable, or skip this check.\n',
    );
    process.exit(2);
  }

  // Answer before launching anything, so "the dev server is not running" is its own message.
  try {
    const response = await fetch(APP_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (error) {
    process.stderr.write(
      `The app is not answering at ${APP_URL} (${error.message}).\nStart it first: npm run dev\n`,
    );
    process.exit(2);
  }

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-verify-'));

  process.stdout.write(`\nGuided tour, real browser\n`);
  process.stdout.write(`  browser     ${browser}\n`);
  process.stdout.write(`  app         ${APP_URL}\n`);
  process.stdout.write(`  artifacts   ${ARTIFACTS_DIR}\n\n`);

  const child = spawn(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--remote-allow-origins=*',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--window-size=1280,800',
      'about:blank',
    ],
    { stdio: 'ignore', detached: false },
  );

  let cdp = null;
  try {
    const target = await findPageTarget();
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    if (EMULATE_REDUCED) {
      await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
    }

    // Land on the app's own origin so the API call below is same-origin and can read its reply.
    await cdp.send('Page.navigate', { url: `${APP_URL}/login` });
    await sleep(1500);

    const session = await signInThroughTheApi(cdp, ADMIN_USER, ADMIN_PASS);
    if (!session?.ok) {
      check('sign in with the bootstrap credentials', false, JSON.stringify(session));
      throw new Error('could not establish a session; the rest of the run would be meaningless');
    }
    check('sign in with the bootstrap credentials', true, `role ${session.role}, id ${session.id}`);

    // A fresh account, so the tour opens by itself rather than through the replay control.
    await evaluate(cdp, 'localStorage.removeItem("thinkclass-startup-guide-seen-" + ' + JSON.stringify(session.id) + '), true');

    await cdp.send('Page.navigate', { url: `${APP_URL}/beiadmin` });
    await sleep(1500);

    // --- step 1: the shell step, anchored to the sidebar ---------------------
    const first = await waitForTooltip(cdp, 'sidebar-nav');
    check('the tour opens on its own for an account that has not seen it', Boolean(first?.hasTooltip),
      first?.hasTooltip ? `"${first.title}" ${first.counter}` : 'no tooltip appeared');

    const settled = await waitForSpotlightOnTarget(cdp, 'sidebar-nav');
    check(
      'the spotlight lands exactly on the element the step names',
      Boolean(settled?.spotlight && settled?.target && edgesMatch(settled.spotlight, settled.target, SPOTLIGHT_PADDING)),
      settled?.spotlight && settled?.target
        ? `target ${fmt(settled.target)} vs spotlight ${fmt(settled.spotlight)}`
        : 'no spotlight',
    );

    check(
      'the mask dims everything outside the spotlight',
      Boolean(settled?.spotlightBoxShadow?.includes('9999px')),
      String(settled?.spotlightBoxShadow).slice(0, 60),
    );

    check(
      'the overlay cannot swallow the reader’s click',
      settled?.spotlightPointerEvents === 'none',
      `pointer-events: ${settled?.spotlightPointerEvents}`,
    );

    check('the pointer animation sits inside the spotlight', inside(settled?.cursor, settled?.spotlight),
      settled?.cursor ? `cursor ${fmt(settled.cursor)}` : 'no pointer');

    check('the tooltip does not cover the element it is talking about',
      !overlaps(settled?.tooltip, settled?.target),
      settled?.tooltip ? `tooltip ${fmt(settled.tooltip)}` : 'no tooltip');

    const shot1 = await screenshot(cdp, 'step-1-sidebar');
    process.stdout.write(`         screenshot: ${path.basename(shot1)}\n`);

    // --- the pointer is actually demonstrating something ---------------------
    const gesture = await sampleGesture(cdp);
    check(
      EMULATE_REDUCED
        ? 'the pointer still demonstrates the step, by fading rather than moving'
        : 'the pointer demonstrates the step by moving',
      EMULATE_REDUCED ? gesture.opacities > 1 : gesture.transforms > 1,
      `transform ${gesture.transforms} distinct, opacity ${gesture.opacities} distinct`,
    );

    if (EMULATE_REDUCED) {
      // The whole point of the mode: it must not move. A transform that changes here means the
      // reduced-motion branch stopped being taken.
      check('and it does not move while doing so', gesture.transforms === 1,
        `${gesture.transforms} distinct transform value(s)`);
    }

    // --- move to the click step ---------------------------------------------
    await evaluate(
      cdp,
      `(() => {
        const buttons = [...document.querySelectorAll('[data-slot="tour-tooltip"] button')];
        const next = buttons.find((b) => /下一步/.test(b.textContent));
        if (!next) return false;
        next.click();
        return true;
      })()`,
    );
    await sleep(900);

    const second = await waitForSpotlightOnTarget(cdp, 'nav:/beiadmin/teachers');
    check('the spotlight follows the step to the next element',
      Boolean(second?.spotlight && second?.target && edgesMatch(second.spotlight, second.target, SPOTLIGHT_PADDING)),
      second?.target ? `${second.counter} on ${fmt(second.target)}` : 'no target found');

    await screenshot(cdp, 'step-2-nav-entry');

    // --- the decisive check: a real press, through the mask ------------------
    const anchorRect = await evaluate(
      cdp,
      `(() => {
        const el = document.querySelector('[data-tour="nav:/beiadmin/teachers"]');
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      })()`,
    );

    if (!anchorRect) {
      check('a real mouse press on the highlighted control is what advances the step', false, 'target not found');
    } else {
      const pathBefore = await evaluate(cdp, 'location.pathname');
      await clickAt(cdp, anchorRect.x, anchorRect.y);
      await sleep(1200);

      const after = await evaluate(cdp, readState('sidebar-nav'));
      const advanced = after.counter !== second?.counter;
      const navigated = after.path !== pathBefore;

      check(
        'a real mouse press on the highlighted control is what advances the step',
        advanced,
        advanced ? `${second?.counter} -> ${after.counter}` : 'the step did not move; the mask is probably eating the click',
      );
      check('that press also operated the application itself', navigated,
        navigated ? `${pathBefore} -> ${after.path}` : `still on ${after.path}`);
    }

    await screenshot(cdp, 'step-3-after-real-click');

    // Walk into the derived feature steps, which is where the coverage lives - a picture of one of
    // them is the evidence that a reader can actually get a sentence about a given feature.
    await evaluate(
      cdp,
      `(() => {
        const buttons = [...document.querySelectorAll('[data-slot="tour-tooltip"] button')];
        const next = buttons.find((b) => /下一步/.test(b.textContent));
        if (next) next.click();
        return true;
      })()`,
    );
    await sleep(900);
    const featureStep = await waitForSpotlightOnTarget(cdp, null);
    await screenshot(cdp, 'step-4-feature-entry');
    process.stdout.write(`         feature step: ${featureStep?.title ?? '(none)'} ${featureStep?.counter ?? ''}\n`);
    check('the tour reaches a step for a feature beyond the written core steps',
      Boolean(featureStep?.title && featureStep.title !== second?.title),
      featureStep?.title ?? 'no step title');

    // --- Escape leaves, and the account is recorded --------------------------
    await pressEscape(cdp);
    await sleep(600);

    const closed = await evaluate(cdp, readState(null));
    check('Escape closes the tour', !closed.hasTooltip, closed.hasTooltip ? 'tooltip still on screen' : 'closed');
    check('closing records the account, so it does not open again by itself',
      closed.seenKeys.length === 1,
      closed.seenKeys.join(', ') || 'no seen flag written');

    // --- the replay control brings it back ----------------------------------
    await cdp.send('Page.navigate', { url: `${APP_URL}/beiadmin/profile` });
    await sleep(1800);

    const replay = await evaluate(
      cdp,
      `(() => {
        const button = [...document.querySelectorAll('button')].find((b) => /重新开始引导/.test(b.textContent));
        if (!button) return { found: false };
        button.click();
        return { found: true };
      })()`,
    );
    check('the settings card offers the tour again', replay.found);

    const reopened = await waitForTooltip(cdp, 'sidebar-nav');
    check('pressing it opens the tour from the first step again',
      Boolean(reopened?.hasTooltip) && /第 1 \//.test(reopened?.counter ?? ''),
      reopened?.counter ?? 'did not reopen');

    /*
     * Wait for the slide to finish before photographing it. The spotlight animates from wherever the
     * last step left it, so a screenshot taken the moment the tooltip appears shows a rectangle
     * halfway to its destination - which reads like a positioning bug when it is only a frame of the
     * animation. Asserting the geometry here as well means the replay path is held to the same
     * standard as the first run, not just to "it opened".
     */
    const replayed = await waitForSpotlightOnTarget(cdp, 'sidebar-nav');
    check(
      'the replayed spotlight also lands on its element',
      Boolean(replayed?.spotlight && replayed?.target && edgesMatch(replayed.spotlight, replayed.target, SPOTLIGHT_PADDING)),
      replayed?.spotlight ? `spotlight ${fmt(replayed.spotlight)}` : 'no spotlight',
    );
    check('the replayed tooltip stays clear of its target', !overlaps(replayed?.tooltip, replayed?.target));

    await screenshot(cdp, 'step-4-replayed-from-settings');
  } finally {
    cdp?.close();
    // Chrome can take a moment to release its profile directory on Windows.
    child.kill();
    await sleep(500);
    if (!process.env.TOUR_KEEP_PROFILE) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch {
        // A temp directory left behind is the OS's problem, not a failed verification.
      }
    }
  }

  const failed = results.filter((r) => !r.passed);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length > 0) {
    process.stdout.write(`failed: ${failed.map((f) => f.name).join(' | ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`screenshots in ${ARTIFACTS_DIR}\n`);
}

function fmt(rect) {
  return `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

main().catch((error) => {
  process.stderr.write(`\nverification could not run: ${error.message}\n`);
  process.exit(2);
});
