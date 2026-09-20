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
  offBrandAccents: 790,
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
 * the tokens the theme does not expose.
 *
 * P1 added the second half of this list: the semantic tokens and the v3 spellings
 * that replaced the v4 constructs the kit shipped with. Each entry here is a class
 * the kit or a migrated page actually writes, so a token rename that forgets the
 * config fails this test rather than the browser.
 */
const CONTRACT_UTILITIES = [
  // semantic colours
  'bg-background',
  'text-foreground',
  'bg-card',
  'text-card-foreground',
  'bg-popover',
  'text-popover-foreground',
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
  'bg-canvas',
  'text-ink-1',
  'text-ink-2',
  'text-ink-3',
  'bg-paper-warm',
  'text-success',
  'text-warning',
  'text-info',
  // shape, elevation, motion
  'rounded-lg',
  'rounded-card',
  'rounded-panel',
  'rounded-pill',
  'shadow-sm',
  'shadow-card',
  'shadow-raised',
  'shadow-floating',
  'font-heading',
  'animate-fade-in',
  'animate-fade-out',
  'animate-zoom-in',
  'animate-zoom-out',
  'animate-slide-in-top',
  'animate-slide-in-bottom',
  'animate-slide-in-left',
  'animate-slide-in-right',
  // written in six student pages before it existed anywhere; P8 made it real
  'animate-blob',
  // type and layout values the kit's sizes rely on
  'font-semibold',
  'whitespace-nowrap',
  'transition-colors',
  'h-9',
  'size-4',
  'size-8',
  'px-3',
  'gap-1.5',
  'bg-white',
  'text-slate-600',
  // variants the kit uses for state, in the v3 spellings P1 introduced
  'placeholder:text-muted-foreground',
  'focus-visible:ring-2',
  'focus-visible:ring-[3px]',
  'disabled:opacity-50',
  'data-[open]:animate-fade-in',
  'data-[closed]:animate-fade-out',
  'supports-[backdrop-filter]:backdrop-blur-sm',
  'has-[[data-slot=card-footer]]:pb-0',
  'has-[[data-icon=inline-end]]:pr-1.5',
  'group-has-[[disabled]]:opacity-50',
  'data-[inset]:pl-7',
  'data-[side=bottom]:animate-slide-in-top',
  'max-h-[var(--available-height)]',
  'w-[var(--anchor-width)]',
  'origin-[var(--transform-origin)]',
  'active:[&:not([aria-haspopup])]:translate-y-px',
  '[[data-slot=button-group]_&]:rounded-lg',
  '[&.border-b]:pb-4',
  '[&>img:first-child]:rounded-t-lg',
  '[&_a]:underline-offset-[3px]',
  '[&>svg]:!size-3',
  // P2: the kit components the page families now compose from
  "after:content-['*']",
  'bg-primary/5',
  'bg-success/10',
  'text-success',
  'bg-warning/10',
  'text-warning',
  'bg-info/10',
  'text-info',
  'border-dashed',
  'bg-white/70',
  'text-ink-1',
  'rounded-md',
  'animate-pulse',
  'animate-spin',
  // P4: the console's list/dashboard kit
  'bg-muted/40',
  'bg-muted/60',
  'bg-destructive/5',
  'bg-destructive/10',
  'border-destructive/20',
  'border-destructive/30',
  'border-warning/30',
  'border-info/30',
  'text-primary/80',
  'tracking-tight',
  'truncate',
];

/**
 * Constructs the project's Tailwind version cannot compile.
 *
 * This list is the premise of the `inertTokens` metric: if one of these ever
 * starts producing CSS, the metric is counting something harmless and must be
 * corrected rather than lowered. That has happened once: the named-group form
 * `group-data-[size=sm]/card:px-3` was on this list and in the metric until this
 * test compiled it and showed `.group\/card[data-size="sm"] ...` - v3.4 supports it.
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
  'data-open:animate-in',
  'data-disabled:opacity-50',
  'max-h-(--available-height)',
  'supports-backdrop-filter:backdrop-blur-xs',
  'outline-hidden',
  'not-data-[variant=destructive]:text-destructive',
  'group-has-disabled/field:opacity-50',
  'rounded-4xl',
  'size-3!',
  // P5: what a bulk colour swap produces when the replacement carries its own opacity
  'bg-muted/50/70',
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
