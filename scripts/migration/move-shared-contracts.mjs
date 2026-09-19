#!/usr/bin/env node
/**
 * P2 step 1 - move `src/shared/<domain>/contracts.ts` into `packages/contracts`.
 *
 * The baseline had the backend reaching into the frontend source tree through
 * relative paths (`api/modules/pet/pet.types.ts` -> `'../../../src/shared/pet/contracts.js'`,
 * 16 such imports) while the frontend used the `@/shared/*` alias (56 imports).
 * Both sides now point at the neutral contracts package via
 * `@thinkclass/contracts/domains/<domain>`.
 *
 * `packages/contracts` is type-only (guardrail G6), but the tree contained one
 * runtime value: `DEFAULT_SYSTEM_SETTINGS`. It is emitted to a home on each side
 * that needs it — the backend cannot import frontend modules, and the frontend
 * cannot import the kernel (that would bundle express and better-sqlite3 into the
 * browser build). The two copies are written from the same source block and a
 * parity test guards drift; P4/P5 replaces them with the admin plugin's settings
 * declarations.
 *
 * Run: node scripts/migration/move-shared-contracts.mjs [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SHARED = path.join(ROOT, 'src', 'shared');
const DOMAINS_OUT = path.join(ROOT, 'packages', 'contracts', 'src', 'domains');

const DRY_RUN = process.argv.includes('--dry-run');

const RUNTIME_EXPORT_RE = /^\s*export\s+(?:const|let|var|function|async\s+function|class|enum|default)\b/m;

/** The single runtime value in the tree, extracted rather than moved. */
const RUNTIME = {
  domain: 'admin',
  name: 'DEFAULT_SYSTEM_SETTINGS',
  /** tree root -> where that side should import the value from */
  homes: {
    api: 'api/modules/admin/admin.defaults.ts',
    src: 'src/lib/systemSettings.ts',
  },
  backendImportHint: 'used by admin.repository.ts as the canonical key list and fallbacks for system_settings',
};

const log = (m) => process.stdout.write(m + '\n');

// ---------------------------------------------------------------------------

function listDomains() {
  return fs
    .readdirSync(SHARED, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(SHARED, name, 'contracts.ts')))
    .sort();
}

/** Rewrite intra-tree imports to point at the new package layout. */
function rewriteInternalImports(source) {
  return source
    // `@/shared/<dep>/contracts` (frontend alias form)
    .replace(/(['"])@\/shared\/([a-z]+)\/contracts\1/g, (_m, _q, dep) =>
      dep === 'core' ? `'@thinkclass/contracts'` : `'./${dep}.js'`,
    )
    // `'../core/contracts'` / `'../../core/contracts'` (relative form used inside src/shared)
    .replace(/(['"])(?:\.\.\/)+core\/contracts\1/g, `'@thinkclass/contracts'`);
}

/** Extract the `export const DEFAULT_SYSTEM_SETTINGS ... };` block. */
function extractRuntimeBlock(source) {
  const start = new RegExp(`^export const ${RUNTIME.name}\\b`, 'm').exec(source);
  if (!start) return { body: source, extracted: null };

  const lines = source.slice(start.index).split('\n');
  let endLine = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('}')) {
      endLine = i;
      break;
    }
  }
  if (endLine === -1) throw new Error('could not find the end of the runtime block');

  const block = lines.slice(0, endLine + 1).join('\n');
  const before = source.slice(0, start.index);
  const after = lines.slice(endLine + 1).join('\n');
  return { body: (before + after).replace(/\n{3,}/g, '\n\n'), extracted: block };
}

function walkFiles(dirs, onFile) {
  for (const rel of dirs) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length > 0) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
          stack.push(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          onFile(full);
        }
      }
    }
  }
}

const toRel = (abs) => path.relative(ROOT, abs).replace(/\\/g, '/');

// ---------------------------------------------------------------------------

const domains = listDomains();
log(`found ${domains.length} contract domains: ${domains.join(', ')}`);

if (!DRY_RUN) fs.mkdirSync(DOMAINS_OUT, { recursive: true });

