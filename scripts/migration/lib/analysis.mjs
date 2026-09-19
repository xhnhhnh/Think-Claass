/**
 * Static analysis helpers for the plugin-kernel migration.
 *
 * Dependency-free (node builtins only) so it can run before, during and after
 * the pnpm-workspace restructure. Consumed by:
 *   - scripts/migration/measure.mjs      (baseline metrics report)
 *   - scripts/migration/api-surface.mjs  (HTTP surface snapshot)
 *   - tests/guardrails/*.test.ts         (CI-enforced guardrails)
 *
 * Paths are always returned absolute and normalized to forward slashes.
 */

import fs from 'node:fs';
import path from 'node:path';

/** @typedef {{ rel: string, abs: string }} FileRef */

// ---------------------------------------------------------------------------
// discovery
// ---------------------------------------------------------------------------

/**
 * Recursively collect files under `dir` matching `exts`.
 * Skips node_modules / dist / .git / build output directories.
 * @param {string} dir
 * @param {string[]} exts e.g. ['.ts', '.tsx']
 * @returns {string[]} absolute normalized paths
 */
export function collectFiles(dir, exts) {
  /** @type {string[]} */
  const out = [];
  const SKIP = new Set([
    'node_modules', 'dist', '.git', 'build', 'release_build',
    '.pnpm-store', '.turbo', 'coverage',
  ]);

  /** @param {string} current */
  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        walk(abs);
      } else if (entry.isFile()) {
        if (exts.some((e) => entry.name.endsWith(e))) out.push(normalize(abs));
      }
    }
  }

  walk(dir);
  return out;
}

/**
 * Application source roots that participate in the import graph.
 * Extended over time; absent roots are ignored.
 * @param {string} root
 * @returns {string[]}
 */
export function sourceRoots(root) {
  return ['src', 'api', 'apps', 'packages', 'plugins', 'plugins-ext', 'tests']
    .map((d) => path.join(root, d))
    .filter((d) => fs.existsSync(d));
}

/** @param {string} p */
export function normalize(p) {
  return p.replace(/\\/g, '/');
}

/** @param {string} root @param {string} abs */
export function toRel(root, abs) {
  return normalize(path.relative(root, abs));
}

/**
 * All TypeScript source files in the repository (excluding tests).
 * @param {string} root
 * @returns {string[]}
 */
export function listSourceFiles(root) {
  const files = [];
  for (const dir of sourceRoots(root)) {
    for (const f of collectFiles(dir, ['.ts', '.tsx'])) files.push(f);
  }
  return files;
}

/** @param {string} p */
export function isTestFile(p) {
  return /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx)$/.test(p);
}

/** @param {string} p */
export function isDeclarationFile(p) {
  return p.endsWith('.d.ts') || /setupTests\.ts$/.test(p) || /vite-env\.d\.ts$/.test(p);
}

// ---------------------------------------------------------------------------
// import graph
// ---------------------------------------------------------------------------

/**
 * Build a resolver for the repo's path aliases and TS ESM conventions.
 * Handles the `./x.js` -> `./x.ts` mapping the codebase relies on.
 * @param {string} root
 */
