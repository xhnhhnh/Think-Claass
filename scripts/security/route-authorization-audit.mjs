#!/usr/bin/env node
/**
 * Route-authorization inventory.
 *
 *   node scripts/security/route-authorization-audit.mjs          # human report
 *   node scripts/security/route-authorization-audit.mjs --json   # machine-readable
 *   node scripts/security/route-authorization-audit.mjs --check  # non-zero while any file has no gate
 *
 * ## What this is, and what it is not
 *
 * This is an **inventory**, not a proof. For every controller file it asks one question: does this
 * file resolve the caller from the kernel request context at all? A file that never mentions an
 * actor token cannot be gating anything, so every route it declares is reported as open. That is a
 * reliable signal - it is how the round this script exists for found 167 unguarded endpoints.
 *
 * A file that *does* resolve the caller is reported as gated, and that verdict is deliberately
 * coarse: it does **not** check that each individual handler gates, nor that the role or the result
 * filtering is right. `tests/e2e/authorization/routes.test.ts` is the real gate - it boots the
 * application and asserts, per route, that anonymous is 401 and that each role gets what the ruling
 * in `docs/security/route-authorization-matrix.md` says it should. Static analysis over decorators
 * cannot decide "may this teacher see this student", and a scanner that claims to is worse than one
 * that says what it checked.
 *
 * ## Why it lives under `scripts/`, tracked
 *
 * The matrix's original generator lived in `.tmp/`, which `.gitignore` excludes, so the artifact
 * outlived its tool: the next round could read the matrix but not reproduce or update it. `.tmp/`
 * has bitten this repository twice before (a test fixture and a measurement script that both
 * "passed locally" and could not exist on a fresh clone).
 *
 * ## Reconciliation
 *
 * The endpoint count is checked against `tests/guardrails/snapshots/api-surface.json` and the
 * script **fails** on any difference it cannot explain, so a route that neither this script nor the
 * documented compat aliases account for is a red build rather than a silently missing row.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SNAPSHOT = path.join(ROOT, 'tests', 'guardrails', 'snapshots', 'api-surface.json');

/**
 * The exemption list and the compat aliases, read from the one file that holds them.
 *
 * They live in `tests/e2e/publicRoutes.json` rather than here because the e2e authorization suite
 * asserts against the same list - each public route must still answer an anonymous caller, which is
 * what stops the list from rotting into "routes we forgot to protect". Two copies would drift, and
 * the copy that drifted would be the one nobody read.
 *
 * JSON because both runtimes read it natively: this is a plain `node` script with no build step,
 * and the other consumer is Vite.
 */
export const PUBLIC_BY_DESIGN = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests', 'e2e', 'publicRoutes.json'), 'utf8'),
).publicByDesign;
export const COMPAT_ALIASES = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests', 'e2e', 'publicRoutes.json'), 'utf8'),
).compatAliases;

/**
 * Call names that mean "the caller was resolved from the verified request context".
 *
 * The first group resolves the actor in the controller. The second group is a *delegation*: the
 * handler hands `req` to a service, and the service does the actor work - which is how
 * `plugins/classroom` is built, with one `requireActor`/`ensureStudentAction` family covering 47
 * routes. It is still a file-level claim (does this file gate at all), so the caveat in the header
 * applies unchanged.
 */
const ACTOR_TOKENS = [
  'getRequestContext',
  'requireAdmin',
  'requireActorRole',
  'requireRole',
  'requireActor',
  'requireSelf',
  'actorOf',
  'requestActor',
  'actorIdOf',
  'studentActorId',
  'currentActor',
];

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'All'];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      // Match by *content*: `plugins/admin/src/admin.update.ts` declares a controller but is not
      // named `*controller*`, and a name-based filter silently skipped its three routes.
      if (fs.readFileSync(full, 'utf8').includes('@Controller(')) out.push(full);
    }
  }
  return out;
}

/**
 * Remove comments, leaving string literals intact.
 *
 * Both halves are load-bearing, and each has already produced a wrong answer here: a regex that
 * strips line comments destroys a URL inside a string, and a pass that tracks strings but not
 * comments starts a string at an apostrophe inside a Chinese doc comment and never closes it.
 */