/** @type {{domain: string, runtimeExport: boolean}[]} */
const moved = [];
let extractedDefaults = null;

for (const domain of domains) {
  const source = fs.readFileSync(path.join(SHARED, domain, 'contracts.ts'), 'utf8');
  let body = rewriteInternalImports(source);
  let hadRuntime = false;

  if (domain === RUNTIME.domain) {
    const { body: stripped, extracted } = extractRuntimeBlock(body);
    if (extracted) {
      body = stripped;
      hadRuntime = true;
      extractedDefaults = extracted;
    }
  }

  if (RUNTIME_EXPORT_RE.test(body)) {
    throw new Error(
      `${domain}/contracts.ts still has a runtime export (${RUNTIME_EXPORT_RE.exec(body)[0].trim()}); ` +
        `packages/contracts must stay type-only. Move it out before re-running.`,
    );
  }

  const header =
    `/**\n * ${domain} domain contracts.\n *\n` +
    ` * Moved from \`src/shared/${domain}/contracts.ts\` in P2 so the backend no longer imports\n` +
    ` * from the frontend source tree. Type-only: see guardrail G6.\n */\n\n`;
  if (!DRY_RUN) fs.writeFileSync(path.join(DOMAINS_OUT, `${domain}.ts`), header + body.trimStart(), 'utf8');
  moved.push({ domain, runtimeExport: hadRuntime });
}

const domainNames = domains.filter((d) => d !== 'core');
const indexBody =
  '/**\n * Domain contracts, one module per business domain.\n *\n' +
  ' * Imported as `@thinkclass/contracts/domains/<domain>` so domain names cannot\n' +
  ' * collide with each other or with the core vocabulary.\n *\n' +
  ' * Deliberately NOT re-exported from the package root: two domains may legitimately\n' +
  ' * declare the same DTO name, and a merged root surface would make that a silent\n' +
  ' * conflict.\n *\n' +
  ' * `core` is absent by design - the HTTP envelope it used to hold lives in `../http.ts`.\n */\n\n' +
  domainNames.map((d) => `export type * from './${d}.js';`).join('\n') +
  '\n';
if (!DRY_RUN) fs.writeFileSync(path.join(DOMAINS_OUT, 'index.ts'), indexBody, 'utf8');
if (!DRY_RUN) fs.rmSync(path.join(DOMAINS_OUT, 'core.ts'), { force: true });

// --- runtime value homes ---------------------------------------------------
if (extractedDefaults) {
  const homes = [
    {
      rel: RUNTIME.homes.src,
      purpose:
        'Frontend copy of the system-settings defaults.\n *\n' +
        ' * The frontend cannot import `@thinkclass/kernel` (that would pull express and\n' +
        ' * better-sqlite3 into the browser bundle) and `packages/contracts` is type-only,\n' +
        ' * so this is the browser-side copy. `tests/guardrails/system-settings-parity.test.ts`\n' +
        ' * asserts it stays identical to the backend copy.',
    },
    {
      rel: RUNTIME.homes.api,
      purpose:
        'Backend copy of the system-settings defaults, ' + RUNTIME.backendImportHint + '.\n *\n' +
        ' * Generated alongside the frontend copy from one source block; a parity test keeps\n' +
        ' * them in step. Becomes plugin-declared settings when the admin plugin lands (P4/P5).',
    },
  ];

  for (const home of homes) {
    const content =
      `/**\n * ${home.purpose}\n */\n\n` +
      `import type { SystemSettings } from '@thinkclass/contracts/domains/${RUNTIME.domain}';\n\n` +
      `export type { SystemSettings } from '@thinkclass/contracts/domains/${RUNTIME.domain}';\n\n` +
      `${extractedDefaults}\n`;
    if (!DRY_RUN) {
      fs.mkdirSync(path.dirname(path.join(ROOT, home.rel)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, home.rel), content, 'utf8');
    }
    log(`extracted ${RUNTIME.name} -> ${home.rel}`);
  }
}

