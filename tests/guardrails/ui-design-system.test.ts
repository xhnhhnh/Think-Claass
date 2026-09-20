/**
 * G20 - the UI layer must keep converging on one token set and one component kit.
 *
 * Why this guardrail exists at all: the front end has a component layer
 * (`src/components/ui/**`) that pages almost never import, and a look maintained
 * by 14 `!important` overrides in `src/index.css` plus a block that repaints every
 * `indigo-*`/`violet-*` class green. Nothing failed when that balance was reached,
 * so nothing stopped it from getting worse - which is the same failure mode the
 * migration guardrails G1-G19 exist to prevent on the backend.
 *
 * The measurements live in `scripts/migration/lib/ui-audit.mjs` and are ratcheted
 * against the `ui` block of `allowances.json`: a number may only go down, and the
 * allowance may never exceed the measurement it was first recorded from. Every
 * failure prints the offending `path:line` list, because a ratchet nobody can act
 * on is a ratchet nobody lowers.
 *
 * The second half of this file is about a defect the audit cannot express as a
 * count. The component layer was generated for Tailwind v4 while the project runs
 * Tailwind 3.4.19, so `ring-3`, `has-data-*`, `not-aria-*`, `animate-in`,
 * `fade-in` and `font-heading` compile to nothing - the focus rings and the card
 * titles have simply never rendered. `it('the kit's contracted utilities compile')`
 * compiles a raw source through the project's own Tailwind config, so "this class
 * is inert" is a test result rather than a reading of the source.
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

import {
  UI_METRICS,
  auditUi,
  ratchetFailures,
  uiSourceFiles,
} from '../../scripts/migration/lib/ui-audit.mjs';
import { ROOT, formatRatchet, readAllowances } from './lib/paths.mjs';

const report = await auditUi(ROOT);
const ui = readAllowances().ui ?? {};

/**
 * Ceilings that the allowance itself may never exceed.
 *
 * These are the P0 (UI-refactor baseline) measurements. The `deadCode`-style
 * problem this prevents: an allowance edited upward to turn a red guardrail green
 * would leave the ratchet measuring nothing.
 */
const HARD_CAPS = {
  rawButtons: 263,
  rawInputs: 96,
  rawSelects: 27,
  rawTables: 13,
  hexColors: 67,
  inlineStyles: 18,
  nativeDialogs: 14,
  importantOverrides: 14,
  recolorRules: 9,
  inertTokens: 74,
  unresolvedTokenUtilities: 8,
  deadUtilities: 6,
  unresolvedCssImports: 1,
  v4OnlyCssImports: 1,
};

/**
 * Utilities the component layer's visual contract depends on.
 *
 * Curated rather than inferred: a heuristic ("every class-looking token must
 * compile") produces false positives from variant names, `data-slot` values and
 * prose, and a noisy guardrail gets switched off. The `inertTokens` ratchet covers
 * the constructs this list does not name, and `unresolvedTokenUtilities` covers
 * the tokens the theme does not expose - which is why `bg-card` and
 * `text-card-foreground` are absent here until P1 registers them.
 *
 * P1 extends this list with the semantic tokens it introduces.
 */
const CONTRACT_UTILITIES = [
  // semantic colours
  'bg-background',
  'text-foreground',
  'bg-primary',
  'text-primary-foreground',
  'bg-secondary',
  'text-secondary-foreground',
  'bg-destructive/10',
  'text-destructive',
  'text-muted-foreground',
  'border-border',
  'border-input',
  'ring-ring',
  'bg-muted/45',
  // shape, type, motion
  'rounded-lg',
  'shadow-sm',
  'font-semibold',
  'whitespace-nowrap',
  'transition-colors',
  // layout values the kit's sizes rely on
  'h-9',
  'size-4',
  'size-8',
  'px-3',
  'gap-1.5',
  // variants the kit uses for state
  'placeholder:text-muted-foreground',
  'focus-visible:ring-2',
  'disabled:opacity-50',
  // default palette the kit leans on for table text
  'bg-white',
  'text-slate-600',
];