function stripComments(text) {
  let out = '';
  let i = 0;
  let state = null;
  let quote = null;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (state === 'line') {
      if (ch === '\n') {
        state = null;
        out += ch;
      }
      i += 1;
      continue;
    }

    if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = null;
        i += 2;
        continue;
      }
      if (ch === '\n') out += ch;
      i += 1;
      continue;
    }

    if (state === 'string') {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) {
        state = null;
        quote = null;
      }
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      state = 'line';
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      state = 'block';
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      state = 'string';
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/** The `(...)` group starting at `open`, honouring nesting and string literals. */
function balancedSlice(text, open) {
  let depth = 0;
  let quote = null;

  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** Route paths in a decorator's argument list. `@Put(['a','b'])` declares two. */
function pathsOf(argumentList) {
  const arrayMatch = /\[([^\]]*)\]/.exec(argumentList);
  const raw = arrayMatch ? arrayMatch[1] : argumentList;
  return [...raw.matchAll(/['"`]([^'"`]*)['"`]/g)].map((m) => m[1]);
}

/** Every `@Controller` in a file: its base path and the text of its class body. */
function controllerClasses(source) {
  const text = stripComments(source);
  const classes = [];

  for (const match of text.matchAll(/@Controller\(/g)) {
    const args = balancedSlice(text, match.index + match[0].length - 1);
    if (!args) continue;

    const open = text.indexOf('{', args.end);
    if (open === -1) continue;
    const body = balancedSlice(text, open);
    if (!body) continue;

    classes.push({ base: pathsOf(args.inner)[0] ?? '', body: body.inner });
  }

  return classes;
}

/**
 * The routes a class body declares, as `METHOD /full/path`.
 *
 * Only the decorator and its argument list are parsed here; the body is not attributed to a
 * handler, because the whole class is judged as one unit (see the file header). Parsing a method
 * name reliably means surviving decorator stacks, multi-line parameter lists, nested decorators and
 * object literals inside them - a TypeScript parser's job, not this script's.
 */
function routesIn(base, classBody) {
  const routes = [];
  const methodRe = new RegExp(`@(${HTTP_METHODS.join('|')})\\(`, 'g');

  for (const match of classBody.matchAll(methodRe)) {
    const args = balancedSlice(classBody, match.index + match[0].length - 1);
    if (!args) continue;

    const segments = pathsOf(args.inner);
    for (const segment of segments.length > 0 ? segments : ['']) {
      const full = `/${[base, segment].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
      routes.push(`${match[1].toUpperCase()} ${full}`);
    }
  }

  return routes;
}

/** The kernel's own routes: `router.get(...)`, with their inline handler bodies. */
function kernelRoutes(source) {
  const text = stripComments(source);
  const routes = new Map();

  for (const match of text.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)) {
    routes.set(`${match[1].toUpperCase()} ${match[2]}`, true);
  }
  return routes;
}

/** Does this controller file resolve the caller, directly or by delegating `req` to a service? */
function fileGates(source) {
  const text = stripComments(source);
  if (ACTOR_TOKENS.some((token) => text.includes(token))) return true;

  // `this.classroomService.listStudents(req, classId)` - the guard is in the service, which is the
  // pattern `plugins/classroom` uses for all 47 of its routes.
  return /\bthis\.[\w.]+\(\s*req\b/.test(text);
}

function main() {
  const files = walk(path.join(ROOT, 'plugins'), []).sort();
  const kernelFile = path.join(ROOT, 'packages', 'kernel', 'src', 'http', 'kernelRoutes.ts');

  const rows = [];
  /** @type {Map<string, {file: string, gated: boolean}>} */
  const owners = new Map();

  const record = (route, file, gated) => {
    if (owners.has(route)) return; // first declaration wins; a duplicate is G11's problem
    owners.set(route, { file, gated });
  };

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    // The file-level question. A controller file that never resolves the caller cannot gate.
    const gated = fileGates(source);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');

    for (const controller of controllerClasses(source)) {
      for (const route of routesIn(controller.base, controller.body)) record(route, rel, gated);
    }
  }

  if (fs.existsSync(kernelFile)) {
    const rel = path.relative(ROOT, kernelFile).replace(/\\/g, '/');
    for (const route of kernelRoutes(fs.readFileSync(kernelFile, 'utf8')).keys()) {
      // The kernel's own router is hand-written; its routes are judged individually in the matrix
      // and by the e2e probe, and four of the eight are public by design.
      record(route, rel, true);
    }
  }

  const endpoints = [...owners.entries()].map(([method, owner]) => ({
    method,
    file: owner.file,
    publicByDesign: PUBLIC_BY_DESIGN[method] ?? null,
    state:
      PUBLIC_BY_DESIGN[method] !== undefined ? 'public' : owner.gated ? 'gated' : 'OPEN',
  }));

  const byFile = new Map();
  for (const endpoint of endpoints) {
    const plugin = endpoint.file.startsWith('plugins/') ? endpoint.file.split('/')[1] : 'kernel';
    byFile.set(plugin, [...(byFile.get(plugin) ?? []), endpoint]);
  }

  const open = endpoints.filter((entry) => entry.state === 'OPEN');
  const summary = {
    total: endpoints.length,
    publicByDesign: endpoints.filter((e) => e.state === 'public').length,
    gated: endpoints.filter((e) => e.state === 'gated').length,
    open: open.length,
  };

  let reconciliation = { snapshot: 0, unmatched: 0, unexpected: [] };
  if (fs.existsSync(SNAPSHOT)) {
    const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    const mine = new Set(endpoints.map((entry) => entry.method));
    const all = snapshot.endpoints ?? [];
    const unexpected = all.filter((endpoint) => !mine.has(endpoint) && COMPAT_ALIASES[endpoint] === undefined);
    reconciliation = { snapshot: snapshot.count ?? all.length, unmatched: unexpected.length, unexpected };
  }

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ summary, reconciliation, endpoints, open }, null, 2)}\n`);
    process.exit(summary.open === 0 && reconciliation.unmatched === 0 ? 0 : 1);
  }

  const pad = (value, width) => String(value).padEnd(width);

  process.stdout.write('Route authorization inventory\n\n');
  process.stdout.write(`${pad('plugin', 16)}${pad('routes', 8)}${pad('public', 8)}${pad('gated', 7)}open\n`);
  for (const plugin of [...byFile.keys()].sort()) {
    const rows_ = byFile.get(plugin);
    process.stdout.write(
      `${pad(plugin, 16)}${pad(rows_.length, 8)}${pad(rows_.filter((r) => r.state === 'public').length, 8)}` +
        `${pad(rows_.filter((r) => r.state === 'gated').length, 7)}${rows_.filter((r) => r.state === 'OPEN').length}\n`,
    );
  }

  process.stdout.write(
    `\ntotal ${summary.total} - public ${summary.publicByDesign}, gated ${summary.gated}, OPEN ${summary.open}\n`,
  );

  process.stdout.write(
    '\nWhat "gated" means here: the file resolves the caller somewhere, so it *can* gate. It is not a\n' +
      'per-route proof - that is tests/e2e/authorization/routes.test.ts, which boots the app and asserts\n' +
      '401/403/200 per route and role against docs/security/route-authorization-matrix.md.\n',
  );

  if (reconciliation.snapshot > 0) {
    const accounted = summary.total + Object.keys(COMPAT_ALIASES).length;
    process.stdout.write(
      `\nsnapshot ${reconciliation.snapshot} endpoints; this script attributes ${summary.total} ` +
        `(+${Object.keys(COMPAT_ALIASES).length} documented compat aliases = ${accounted})\n`,
    );
    if (reconciliation.unexpected.length > 0) {
      process.stdout.write('\nUNATTRIBUTED - the snapshot has endpoints no controller in the tree declares:\n');
      for (const endpoint of reconciliation.unexpected) process.stdout.write(`  ${endpoint}\n`);
      process.stdout.write('Add them to COMPAT_ALIASES with a reason, or find the controller that serves them.\n');
    }
  }

  if (open.length > 0) {
    process.stdout.write('\nFiles that never resolve the caller (every route they declare is open):\n');
    for (const file of [...new Set(open.map((entry) => entry.file))].sort()) {
      const routes = open.filter((entry) => entry.file === file);
      process.stdout.write(`  ${file} (${routes.length})\n`);
      for (const route of routes.slice(0, 4)) process.stdout.write(`      ${route.method}\n`);
      if (routes.length > 4) process.stdout.write(`      ... and ${routes.length - 4} more\n`);
    }
  }

  const failed = (process.argv.includes('--check') && summary.open > 0) || reconciliation.unmatched > 0;
  process.exit(failed ? 1 : 0);
}

main();