// --- rewrite importers -----------------------------------------------------
const IMPORT_RE = /(['"])((?:\.\.\/)+src\/shared\/|@\/shared\/)([a-z]+)\/contracts(\.js)?\1/g;
/** @type {string[]} */
const rewritten = [];

walkFiles(['api', 'src'], (abs) => {
  const source = fs.readFileSync(abs, 'utf8');
  if (!IMPORT_RE.test(source)) return;
  IMPORT_RE.lastIndex = 0;
  const count = (source.match(IMPORT_RE) ?? []).length;
  const next = source.replace(IMPORT_RE, (_m, quote, _prefix, dep) =>
    dep === 'core' ? `${quote}@thinkclass/contracts${quote}` : `${quote}@thinkclass/contracts/domains/${dep}${quote}`,
  );
  if (!DRY_RUN) fs.writeFileSync(abs, next, 'utf8');
  rewritten.push(`${toRel(abs)} (${count})`);
});

// --- repoint the runtime-value consumers -----------------------------------
/**
 * A consumer's import statement mixes the runtime value with types, e.g.
 *
 *   import { DEFAULT_SYSTEM_SETTINGS, type AdminActor, type TeacherListItem } from '.../admin';
 *
 * Sending the whole specifier to the runtime home makes the types unresolvable, so
 * the statement is split: the value points at this side's home, the remaining names
 * stay on the contracts package.
 *
 * The generated home files are skipped - rewriting their own import produced a
 * self-import and a "circular definition of import alias" error.
 */
/** @type {string[]} */
const repointed = [];
if (extractedDefaults) {
  const homePaths = new Set(
    Object.values(RUNTIME.homes).map((rel) => path.join(ROOT, rel)),
  );
  // `[^}]*` rather than `[\s\S]*?`: a named import list can never contain `}`, and
  // a lazy any-char match happily spans several import statements, which swallowed
  // the preceding `@testing-library/react` import and turned its values into types.
  const adminImportRe = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*(['"])@thinkclass/contracts/domains/${RUNTIME.domain}\\2;`,
    'g',
  );

  walkFiles(['api', 'src'], (abs) => {
    if (homePaths.has(abs)) return;
    const source = fs.readFileSync(abs, 'utf8');
    if (!source.includes(RUNTIME.name)) return;
    if (!adminImportRe.test(source)) return;
    adminImportRe.lastIndex = 0;

    const rel = toRel(abs);
    const homeRel = rel.startsWith('api/') ? RUNTIME.homes.api : RUNTIME.homes.src;
    let specifier = path.relative(path.dirname(abs), path.join(ROOT, homeRel)).replace(/\\/g, '/');
    if (!specifier.startsWith('.')) specifier = './' + specifier;
    specifier = specifier.replace(/\.ts$/, '.js');

    const next = source.replace(adminImportRe, (_match, names) => {
      const list = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      const isRuntime = (n) => n === RUNTIME.name || n === `type ${RUNTIME.name}`;
      const runtime = list.filter(isRuntime);
      const rest = list.filter((n) => !isRuntime(n)).map((n) => n.replace(/^type\s+/, ''));

      const statements = [];
      if (runtime.length > 0) statements.push(`import { ${RUNTIME.name} } from '${specifier}';`);
      if (rest.length > 0) {
        statements.push(`import type { ${rest.join(', ')} } from '@thinkclass/contracts/domains/${RUNTIME.domain}';`);
      }
      return statements.join('\n');
    });

    if (!DRY_RUN) fs.writeFileSync(abs, next, 'utf8');
    repointed.push(`${rel} -> ${specifier}`);
  });
}

// --- report ----------------------------------------------------------------
log(`\nrewrote ${rewritten.length} importing files:`);
for (const r of rewritten) log(`  ${r}`);
if (repointed.length > 0) {
  log(`\nrepointed ${repointed.length} ${RUNTIME.name} consumers:`);
  for (const r of repointed) log(`  ${r}`);
}

if (!DRY_RUN) {
  fs.rmSync(SHARED, { recursive: true, force: true });
  log(`\nremoved src/shared/`);
}

log(`\nmoved ${moved.length} domains to packages/contracts/src/domains/`);
log(DRY_RUN ? 'DRY RUN - nothing written' : 'done');
