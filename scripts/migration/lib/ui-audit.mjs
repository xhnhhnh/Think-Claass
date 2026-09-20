/**
 * Design-system audit for the front-end UI refactor.
 *
 * The front end grew a component layer (`src/components/ui/**`) that pages barely
 * use, and a look that is held together by global `!important` overrides in
 * `src/index.css` rather than by the pages themselves. This module measures that
 * debt so the refactor can be a ratchet instead of a promise.
 *
 * Dependency-free (node builtins only), same as `analysis.mjs`, because it is
 * consumed by three callers that must agree on the definitions:
 *   - scripts/migration/ui-audit.mjs       (human report / --json / --check)
 *   - tests/guardrails/ui-design-system.test.ts (G20, CI-enforced)
 *   - docs/design-system.md                (the numbers quoted in prose)
 *
 * Two rules keep the measurements honest:
 *
 *   1. Every metric counts *occurrences*, not files, and each returns the
 *      offending `path:line` list alongside the count. A ratchet whose failures
 *      cannot be located is a ratchet nobody lowers.
 *   2. A metric is only added here when the definition can be stated in one
 *      sentence and cannot be gamed by moving a file. Test files and generated
 *      assets are excluded by rule, not by an allowlist, so a rename cannot
 *      silently change a number.
 *
 * The one deliberate exception is `HEX_COLOR_EXEMPT`: `src/lib/brandIcon.ts` is
 * the single definition of the brand mark (see the note in `index.html`), so its
 * colour literals are artwork rather than drift, and they are named here rather
 * than excluded by a broad path rule.
 *
 * Paths are always returned absolute and normalized to forward slashes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { collectFiles, isTestFile, normalize, toRel } from './analysis.mjs';

// ---------------------------------------------------------------------------
// definitions
// ---------------------------------------------------------------------------

/** Source extensions that can carry UI markup or class names. */
const SRC_EXTS = ['.ts', '.tsx'];

/** True for every source file that is not the component layer itself. */
const isOutsideKit = (rel) => !rel.startsWith(RAW_ELEMENT_EXEMPT_PREFIX);

/** The stylesheet the refactor is shrinking. */
export const STYLESHEET = 'src/index.css';

/**
 * Files allowed to contain colour literals.
 *
 * `brandIcon.ts` draws the mark that `index.html` deliberately does not duplicate,
 * so its hex values are the artwork, not an unstyled page. `celebrationPalette.ts`
 * is the same idea for the canvas-confetti colours that pages currently inline;
 * P2 creates it, and listing it here first is what keeps that move from reading
 * as new debt.
 */
export const HEX_COLOR_EXEMPT = ['src/lib/brandIcon.ts', 'src/lib/celebrationPalette.ts'];

/**
 * Raw elements the component layer is meant to replace.
 *
 * The lookahead keeps `<buttonGroup>`-style custom elements out of the count
 * while still matching `<button\n` and `<button>`.
 *
 * `src/components/ui/**` is excluded from these counts, not from the audit: the kit
 * is the one layer whose job is to render the element (`select.tsx` contains a real
 * `<select>`), so counting it would make the kit's own implementation look like the
 * debt the kit exists to remove. A page writing `<select>` is the debt; the kit
 * wrapping one is the fix.
 */
const RAW_ELEMENTS = /** @type {const} */ ({
  rawButtons: /<button(?=[\s/>])/g,
  rawInputs: /<input(?=[\s/>])/g,
  rawSelects: /<select(?=[\s/>])/g,
  rawTables: /<table(?=[\s/>])/g,
});

/** Files allowed to contain the raw elements above. */
export const RAW_ELEMENT_EXEMPT_PREFIX = 'src/components/ui/';

/** A CSS colour literal: 3, 4, 6 or 8 hex digits, and nothing longer. */
const HEX_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