/**
 * Constructs the project's Tailwind version cannot compile.
 *
 * This list is the premise of the `inertTokens` metric: if one of these ever
 * starts producing CSS, the metric is counting something harmless and must be
 * corrected rather than lowered. It happened once already - the named-group form
 * `group-data-[size=sm]/card:px-3` was on this list and in the metric until this
 * test compiled it and showed `.group\/card[data-size="sm"] ...`.
 */
const INERT_CONSTRUCTS = [
  'ring-3',
  'not-aria-[haspopup]:translate-y-px',
  'has-data-[slot=card-footer]:pb-0',
  '*:[img:first-child]:rounded-t-lg',
  '@container/card-header',
  'animate-in',
  'fade-in',
  'slide-in-from-top-2',
  'font-heading',
];

/** Compile class names through the project's own Tailwind config. */
async function compile(classNames: string[]): Promise<string> {
  const config = await loadConfig(path.join(ROOT, 'tailwind.config.js'));
  // `block` is there to keep Tailwind from warning that the raw source yielded no
  // candidates: the inert-construct list is *expected* to compile to nothing, and
  // that warning on every run is how a real warning gets ignored.
  const raw = `<div class="block ${classNames.join(' ')}"></div>`;

  const result = await postcss([
    // The content is replaced, not merged: scanning the real tree here would make
    // the result depend on which pages happen to exist.
    tailwindcss({ ...config, content: [{ raw, extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined });

  // Tailwind escapes the selector (`.bg-destructive\/10`); dropping the escapes
  // lets one comparison cover every punctuation case without re-implementing it.
  return result.css.replace(/\\/g, '');
}

describe('G20 UI debt ratchets', () => {
  it('the audit actually found source files', () => {
    // An empty scan would make every ratchet below vacuously green.
    expect(uiSourceFiles(ROOT).length).toBeGreaterThan(100);
  });

  it('every metric has an allowance', () => {
    const missing = UI_METRICS.map((m) => m.key).filter((key) => typeof ui[key] !== 'number');
    expect(missing, `allowances.json is missing the ui entries: ${missing.join(', ')}`).toEqual([]);
  });

  for (const { key, label } of UI_METRICS) {
    it(`${key} stays within its allowance (${label})`, () => {
      const actual = report.counts[key] ?? 0;
      const allowed = ui[key];
      expect(
        actual,
        formatRatchet(`ui ${label}`, actual, allowed, report.offenders[key] ?? []),
      ).toBeLessThanOrEqual(allowed);
    });
  }

  it('no allowance exceeds the measurement it was recorded from', () => {
    const inflated = UI_METRICS.map((m) => m.key).filter(
      (key) => typeof ui[key] === 'number' && ui[key] > (HARD_CAPS[key as keyof typeof HARD_CAPS] ?? 0),
    );
    expect(
      inflated,
      'these allowances were raised above the baseline measurement, which would make the ratchet vacuous',
    ).toEqual([]);
  });

  it('the reported failures and the ratchet agree', () => {
    // `npm run ui:audit:check` calls the same helper, so this pins that the local
    // command and CI cannot disagree about what "over budget" means.
    expect(ratchetFailures(report.counts, ui)).toEqual([]);
  });
});

describe('G20 the component layer compiles', () => {
  it("the kit's contracted utilities compile", async () => {
    const css = await compile(CONTRACT_UTILITIES);
    const missing = CONTRACT_UTILITIES.filter((name) => !css.includes(`.${name}`));

    expect(
      missing,
      `these utilities produced no CSS, so the component layer renders without them: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the constructs the inert-token ratchet counts really are inert', async () => {
    const css = await compile(INERT_CONSTRUCTS);
    const alive = INERT_CONSTRUCTS.filter((name) => css.includes(`.${name}`));

    expect(
      alive,
      'these constructs compile after all, so the inertTokens metric is counting harmless code and must be corrected: ' +
        alive.join(', '),
    ).toEqual([]);
  });

  it('the stylesheet has imports for the import ratchet to check', () => {
    expect(report.imports.length).toBeGreaterThan(0);
  });
});