export function createResolver(root) {
  const srcRoot = path.join(root, 'src');

  /**
   * @param {string} fromFile
   * @param {string} spec
   * @returns {string|null}
   */
  return function resolve(fromFile, spec) {
    let base = null;

    // Workspace packages: `@thinkclass/<name>` -> packages/<name>/src/index.ts
    const pkg = /^@thinkclass\/([a-z0-9-]+)(?:\/(.*))?$/.exec(spec);
    if (pkg) {
      const pkgSrc = path.join(root, 'packages', pkg[1], 'src');
      base = pkg[2] ? path.join(pkgSrc, pkg[2]) : path.join(pkgSrc, 'index.ts');
    } else if (spec === '@' || spec.startsWith('@/')) {
      base = path.join(srcRoot, spec.slice(2));
    } else {
      if (!spec.startsWith('.')) return null; // bare package import
      base = path.resolve(path.dirname(fromFile), spec);
    }

    const stripped = base.replace(/\.(js|mjs|cjs)$/, '');
    /** @type {string[]} */
    const candidates = [];
    for (const p of [base, stripped]) {
      candidates.push(p);
      for (const ext of ['.ts', '.tsx']) candidates.push(p + ext);
      for (const ext of ['.ts', '.tsx']) candidates.push(path.join(p, 'index' + ext));
    }
    for (const c of candidates) {
      try {
        if (fs.statSync(c).isFile()) return normalize(c);
      } catch {
        /* keep looking */
      }
    }
    return null;
  };
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/**
 * Extract import specifiers (static + dynamic) from a file.
 * @param {string} file
 * @returns {string[]}
 */
export function extractImportSpecifiers(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  /** @type {Set<string>} */
  const found = new Set();
  for (const m of text.matchAll(IMPORT_RE)) found.add(m[1]);
  return [...found];
}

/**
 * Breadth-first reachability from entry points.
 * @param {string} root
 * @param {string[]} entryRelPaths repo-relative entry points
 * @returns {{ reachable: Set<string>, files: string[], unreachable: string[] }}
 */
export function buildReachability(root, entryRelPaths) {
  const resolve = createResolver(root);
  const files = listSourceFiles(root);
  /** @type {Set<string>} */
  const reachable = new Set();
  /** @type {string[]} */
  const queue = [];
  for (const rel of entryRelPaths) {
    const abs = normalize(path.join(root, rel));
    if (fs.existsSync(abs)) {
      reachable.add(abs);
      queue.push(abs);
    }
  }
  while (queue.length > 0) {
    const current = /** @type {string} */ (queue.shift());
    for (const spec of extractImportSpecifiers(current)) {
      const resolved = resolve(current, spec);
      if (resolved && !reachable.has(resolved)) {
        reachable.add(resolved);
        queue.push(resolved);
      }
    }
  }
  const unreachable = files.filter((f) => !reachable.has(f));
  return { reachable, files, unreachable };
}

/**
 * Repo-relative paths of application-unreachable, non-test, non-declaration files.
 * @param {string} root
 * @param {string[]} entryRelPaths
 * @returns {string[]}
 */
export function findDeadCode(root, entryRelPaths) {
  const { unreachable } = buildReachability(root, entryRelPaths);
  return unreachable
    .filter((f) => !isTestFile(f) && !isDeclarationFile(f))
    .map((f) => toRel(root, f))
    .sort();
}

/**
 * Entry points for application reachability.
 *
 * The host applications, plus everything every workspace package declares in its
 * `exports` map. Deriving package entries from `exports` rather than globbing
 * `src/**\/index.ts` is deliberate: a file is an entry point precisely when the
 * package publishes it, so internal barrels are not mistaken for public surface
 * and publicly importable modules are not mistaken for dead code.
 *
 * @param {string} root
 * @returns {string[]} repo-relative paths
 */
export function defaultEntryPoints(root) {
  /** @type {string[]} */
  const entries = ['src/main.tsx', 'api/server.ts', 'api/index.ts'];

  const packagesDir = path.join(root, 'packages');
  if (!fs.existsSync(packagesDir)) return entries;

  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgDir = path.join(packagesDir, entry.name);
    const manifestPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }

    const targets = [];
    const exported = manifest.exports;
    if (typeof exported === 'string') {
      targets.push(exported);
    } else if (exported && typeof exported === 'object') {
      for (const value of Object.values(exported)) {
        if (typeof value === 'string') targets.push(value);
        else if (value && typeof value === 'object') {
          for (const nested of Object.values(value)) if (typeof nested === 'string') targets.push(nested);
        }
      }
    }
    if (targets.length === 0 && typeof manifest.main === 'string') targets.push(manifest.main);

    for (const target of targets) {
      const relative = target.replace(/^\.\//, '');
      if (!relative.includes('*')) {
        const rel = `packages/${entry.name}/${relative}`;
        if (fs.existsSync(path.join(root, rel))) entries.push(rel);
        continue;
      }
      // Wildcard export, e.g. './domains/*': every file it can resolve to is public.
      const [prefix, suffix] = relative.split('*');
      const scanRoot = path.join(pkgDir, prefix);
      if (!fs.existsSync(scanRoot)) continue;
      for (const file of collectFiles(scanRoot, ['.ts', '.tsx'])) {
        const rel = toRel(root, file);
        if (rel.endsWith(suffix)) entries.push(rel);
      }
    }
  }

  const pluginsDir = path.join(root, 'plugins');
  for (const pluginRoot of [pluginsDir, path.join(root, 'plugins-ext')]) {
    if (!fs.existsSync(pluginRoot)) continue;
    for (const entry of fs.readdirSync(pluginRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const manifestName of ['plugin.json', 'manifest.json']) {
        const manifestPath = path.join(pluginRoot, entry.name, manifestName);
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const backend = manifest?.entry?.backend;
          if (typeof backend !== 'string') continue;
          // A plugin's declared backend entry is an entry point by definition: the
          // runtime imports it dynamically, so no static import points at it.
          const rel = `${path.basename(pluginRoot)}/${entry.name}/${backend.replace(/^\.\//, '')}`;
          if (fs.existsSync(path.join(root, rel))) entries.push(rel);
        } catch {
          /* a malformed manifest is reported by the manifest guardrail */
        }
      }
    }
  }

  return [...new Set(entries)];
}