/** React inline styles: the escape hatch that bypasses every token. */
const INLINE_STYLE = /style=\{\{/g;

/** Blocking browser dialogs, which cannot be styled and cannot be tested. */
const NATIVE_DIALOGS = /(?<![A-Za-z0-9_$.])(?:confirm|prompt)\(|window\.alert\(/g;

/**
 * Utilities that Tailwind 3.4 cannot compile, so they are inert wherever they are
 * written. The project runs Tailwind 3.4.19 while the component layer was
 * generated for v4, and this list is the measured consequence: `dist/assets/
 * index-*.css` contains none of them.
 *
 * Every entry is a *specific* construct rather than a family, because v3.4 does
 * support more than it looks like it should. Verified by compiling each through
 * the project's own config (`G20 > the constructs the inert-token ratchet counts
 * really are inert`):
 *
 *   - `has-[>img:first-child]:pt-0`, `data-[size=sm]:gap-3` and the *named* form
 *     `group-data-[size=sm]/card:px-3` all compile, so none of them are listed;
 *     an earlier version of this file counted the named form and was wrong.
 *   - `ring-3` does not: v3 has no width-3 ring, and the focus rings the kit
 *     writes have never rendered.
 */
const INERT_TOKENS = /** @type {const} */ ({
  'ring-3': /\bring-3\b/g,
  'not-aria-': /\bnot-aria-[\w-]+/g,
  'arbitrary-child (*:[)': /\*:\[/g,
  'arbitrary-class-variant ([.x]:)': /\[\.border-[\w-]*\]/g,
  'has-data-': /\bhas-data-/g,
  'in-data-': /\bin-data-/g,
  'named-container (@container/x)': /@container\/[a-z]/g,
  'data-attribute shorthand (data-x:)': /\bdata-(?!\[)[a-z][\w-]*:/g,
  'supports shorthand (supports-x:)': /\bsupports-(?!\[)[a-z][\w-]*:/g,
  'css-var shorthand (-(--x))': /[\w\])]-\(--[\w.-]+\)/g,
  'v4-only scale value': /\b(?:backdrop-)?blur-xs\b|\brounded-(?:xs|4xl)\b|\bshadow-xs\b/g,
  'trailing important (x!)': /[a-z][\w/[\].,-]*-[\w/[\].,-]+!(?=[\s"'])/g,
  'named group-has (group-has-x/y:)': /\bgroup-has-(?!\[)[a-z][\w-]*\/[\w-]+:/g,
  'unbracketed has / group-has': /\b(?:group-)?has-(?!\[)[a-z][\w-]*:/g,
  'compound aria variants (aria-x:aria-y:)': /\baria-[\w-]+:aria-[\w-]+:/g,
  'scale gap (underline-offset-3)': /\bunderline-offset-(?!\[|auto\b|0\b|1\b|2\b|4\b|8\b)\d/g,
  'outline-hidden': /\boutline-hidden\b/g,
  'not-* variant': /\bnot-(?!\[)[a-z][\w-]*:/g,
  'all-descendants variant (**:)': /\*\*:/g,
  'animate-in': /\banimate-in\b/g,
  'animate-out': /\banimate-out\b/g,
  'slide-in-from-': /\bslide-in-from-/g,
  'slide-out-to-': /\bslide-out-to-/g,
  'bare fade/zoom in/out keyframe utilities': /(?<!animate-)\b(?:fade|zoom)-(?:in|out)\b/g,
});

/**
 * Accent families that are not part of this product's identity.
 *
 * The campus language is green, with amber/orange and sky as the two
 * supporting accents (that is the whole point of the login role themes and of
 * `.gemini-gradient`). Indigo, violet, purple, fuchsia, pink and rose are not -
 * they are what the pages were originally written in, and only the portal's copy
 * is repainted by the `.public-campus-page` override block. Everywhere else they
 * render as authored, which is why the same product shows two design languages.
 */
const OFF_BRAND_ACCENTS = 'indigo|violet|purple|fuchsia|pink|rose';

/** An off-brand accent utility: `text-indigo-500`, `bg-purple-50/60`, ... */
const OFF_BRAND_ACCENT_UTILITY = new RegExp(
  `(?:bg|text|border|ring|from|via|to|fill|stroke|divide|shadow|outline|decoration|placeholder|caret|accent)-(?:${OFF_BRAND_ACCENTS})-\\d{2,3}(?:/\\d+)?`,
  'g',
);

/**
 * CSS imports that only exist for Tailwind v4. `tw-animate-css` resolves, so it is
 * not caught by the unresolved-import metric - it is caught here, because its
 * `@theme` / `@utility` at-rules are emitted verbatim into the production bundle
 * where no v3 build ever reads them.
 */
const V4_ONLY_CSS_IMPORTS = new Set(['tw-animate-css']);

/** Utility classes the stylesheet declares inside `@layer utilities`. */
const DECLARED_UTILITY = /\.([a-z][\w-]*)\s*\{/g;

/**
 * Colour utility prefixes.
 *
 * `shadow-` is deliberately absent: `shadow-glow-primary` resolves through
 * `theme.boxShadow`, so counting it here would report a working class as debt.
 */
const COLOUR_UTILITY_PREFIX =
  'bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|placeholder|caret|accent';

/** Custom properties the stylesheet declares, e.g. `--card` -> `card`. */
const CSS_CUSTOM_PROPERTY = /(?:^|[\s;{])--([a-z][a-z0-9-]*)\s*:/gm;

/**
 * The metric set, in report order, with the phase that takes each to zero.
 *
 * Kept as data (not as test-local constants) so the CLI report, the allowance file
 * and the guardrail cannot drift into three different lists.
 */
export const UI_METRICS = /** @type {const} */ ([
  { key: 'rawButtons', target: 'P2-P7', label: 'raw <button> elements' },
  { key: 'rawInputs', target: 'P2-P7', label: 'raw <input> elements' },
  { key: 'rawSelects', target: 'P2-P7', label: 'raw <select> elements' },
  { key: 'rawTables', target: 'P2-P7', label: 'raw <table> elements' },
  { key: 'hexColors', target: 'P1-P7', label: 'hex colour literals' },
  {
    key: 'offBrandAccents',
    target: 'P3-P8',
    label: 'off-brand accent utilities (indigo/violet/purple/...)',
  },
  { key: 'inlineStyles', target: 'P3-P7', label: 'inline style={{ }} props' },
  { key: 'nativeDialogs', target: 'P2-P5', label: 'confirm()/prompt()/alert() calls' },
  { key: 'importantOverrides', target: 'P8', label: '!important overrides in index.css' },
  { key: 'recolorRules', target: 'P3', label: '.public-campus-page recolour rules' },
  { key: 'inertTokens', target: 'P1-P6', label: 'Tailwind v4-only (inert) tokens' },
  {
    key: 'unresolvedTokenUtilities',
    target: 'P1',
    label: 'colour utilities for tokens Tailwind cannot resolve',
  },
  { key: 'deadUtilities', target: 'P8', label: 'unused utilities declared in index.css' },
  { key: 'unresolvedCssImports', target: 'P1', label: 'unresolvable @import specifiers' },
  { key: 'v4OnlyCssImports', target: 'P1', label: 'v4-only @import specifiers' },
]);

/**
 * Coarse area for the human report, so a phase can be sized before it starts.
 *
 * Filename-based rather than directory-based for the feature tree, because one
 * plugin tree holds both the teacher and the student page for a domain.
 * @param {string} rel repo-relative, forward slashes
 */
export function areaOf(rel) {
  if (/^src\/pages\/Teacher\//.test(rel) || /^src\/features\/[^/]+\/pages\/Teacher/.test(rel)) return 'teacher';
  if (/^src\/features\/[^/]+\/pages\/Student/.test(rel)) return 'student';
  if (/^src\/pages\/Parent\//.test(rel) || /^src\/features\/[^/]+\/pages\/Parent/.test(rel)) return 'parent';
  if (/^src\/pages\/Admin\//.test(rel) || /^src\/features\/admin\//.test(rel)) return 'admin';
  if (/^src\/features\/(?:portal|auth)\//.test(rel) || rel === 'src/pages/Payment.tsx') return 'portal';
  if (/^src\/(?:components|app|lib|hooks|store|api)\//.test(rel)) return 'shared';
  if (/^src\/features\//.test(rel)) return 'feature-shared';
  return 'other';
}

// ---------------------------------------------------------------------------
// scanning
// ---------------------------------------------------------------------------

/**
 * Every non-test source file under `src/`.
 * @param {string} root
 * @returns {string[]} absolute normalized paths
 */
export function uiSourceFiles(root) {
  const dir = path.join(root, 'src');
  if (!fs.existsSync(dir)) return [];
  return collectFiles(dir, SRC_EXTS).filter((f) => !isTestFile(f));
}

/**
 * Blank out comments while preserving every offset and newline.
 *
 * Without this the audit measures its own documentation: a metric that counts
 * `ring-3` will otherwise count the comment explaining that `ring-3` is inert,
 * and "write down the defect" shows up as "add the defect". Quote-aware, because
 * `"https://…"` and a template literal both contain sequences that look like
 * comment starts.
 *
 * @param {string} text
 */
export function blankComments(text) {
  let out = '';
  let i = 0;
  let quote = null;

  const blank = (ch) => (ch === '\n' ? '\n' : ' ');

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        out += blank(text[i]);
        i += 1;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out += blank(text[i]);
        i += 1;
      }
      out += '  ';
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Count matches and report where they are.
 *
 * `path:line` is deliberate: a ratchet failure that only says "263" cannot be
 * worked on, and the first version of this file returned exactly that.
 *
 * @param {string} root
 * @param {string[]} files absolute paths
 * @param {RegExp} pattern must carry the `g` flag
 * @param {(rel: string) => boolean} [include] extra per-file filter
 * @returns {{ count: number, offenders: string[] }}
 */
export function findOccurrences(root, files, pattern, include) {
  let count = 0;
  const offenders = [];

  for (const abs of files) {
    const rel = toRel(root, abs);
    if (include && !include(rel)) continue;

    const text = blankComments(fs.readFileSync(abs, 'utf8'));
    // A fresh regex per file: lastIndex is stateful when the `g` flag is set, and
    // reusing one instance across files silently skips matches.
    const perFile = new RegExp(pattern.source, pattern.flags);
    const matches = [...text.matchAll(perFile)];
    if (matches.length === 0) continue;

    count += matches.length;
    for (const match of matches) {
      const line = text.slice(0, match.index ?? 0).split(/\r?\n/).length;
      offenders.push(`${rel}:${line}`);
    }
  }

  return { count, offenders };
}

/**
 * Parse the stylesheet: the `!important` overrides, the forced-recolour block, the
 * declared-but-unused utilities and the import list.
 *
 * @param {string} root
 * @param {string} srcText concatenated source, for the dead-utility check
 */
export function auditStylesheet(root, srcText) {
  const rel = STYLESHEET;
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    return {
      importantOverrides: { count: 0, offenders: [] },
      recolorRules: { count: 0, offenders: [] },
      deadUtilities: { count: 0, offenders: [] },
      imports: [],
    };
  }

  const raw = fs.readFileSync(abs, 'utf8');
  // Comments are blanked rather than deleted: offsets and line numbers must keep
  // pointing at the real file, and a metric that counts the phrase `!important`
  // inside prose is measuring the documentation, not the debt.
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const lineOf = (index) => text.slice(0, index).split(/\r?\n/).length;

  // --- !important -----------------------------------------------------------------
  const importantOffenders = [];
  for (const match of text.matchAll(/!important/g)) {
    importantOffenders.push(`${rel}:${lineOf(match.index ?? 0)}`);
  }

  // --- rule blocks -----------------------------------------------------------------
  // A flat scan is enough: the stylesheet has no nested at-rules inside the blocks
  // this metric looks for. `[^{}]` cannot cross a brace, so one match is one block.
  const blocks = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const recolorOffenders = [];
  for (const block of blocks) {
    const selector = block[1].trim();
    if (selector.includes('.public-campus-page')) {
      recolorOffenders.push(`${rel}:${lineOf(block.index ?? 0)}`);
    }
  }

  // --- declared-but-unused utilities ------------------------------------------------
  // Scoped to `@layer utilities { ... }` so the semantic token blocks are not
  // mistaken for utilities. Nesting is one level deep, so the region is found by
  // brace counting rather than by a regex.
  const deadUtilities = [];
  const layerStart = text.indexOf('@layer utilities');
  if (layerStart !== -1) {
    const open = text.indexOf('{', layerStart);
    let depth = 0;
    let end = text.length;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const region = text.slice(open, end);
    for (const match of region.matchAll(DECLARED_UTILITY)) {
      const name = match[1];
      // A utility is used when its class name appears in any source file or in
      // index.html. The boundary check keeps `.glass` from being "used" by
      // `glass-dark`.
      const usage = new RegExp(`(?<![\\w-])${name}(?![\\w-])`);
      if (!usage.test(srcText)) {
        deadUtilities.push(`${rel}:${lineOf(open + (match.index ?? 0))} .${name}`);
      }
    }
  }

  // --- imports ----------------------------------------------------------------------
  const require_ = createRequire(path.join(root, 'package.json'));
  const imports = [];
  for (const match of text.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)) {
    const specifier = match[1];
    const line = lineOf(match.index ?? 0);
    let resolves = false;

    if (specifier.startsWith('.')) {
      resolves = fs.existsSync(path.resolve(path.dirname(abs), specifier));
    } else {
      resolves =
        fs.existsSync(path.join(root, 'node_modules', specifier)) ||
        resolvesAsPackage(require_, specifier);
    }

    imports.push({
      specifier,
      line,
      resolves,
      v4Only: V4_ONLY_CSS_IMPORTS.has(specifier),
    });
  }

  return {
    importantOverrides: { count: importantOffenders.length, offenders: importantOffenders },
    recolorRules: { count: recolorOffenders.length, offenders: recolorOffenders },
    deadUtilities: {
      count: deadUtilities.length,
      offenders: deadUtilities,
    },
    imports,
  };
}

/** `createRequire().resolve` throws for a subpath that does not exist, which is the point. */
function resolvesAsPackage(require_, specifier) {
  try {
    require_.resolve(specifier);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// design tokens
// ---------------------------------------------------------------------------

/**
 * The project's Tailwind config, resolved.
 *
 * Resolved rather than raw: the raw file only carries `theme.extend`, and the
 * question here is whether a class compiles, which depends on the merged theme
 * including the default palette. Returns null when Tailwind is not installed, so
 * the surrounding audit still works in a stripped checkout.
 */
async function loadResolvedConfig(root) {
  try {
    const [{ default: loadConfig }, { default: resolveConfig }] = await Promise.all([
      import('tailwindcss/loadConfig.js'),
      import('tailwindcss/resolveConfig.js'),
    ]);
    return resolveConfig(await loadConfig(path.join(root, 'tailwind.config.js')));
  } catch {
    return null;
  }
}

/** Every colour key the theme exposes, flattened: `primary.foreground` -> `primary-foreground`. */
function flattenColourKeys(colors, prefix = '') {
  const keys = new Set();
  if (!colors || typeof colors !== 'object') return keys;

  for (const [key, value] of Object.entries(colors)) {
    if (key === 'DEFAULT') {
      keys.add(prefix.replace(/-$/, ''));
    } else if (value && typeof value === 'object') {
      for (const nested of flattenColourKeys(value, `${prefix}${key}-`)) keys.add(nested);
    } else {
      keys.add(prefix + key);
    }
  }
  return keys;
}

/** Custom property names the stylesheet declares, e.g. `--card-foreground`. */
function declaredCssTokens(root) {
  const text = fs.readFileSync(path.join(root, STYLESHEET), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = new Set();
  for (const match of text.matchAll(new RegExp(CSS_CUSTOM_PROPERTY.source, 'g'))) tokens.add(match[1]);
  return [...tokens];
}

/**
 * Colour utilities that reference a token the theme does not expose.
 *
 * The defect this measures is one step worse than an inert v4 construct, because
 * the token *looks* declared: `src/index.css` defines `--card` and
 * `--card-foreground`, `theme.extend.colors` never registers them, so `bg-card`
 * compiles to nothing and the kit's Card renders with no background at all. Four
 * tokens are affected today (`card`, `card-foreground`, `popover`,
 * `popover-foreground`), used in `card.tsx`, `dialog.tsx` and `dropdown-menu.tsx`.
 *
 * Only tokens with a real usage are counted, which keeps the metric free of the
 * length- and geometry-valued custom properties (`--radius`, `--font-*`).
 *
 * @param {string} root
 */
export async function unresolvedTokenUtilities(root) {
  const config = await loadResolvedConfig(root);
  if (!config) return { count: 0, offenders: [] };

  const colours = flattenColourKeys(config.theme?.colors ?? {});
  const files = uiSourceFiles(root);

  let count = 0;
  const offenders = [];
  for (const token of declaredCssTokens(root)) {
    if (colours.has(token)) continue;

    const pattern = new RegExp(
      `\\b(?:${COLOUR_UTILITY_PREFIX})-${token}(?:/[\\d.]+)?(?![\\w-])`,
      'g',
    );
    const found = findOccurrences(root, files, pattern);
    count += found.count;
    offenders.push(...found.offenders.map((o) => `${o} [${token}]`));
  }

  return { count, offenders };
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

/**
 * The whole audit.
 *
 * Async because one metric resolves the Tailwind theme to decide whether a class
 * can compile at all - see `unresolvedTokenUtilities`.
 *
 * @param {string} root repository root
 * @returns {Promise<{
 *   counts: Record<string, number>,
 *   offenders: Record<string, string[]>,
 *   areas: Array<Record<string, number | string>>,
 *   imports: Array<{ specifier: string, line: number, resolves: boolean, v4Only: boolean }>,
 * }>}
 */
export async function auditUi(root) {
  const files = uiSourceFiles(root);
  const counts = {};
  const offenders = {};

  for (const [key, pattern] of Object.entries(RAW_ELEMENTS)) {
    const found = findOccurrences(root, files, pattern, isOutsideKit);
    counts[key] = found.count;
    offenders[key] = found.offenders;
  }

  const hex = findOccurrences(root, files, HEX_COLOR, (rel) => !HEX_COLOR_EXEMPT.includes(rel));
  counts.hexColors = hex.count;
  offenders.hexColors = hex.offenders;

  const accents = findOccurrences(root, files, OFF_BRAND_ACCENT_UTILITY);
  counts.offBrandAccents = accents.count;
  offenders.offBrandAccents = accents.offenders;

  const inline = findOccurrences(root, files, INLINE_STYLE);
  counts.inlineStyles = inline.count;
  offenders.inlineStyles = inline.offenders;

  const dialogs = findOccurrences(root, files, NATIVE_DIALOGS);
  counts.nativeDialogs = dialogs.count;
  offenders.nativeDialogs = dialogs.offenders;

  const inert = {
    count: 0,
    offenders: /** @type {string[]} */ ([]),
  };
  for (const [label, pattern] of Object.entries(INERT_TOKENS)) {
    const found = findOccurrences(root, files, pattern);
    inert.count += found.count;
    inert.offenders.push(...found.offenders.map((o) => `${o} [${label}]`));
  }
  counts.inertTokens = inert.count;
  offenders.inertTokens = inert.offenders;

  const unresolvedTokens = await unresolvedTokenUtilities(root);
  counts.unresolvedTokenUtilities = unresolvedTokens.count;
  offenders.unresolvedTokenUtilities = unresolvedTokens.offenders;

  const srcText = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const sheet = auditStylesheet(root, srcText);

  counts.importantOverrides = sheet.importantOverrides.count;
  offenders.importantOverrides = sheet.importantOverrides.offenders;
  counts.recolorRules = sheet.recolorRules.count;
  offenders.recolorRules = sheet.recolorRules.offenders;
  counts.deadUtilities = sheet.deadUtilities.count;
  offenders.deadUtilities = sheet.deadUtilities.offenders;

  const unresolved = sheet.imports.filter((i) => !i.resolves);
  const v4Only = sheet.imports.filter((i) => i.v4Only);
  counts.unresolvedCssImports = unresolved.length;
  offenders.unresolvedCssImports = unresolved.map((i) => `${STYLESHEET}:${i.line} ${i.specifier}`);
  counts.v4OnlyCssImports = v4Only.length;
  offenders.v4OnlyCssImports = v4Only.map((i) => `${STYLESHEET}:${i.line} ${i.specifier}`);

  // Per-area breakdown, for sizing a phase before starting it.
  const areaKeys = ['rawButtons', 'rawInputs', 'rawSelects', 'rawTables', 'hexColors', 'inlineStyles', 'nativeDialogs'];
  const areas = new Map();
  for (const abs of files) {
    const rel = toRel(root, abs);
    const area = areaOf(rel);
    if (!areas.has(area)) {
      areas.set(area, { area, files: 0, lines: 0, rawButtons: 0, rawInputs: 0, rawSelects: 0, rawTables: 0, hexColors: 0, inlineStyles: 0, nativeDialogs: 0 });
    }
    const row = /** @type {Record<string, number | string>} */ (areas.get(area));
    const text = fs.readFileSync(abs, 'utf8');
    row.files = Number(row.files) + 1;
    row.lines = Number(row.lines) + text.split(/\r?\n/).length;
    for (const key of areaKeys) {
      const pattern = RAW_ELEMENTS[key] ?? (key === 'hexColors' ? HEX_COLOR : key === 'inlineStyles' ? INLINE_STYLE : NATIVE_DIALOGS);
      // Same exclusions as the totals above, or the table and the ratchet would
      // disagree about the same file.
      if (RAW_ELEMENTS[key] && !isOutsideKit(rel)) continue;
      if (key === 'hexColors' && HEX_COLOR_EXEMPT.includes(rel)) continue;
      const perFile = new RegExp(pattern.source, pattern.flags);
      const source = blankComments(text);
      row[key] = Number(row[key]) + [...source.matchAll(perFile)].length;
    }
  }

  return {
    counts,
    offenders,
    areas: [...areas.values()].sort((a, b) => Number(b.lines) - Number(a.lines)),
    imports: sheet.imports,
  };
}

/**
 * Compare a measurement against the recorded `ui` allowances.
 *
 * Shared by the CLI's `--check` and by guardrail G20 so the local command and CI
 * can never disagree about what "over budget" means.
 *
 * @param {Record<string, number>} counts
 * @param {Record<string, number>} allowances the `ui` block of allowances.json
 * @returns {Array<{ key: string, actual: number, allowed: number }>}
 */
export function ratchetFailures(counts, allowances) {
  const failures = [];
  for (const { key } of UI_METRICS) {
    const actual = counts[key] ?? 0;
    const allowed = allowances[key];
    if (typeof allowed !== 'number') continue;
    if (actual > allowed) failures.push({ key, actual, allowed });
  }
  return failures;
}

/** Repo-relative path helper for callers that already hold a root. */
export { normalize };
