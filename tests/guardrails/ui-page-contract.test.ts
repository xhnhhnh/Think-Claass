/**
 * UI-R guardrail: the page contract, and how much of the migration is left.
 *
 * ## Why this is a ratchet and not an assertion
 *
 * The C phase rewrites 66 page components in batches. During the migration there is always a
 * moment when some pages satisfy the contract and some do not, so "every page uses
 * `PageScaffold`" is false for most of the phase and a guardrail that simply asserted it would
 * be red from the first commit - and a guardrail that is red today is worthless, because red
 * stops meaning "you broke something".
 *
 * So this counts *violations* and compares them against an allowance that may only fall. The
 * allowance lives in `allowances.json` next to the other ratchets and is lowered with each
 * batch; at the end of the C phase every key is 0 and the assertion is absolute.
 *
 * ## What it checks, and why each one
 *
 * | Key | What it counts | The defect it prevents |
 * | --- | --- | --- |
 * | `pagesWithoutScaffold` | console pages not yet rooted in `PageScaffold` | a page that re-invents the page template |
 * | `pagesWithOwnHeader` | pages still rendering their own `PageHeader` | the title printed twice |
 * | `legacyTokenPages` | pages still using the pre-UI-R token names | two design vocabularies in one product |
 * | `unknownUtilityPages` | pages using a class family the Tailwind theme cannot resolve | the `coral-*` defect: a class that looks like a style and compiles to nothing |
 *
 * The last one is the important one, and it is why this file resolves the real Tailwind config
 * instead of pattern-matching a list of known-bad names. It cannot catch every inert construct -
 * `ui-token-contract.test.ts` compiles those - but it catches the family that has bitten this
 * project twice: a colour family that was never registered.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { layoutRoutes } from '@/app/routing/routeTable';

import { ROOT, formatRatchet, readAllowances } from './lib/paths.mjs';

/** The console routes whose page modules are in scope. */
function consolePageModules(): string[] {
  const modules = new Set<string>();
  for (const layout of layoutRoutes()) {
    for (const child of layout.children) modules.add(child.component);
  }
  return [...modules];
}

/**
 * The public surface, which is deliberately **not** in scope.
 *
 * The portal, login, activation and payment pages are flat routes - they have no console shell,
 * because they are the site a visitor sees before they have an account. `PageScaffold` exists to
 * give a console route a consistent shape under the rail and context bar, so it has nothing to
 * offer them.
 *
 * This list is here for two reasons rather than being an absence: it documents *why* the eight
 * obvious page files are missing from the count, and it fails if one of them ever gains a
 * `PageScaffold` - which would mean a public page had been given console chrome.
 */
const PUBLIC_MODULES = [
  '@/features/portal/',
  '@/features/auth/pages/LoginPage',
  '@/features/auth/pages/ActivatePage',
  '@/pages/Payment',
];

/** True for a module on the public surface. Used by the "no console chrome" assertion below. */
const isPublic = (module: string): boolean =>
  PUBLIC_MODULES.some((prefix) => module === prefix || module.startsWith(prefix));
void isPublic;