/**
 * Files whose entire content is a single re-export shim:
 *   export { default } from '@/somewhere';
 * These are the "surface pluginization" anti-pattern.
 * @param {string} root
 * @param {string[]} dirs repo-relative directories to scan
 * @returns {Array<{ file: string, target: string, lines: number }>}
 */
export function findShimFiles(root, dirs) {
  /** @type {Array<{ file: string, target: string, lines: number }>} */
  const shims = [];
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of collectFiles(abs, ['.ts', '.tsx'])) {
      if (isTestFile(file)) continue;
      const raw = fs.readFileSync(file, 'utf8');
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l !== '' && !l.startsWith('//'));
      if (lines.length !== 1) continue;
      const m = /^export\s*\{\s*default\s*\}\s*from\s*['"]([^'"]+)['"];?$/.exec(lines[0]);
      if (m) shims.push({ file: toRel(root, file), target: m[1], lines: lines.length });
    }
  }
  return shims.sort((a, b) => a.file.localeCompare(b.file));
}

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

const CONTROLLER_RE = /@Controller\s*\(([^)]*)\)/g;
const METHOD_RE = /@(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(\s*([^)]*?)\s*\)/g;

/**
 * Normalize a decorator string argument into a path segment list.
 * Supports '' , 'x' , ':id/x' and array form ['api/classes','api/class'].
 * @param {string} arg
 * @returns {string[]}
 */
function parseDecoratorArg(arg) {
  const trimmed = (arg ?? '').trim();
  if (trimmed === '') return [''];
  if (trimmed.startsWith('[')) {
    return [...trimmed.matchAll(/['"]([^'"]*)['"]/g)].map((m) => m[1]);
  }
  const single = /^['"]([^'"]*)['"]$/.exec(trimmed);
  if (single) return [single[1]];
  return ['']; // computed expression - cannot resolve statically
}

/**
 * Extract the HTTP surface by scanning files for @Controller / @Method decorators.
 * Associate each method decorator with the nearest preceding @Controller.
 * @param {string} root
 * @returns {Array<{ method: string, path: string, controller: string|null, file: string, line: number }>}
 */
export function extractApiSurface(root) {
  /** @type {Array<{ method: string, path: string, controller: string|null, file: string, line: number }>} */
  const routes = [];
  const dirs = ['api'].map((d) => path.join(root, d)).filter((d) => fs.existsSync(d));
  /** @type {string[]} */
  const files = [];
  for (const d of dirs) files.push(...collectFiles(d, ['.ts']));

  for (const file of files) {
    if (isTestFile(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const events = [];
    for (const m of text.matchAll(CONTROLLER_RE)) {
      events.push({ kind: 'controller', index: m.index ?? 0, bases: parseDecoratorArg(m[1]) });
    }
    for (const m of text.matchAll(METHOD_RE)) {
      events.push({
        kind: 'method',
        index: m.index ?? 0,
        method: m[1].toUpperCase(),
        segs: parseDecoratorArg(m[2]),
      });
    }
    events.sort((a, b) => a.index - b.index);

    /** @type {string[]|null} */
    let bases = null;
    for (const ev of events) {
      if (ev.kind === 'controller') {
        bases = /** @type {string[]} */ (ev.bases);
      } else if (bases !== null) {
        const line = text.slice(0, ev.index).split(/\r?\n/).length;
        for (const base of bases) {
          for (const seg of /** @type {string[]} */ (ev.segs)) {
            routes.push({
              method: /** @type {string} */ (ev.method),
              path: joinPath(base, seg),
              controller: bases.length === 1 ? base : null,
              file: toRel(root, file),
              line,
            });
          }
        }
      }
    }
  }
  return routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}

/** @param {string} a @param {string} b */
function joinPath(a, b) {
  const left = (a ?? '').replace(/^\/+|\/+$/g, '');
  const right = (b ?? '').replace(/^\/+|\/+$/g, '');
  const joined = [left, right].filter(Boolean).join('/');
  return '/' + joined;
}

// ---------------------------------------------------------------------------
// schema + extension-point inventory
// ---------------------------------------------------------------------------

/**
 * Prisma model names from schema.prisma.
 * @param {string} root
 * @returns {string[]}
 */
export function readPrismaModels(root) {
  const schema = path.join(root, 'prisma/schema.prisma');
  if (!fs.existsSync(schema)) return [];
  const text = fs.readFileSync(schema, 'utf8');
  return [...text.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]).sort();
}

/**
 * Raw CREATE TABLE targets declared in api/db.ts.
 * @param {string} root
 * @returns {string[]}
 */
export function readRawSqlTables(root) {
  const file = path.join(root, 'api/db.ts');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const found = new Set();
  for (const m of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?[`"[]?(\w+)/gi)) {
    found.add(m[1]);
  }
  return [...found].sort();
}

/**
 * Hardcoded class feature flag keys (the extension point that must disappear).
 *
 * Only files that actually contain keys are reported: a file that merely mentions the
 * flags without declaring a list is not a source of truth, and counting it would
 * hide real progress.
 *
 * @param {string} root
 * @returns {Array<{ file: string, keys: string[] }>}
 */
export function readFeatureKeyTables(root) {
  const candidates = [
    'api/utils/classFeatures.ts',
    'api/services/featureService.ts',
    'src/lib/classFeatures.ts',
  ];
  /** @type {Array<{ file: string, keys: string[] }>} */
  const out = [];
  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const keys = new Set();
    for (const m of text.matchAll(/'(enable_[a-z_]+)'/g)) keys.add(m[1]);
    if (keys.size === 0) continue;
    out.push({ file: rel, keys: [...keys].sort() });
  }
  return out;
}

/**
 * `enable_*` columns declared on the classes model in schema.prisma.
 * @param {string} root
 * @returns {string[]}
 */
export function readClassEnableColumns(root) {
  const schema = path.join(root, 'prisma/schema.prisma');
  if (!fs.existsSync(schema)) return [];
  const text = fs.readFileSync(schema, 'utf8');
  const block = /^model\s+classes\s*\{([\s\S]*?)^\}/m.exec(text);
  if (!block) return [];
  return [...block[1].matchAll(/^\s*(enable_\w+)\s/gm)].map((m) => m[1]).sort();
}

/**
 * Repo-wide search for an identifier appearing outside an allowlist of paths.
 * Used by the "kernel has no domain knowledge" guardrail.
 * @param {string} root
 * @param {string} identifier
 * @param {string[]} dirs repo-relative directories to scan
 * @returns {Array<{ file: string, line: number }>}
 */
export function findIdentifier(root, identifier, dirs) {
  /** @type {Array<{ file: string, line: number }>} */
  const hits = [];
  const re = new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  for (const dir of dirs) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of collectFiles(abs, ['.ts', '.tsx'])) {
      if (isTestFile(file)) continue;
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (line.trimStart().startsWith('//')) return;
        if (re.test(line)) hits.push({ file: toRel(root, file), line: i + 1 });
      });
    }
  }
  return hits;
}