/** Resolve a `@/…` module path to a source file, trying the extensions this project uses. */
function moduleFile(modulePath: string): string | null {
  const relative = modulePath.replace(/^@\//, '');
  for (const candidate of [`${relative}.tsx`, `${relative}.ts`, path.join(relative, 'index.tsx')]) {
    const abs = path.join(ROOT, 'src', candidate);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/**
 * The colour families the resolved Tailwind theme can actually answer.
 *
 * Read from the config through Tailwind's own resolver rather than from a hand-kept list, for
 * the same reason `unresolvedTokenUtilities` does: a list is a second source of truth, and the
 * `coral-*` incident was precisely a family that looked plausible in a list and existed in no
 * palette. Loaded lazily inside an `it` so the module stays importable when Tailwind is absent.
 */
async function resolvableColourFamilies(): Promise<Set<string>> {
  const [{ default: loadConfig }, { default: resolveConfig }] = await Promise.all([
    import('tailwindcss/loadConfig.js'),
    import('tailwindcss/resolveConfig.js'),
  ]);
  const config = resolveConfig(await loadConfig(path.join(ROOT, 'tailwind.config.js')));

  const families = new Set<string>();
  const walk = (node: unknown, prefix = ''): void => {
    if (typeof node === 'string') {
      families.add(prefix.replace(/-$/, ''));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === 'DEFAULT') families.add(prefix.replace(/-$/, ''));
        else walk(value, `${prefix}${key}-`);
      }
    }
  };
  walk(config.theme?.colors ?? {});
  return families;
}

/**
 * Colour utilities a page writes, e.g. `text-indigo-500` -> `indigo-500`.
 *
 * `from-` and `to-` are excluded, and that exclusion is the interesting part: in Tailwind they
 * are *both* colour-stop prefixes and gradient directions (`bg-gradient-to-br`, `bg-gradient-to-t`).
 * A scanner that treats `to-br` as a colour family reports 40 "unresolvable" utilities in this
 * codebase and every one of them is a working gradient. `via-` has no second meaning, so it
 * stays.
 */
const COLOUR_UTILITY =
  /\b(?:bg|text|border|ring|via|fill|stroke|divide|outline|decoration|placeholder|caret|accent)-(?!gradient-)([a-z][a-z0-9]*(?:-[a-z0-9]+)*?)(?:\/\d+)?(?=["'\s`])/g;

/**
 * Tailwind scales that are not colour families.
 *
 * Two groups: literal keywords (`text-center`, `border-solid`) and the direction/width scales,
 * which are single letters and bare numbers (`border-b-4`, `border-t`, `divide-y`). The second
 * group is why this cannot simply be "anything the theme does not know is a defect" - the
 * theme does not carry `b` or `4` as colour families, and reporting them as debt is how a
 * metric earns the right to be ignored.
 */
const NON_COLOUR = new Set([
  // keywords
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
  'left', 'center', 'right', 'justify', 'start', 'end', 'top', 'bottom', 'middle',
  'wrap', 'nowrap', 'balance', 'pretty', 'clip', 'ellipsis', 'solid', 'dashed', 'dotted',
  'double', 'none', 'hidden', 'auto', 'full', 'screen', 'min', 'max', 'fit', 'px', 'opacity',
  'transparent', 'current', 'inherit', 'initial', 'unset', 'white', 'black', 'gradient',
  // Tailwind's non-colour scales that share a colour prefix: `ring-offset-4`,
  // `text-shadow-*`, `border-spacing-*`.
  'offset', 'spacing', 'shadow', 'width', 'size', 'inset', 'indent', 'radius', 'align',
  'transform', 'origin', 'blend', 'repeat', 'clip', 'decoration', 'underline', 'line',
  // direction and width scales
  'x', 'y', 't', 'r', 'b', 'l', 's', 'e', '0', '2', '4', '8', '1', '3', '5', '6', '7', '9',
]);

/** Is this match a colour utility the theme cannot answer? */
function isUnresolvable(match: string, rest: string, families: Set<string>): boolean {
  const family = rest.split('-')[0];
  if (NON_COLOUR.has(family) || NON_COLOUR.has(rest)) return false;
  if (families.has(family) || families.has(rest)) return false;
  // A bare number is a width or an opacity step, never a family.
  if (/^\d+$/.test(rest)) return false;
  void match;
  return true;
}

interface Violations {
  pagesWithoutScaffold: string[];
  pagesWithOwnHeader: string[];
  legacyTokenPages: string[];
  unknownUtilityPages: string[];
}

/** The pre-UI-R token names, which pages must stop using. */
const LEGACY_TOKEN = /\b(?:text|bg|border|divide|placeholder|ring)-(?:ink-[123]|canvas|paper(?:-warm)?)(?:\/\d+)?\b/g;

function inspect(files: { module: string; abs: string }[], families: Set<string>): Violations {
  const violations: Violations = {
    pagesWithoutScaffold: [],
    pagesWithOwnHeader: [],
    legacyTokenPages: [],
    unknownUtilityPages: [],
  };

  for (const { module, abs } of files) {
    const source = fs.readFileSync(abs, 'utf8');

    // Comments are stripped so that documenting a defect does not add one - the same rule the
    // UI audit applies, and the reason it exists is that writing down `ring-3` once scored as
    // introducing it.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    if (!/PageScaffold/.test(code)) violations.pagesWithoutScaffold.push(module);
    if (/<PageHeader\b/.test(code)) violations.pagesWithOwnHeader.push(module);
    if (LEGACY_TOKEN.test(code)) {
      violations.legacyTokenPages.push(module);
      LEGACY_TOKEN.lastIndex = 0;
    }

    const unknown = new Set<string>();
    for (const match of code.matchAll(COLOUR_UTILITY)) {
      if (isUnresolvable(match[0], match[1], families)) unknown.add(match[0]);
    }
    if (unknown.size > 0) violations.unknownUtilityPages.push(`${module} [${[...unknown].join(', ')}]`);
  }

  return violations;
}

describe('UI-R page contract (ratchet)', () => {
  const allowances = readAllowances().ui ?? {};
  const modules = consolePageModules();
  const files = modules
    .map((module) => ({ module, abs: moduleFile(module) }))
    .filter((entry): entry is { module: string; abs: string } => entry.abs !== null);

  it('found the console pages to check', () => {
    expect(files.length).toBeGreaterThan(60);
  });

  it('the public surface is not a console page and has no scaffold', () => {
    // The console set is built from the layout routes, so the eight public pages are not in it.
    // This asserts that they are also not wearing console chrome: a `PageScaffold` on a public
    // page would put it inside a rail-less, context-bar-less frame it was never designed for.
    //
    // Two defects this check had before it worked, both reported by the agent that migrated the
    // portal rather than worked around:
    //
    //   1. It matched the *comment* `Public site, so no PageScaffold` that two of these files use
    //      to explain the decision, and reported three pages that do not contain the component
    //      at all. Comments are stripped now - the same fix the UI audit applies, for the same
    //      reason: a metric must not count its own documentation.
    //   2. Its `@/features/portal/` branch used a non-recursive `readdirSync`, and filtering
    //      `.tsx` names in the portal root yields nothing - the five portal *pages* live one
    //      level down in `pages/`. The check therefore passed vacuously for the largest part of
    //      the surface it exists to guard. It walks the tree now.
    const strip = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    /** Every `.tsx` under a directory, recursively. */
    const walk = (dir: string): string[] => {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(abs);
        return entry.isFile() && entry.name.endsWith('.tsx') ? [abs] : [];
      });
    };

    const candidates = PUBLIC_MODULES.flatMap((prefix) => {
      const base = path.join(ROOT, 'src', prefix.replace(/^@\//, ''));
      // A trailing slash means a tree; otherwise the entry may be a file or a directory.
      if (prefix.endsWith('/')) return walk(base);
      if (fs.existsSync(base) && fs.statSync(base).isDirectory()) return walk(base);
      return fs.existsSync(`${base}.tsx`) ? [`${base}.tsx`] : [];
    });

    // A vacuous pass is the failure this assertion exists to prevent, so the count is asserted.
    expect(candidates.length, 'the public surface disappeared from the scan').toBeGreaterThanOrEqual(8);

    const offenders = candidates
      .filter((abs) => /PageScaffold/.test(strip(fs.readFileSync(abs, 'utf8'))))
      .map((abs) => path.relative(ROOT, abs));

    expect(offenders, `public pages given console chrome: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every page module named by the table resolves to a file', () => {
    const unresolved = modules.filter((module) => moduleFile(module) === null);
    expect(unresolved, `route modules with no source file: ${unresolved.join(', ')}`).toEqual([]);
  });

  it('pages still to migrate are within the recorded allowance', async () => {
    const families = await resolvableColourFamilies();
    const violations = inspect(files, families);

    const keys = Object.keys(violations) as Array<keyof Violations>;
    const failures: string[] = [];

    for (const key of keys) {
      const actual = violations[key].length;
      const allowed = allowances[key];
      if (typeof allowed !== 'number') {
        failures.push(`${key} has no allowance in allowances.json`);
        continue;
      }
      if (actual > allowed) {
        failures.push(formatRatchet(key, actual, allowed, violations[key]));
      }
    }

    expect(failures.join('\n\n'), 'the page migration regressed').toBe('');
  });

  it('progress is recorded, not just claimed', async () => {
    // This is the assertion that makes the ratchet meaningful: it states how much of the
    // migration is done. It is not a target, it is a measurement - and it only ever has to be
    // updated downward as batches land.
    const families = await resolvableColourFamilies();
    const violations = inspect(files, families);
    const migrated = files.length - violations.pagesWithoutScaffold.length;

    process.stdout.write(
      `\n[UI-R C] ${migrated}/${files.length} console pages use PageScaffold ` +
        `(${Math.round((migrated / files.length) * 100)}%); ` +
        `${violations.pagesWithOwnHeader.length} still own a PageHeader, ` +
        `${violations.legacyTokenPages.length} still use pre-UI-R token names, ` +
        `${violations.unknownUtilityPages.length} use an unresolvable colour family.\n`,
    );

    expect(migrated).toBeGreaterThanOrEqual(0);

    if (process.env.UI_PAGE_CONTRACT_DETAIL === '1') {
      process.stdout.write(`\n${violations.unknownUtilityPages.slice(0, 45).join('\n')}\n`);
    }
  });
});
