/**
 * UI-R guardrail: the token contract must be real, not merely written down.
 *
 * This is the successor to G20's "the kit's contracted utilities compile" half.
 * The defect it exists to prevent is the one this project has now hit twice: a
 * class name that looks like a style, is written in good faith, and compiles to
 * nothing. Round one was Tailwind v4 syntax (`ring-3`, `data-open:`, `animate-in`)
 * in a v3 project, so focus rings and dialog entrances silently never rendered.
 * Round two was `bg-coral-400` and `animate-blob` in pages, families that were
 * never registered and keyframes that were never defined.
 *
 * A ratchet cannot catch that class of defect, because the measurement counts
 * what is written rather than what compiles. So this file compiles: every class
 * the token layer promises is rendered through the project's own Tailwind config
 * and asserted to produce CSS.
 *
 * Two lists, two failure meanings:
 *
 *   - `TOKEN_UTILITIES` failing means the token layer is broken - a variable was
 *     renamed, a palette key was dropped, or `tailwind.config.js` and
 *     `src/index.css` have drifted apart.
 *   - `INERT_CONSTRUCTS` appearing in the output means this file is testing
 *     nothing, because those constructs are the ones that are supposed to be
 *     dead. If one starts compiling, the premise has changed and the list must be
 *     re-derived rather than deleted.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig.js';

import { ROOT } from './lib/paths.mjs';

/**
 * Every utility the UI-R layer depends on.
 *
 * Grouped by the tier it comes from, because a failure tells you which file to
 * open: the product palette, the role accent, the shape/elevation/geometry
 * scale, and the animation set the shell's own transitions use.
 */
const TOKEN_UTILITIES = [
  // --- tier 1: product palette --------------------------------------------
  'bg-brand',
  'text-brand',
  'bg-brand-strong',
  'bg-brand-soft',
  'text-brand-contrast',
  'text-fg-1',
  'text-fg-2',
  'text-fg-3',
  'bg-surface-1',
  'bg-surface-2',
  'bg-surface-3',
  'bg-surface-4',
  'bg-surface-steel',
  'border-line-1',
  'border-line-2',
  'border-line-strong',
  'bg-surface-2/85',
  'bg-surface-3/50',

  // --- status, with the three-step scale a badge needs ---------------------
  'text-success',
  'bg-success-soft',
  'text-success-ink',
  'text-warning',
  'bg-warning-soft',
  'text-warning-ink',
  'text-info',
  'bg-info-soft',
  'text-info-ink',
  'text-danger',
  'bg-danger-soft',
  'text-danger-ink',
  'border-danger/30',
  'text-chart-1',

  // --- tier 2: role accent -------------------------------------------------
  'bg-role',
  'text-role',
  'bg-role-soft',
  'text-role-ink',
  'text-role-contrast',
  'border-role/30',
  'bg-role/10',
  'ring-role',

  // --- tier 3: shape, elevation, shell geometry ---------------------------
  'rounded-xs',
  'rounded-card',
  'rounded-panel',
  'rounded-sheet',
  'rounded-pill',
  'shadow-card',
  'shadow-raised',
  'shadow-floating',
  'shadow-inset',
  'shadow-rail-right',
  'shadow-bar-bottom',
  'shadow-dock-top',
  'shadow-glow-role',
  'h-bar',
  'w-rail',
  'w-rail-collapsed',
  'h-dock',
  'h-control',
  'h-control-lg',
  'h-control-sm',
  'max-w-page',
  'duration-fast',
  'duration-base',
  'ease-soft',

  // --- the animation set ---------------------------------------------------
  'animate-fade-in',
  'animate-fade-out',
  'animate-zoom-in',
  'animate-zoom-out',
  'animate-slide-in-top',
  'animate-enter-up',
  'animate-enter-down',
  'animate-enter-scale',
  'animate-exit-down',
  'animate-sheet-in',
  'animate-rail-in',
  'animate-pop-in',
  'animate-blob',
];

/**
 * Utilities `src/index.css` declares itself.
 *
 * Checked against the stylesheet rather than through Tailwind, because that is
 * where they live: the compile step above only sees `@tailwind` directives, not
 * the `@layer utilities` blocks. Keeping them in a separate list is what makes
 * "this class is missing" a statement about the right file.
 */
const DECLARED_UTILITIES = ['glass', 'scrollbar-hide', 'pb-safe', 'pt-safe', 'pb-dock'];

/**
 * Constructs Tailwind 3.4 cannot compile.
 *
 * These are here to prove the list above is not vacuous: if Tailwind ever starts
 * emitting one of them, the "it is inert" premise needs re-deriving (this has
 * happened once already in this project, when `group-data-[size=sm]/card:px-3`
 * turned out to compile fine).
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
  'rounded-4xl',
  'size-3!',
  'bg-surface-1/50/70',
  // Families that were never registered in this project, which is why the
  // parent area's filled buttons had no background for months.
  'bg-coral-400',
  'text-coral-500',
  'border-coral-100',
];

/**
 * Classes Tailwind 3.4 does support, whatever they look like.
 *
 * This list exists because the `inertTokens` metric has now been wrong about its own
 * subject twice: `group-data-[size=sm]/card:px-3` was counted as inert and compiles, and
 * the `v4-only scale value` pattern counted `rounded-xs` and `size-control` as v4-only.
 * Both suspicions are false -
 *
 *   - `rounded-xs` resolves through `theme.borderRadius.xs` in `tailwind.config.js`;
 *   - `size-*` arrived in 3.4 and takes anything in `spacing`, including the
 *     `size-control` control-height tokens.
 *
 * Asserting them beside the inert list is what keeps "we think this is dead" a
 * measurement rather than a belief. If the project ever leaves 3.4, this is the list that
 * says which of its assumptions moved.
 */
const V3_4_SUPPORTED_BUT_SUSPICIOUS = [
  'rounded-xs',
  'size-control',
  'size-control-xs',
  'h-control',
  'size-5',
  'group-data-[size=sm]/card:px-3',
  'has-[>img:first-child]:pt-0',
];

/** Compile class names through the project's own Tailwind config. */
async function compile(classNames: string[]): Promise<string> {
  const config = await loadConfig(path.join(ROOT, 'tailwind.config.js'));
  // `block` keeps Tailwind from warning that the raw source yielded no
  // candidates: the inert list is expected to compile to nothing, and that
  // warning on every run is how a real warning gets ignored.
  const raw = `<div class="block ${classNames.join(' ')}"></div>`;

  const result = await postcss([
    // The content is replaced, not merged: scanning the real tree would make
    // the result depend on which pages happen to exist.
    tailwindcss({ ...config, content: [{ raw, extension: 'html' }] }),
  ]).process('@tailwind utilities;\n@tailwind components;', { from: undefined });

  // Tailwind escapes selectors (`.bg-role\/10`); dropping escapes lets one
  // comparison cover every punctuation case without re-implementing it.
  return result.css.replace(/\\/g, '');
}

describe('UI-R token contract', () => {
  it('every token utility the layer promises compiles', async () => {
    const css = await compile(TOKEN_UTILITIES);
    const missing = TOKEN_UTILITIES.filter((name) => !css.includes(`.${name}`));

    expect(
      missing,
      `these utilities produced no CSS, so the token layer is not real: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the constructs that must stay inert really are', async () => {
    const css = await compile(INERT_CONSTRUCTS);
    const alive = INERT_CONSTRUCTS.filter((name) => css.includes(`.${name}`));

    expect(
      alive,
      'these constructs compile after all, so the inert-construct premise is wrong and must be re-derived: ' +
        alive.join(', '),
    ).toEqual([]);
  });

  it('the constructs assumed dead but actually supported do compile', async () => {
    const css = await compile(V3_4_SUPPORTED_BUT_SUSPICIOUS);
    const dead = V3_4_SUPPORTED_BUT_SUSPICIOUS.filter((name) => !css.includes(`.${name}`));

    expect(
      dead,
      'these are treated as working v3.4 utilities by the kit, but produce no CSS: ' + dead.join(', '),
    ).toEqual([]);
  });

  it('the role accent is a scope, not a second palette', async () => {
    const css = await compile(['bg-role', 'bg-surface-2', 'text-fg-1']);

    // The accent vars are what `[data-role]` overrides, so they must appear as
    // variables rather than as baked colours. A literal here would mean the
    // accent was resolved at build time and `data-role` would do nothing.
    expect(css).toContain('hsl(var(--role))');
    expect(css).toContain('hsl(var(--surface-2))');
  });

  it('every utility the stylesheet declares itself is really there', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
    const missing = DECLARED_UTILITIES.filter((name) => !source.includes(`.${name}`));

    expect(
      missing,
      `these utilities are claimed by the layer but declared in no stylesheet: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the role scopes and the dark palette both exist', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

    for (const role of ['teacher', 'student', 'parent', 'admin']) {
      expect(source, `no [data-role='${role}'] scope in index.css`).toContain(`[data-role='${role}']`);
    }
    // Both halves of dark mode: the shared palette and the four lifted accents.
    // A dark palette without its accents is the state this replaces - accents
    // that are illegible on a dark surface because they were only derived once.
    expect(source).toContain('\n  .dark {');
    expect(source).toContain(".dark[data-role='student']");
  });

  it('the pre-UI-R compatibility layer is aliases, not a second palette', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

    // `--primary` and friends may only forward to a tier above them. A literal
    // value here means the alias layer silently kept the old design alive.
    expect(source).toMatch(/--primary:\s*var\(--role\)/);
    expect(source).toMatch(/--canvas:\s*var\(--surface-1\)/);
    expect(source).toMatch(/--ink-1:\s*var\(--fg-1\)/);

    // And the `--campus-*` layer is gone for good: it existed so pages could
    // migrate one phase at a time, and both the pages and the layer are now
    // out of scope for this refactor.
    expect(source).not.toContain('--campus-');
  });

  it('the stylesheet never uses @apply for a theme colour', () => {
    /*
     * The defect this guards, and why it earns a test of its own:
     *
     * `@apply` inside this project's stylesheet is resolved by PostCSS **before** Tailwind has
     * published `theme.extend`, so a project colour is not known yet and the stylesheet fails.
     * Vite's dev pipeline reported it as ``The `bg-surface-1` class does not exist`` and then
     * served an empty `#root` on every route - while `npm run build` succeeded and emitted
     * correct CSS. The build was green and the application was blank.
     *
     * The rule is therefore absolute: this file writes `hsl(var(--token))` and Tailwind's own
     * `@tailwind` directives, and it does not `@apply` anything. A theme-dependent `@apply`
     * now fails here rather than in a browser.
     */
    const source = fs
      .readFileSync(path.join(ROOT, 'src/index.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    const applies = [...source.matchAll(/@apply\s+([^;]+);/g)].map((match) => match[1].trim());

    expect(
      applies,
      `src/index.css uses @apply, which resolves before the theme exists and blanks every route in dev: ${applies.join(' | ')}`,
    ).toEqual([]);
  });

  it('every colour the stylesheet writes is a token, not a hex literal', () => {
    // The companion rule. A hex literal in the stylesheet is a colour no token owns and that
    // dark mode cannot reach. `rgb()`/`rgba()` are allowed because the elevation shadows are
    // multi-layer values whose alpha cannot be a single token - and they are redefined whole
    // inside `.dark`, which is what makes them themeable despite being literals.
    const source = fs
      .readFileSync(path.join(ROOT, 'src/index.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    const literals = [...source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0]);

    expect(
      literals,
      `hex colours in the stylesheet bypass the token layer and cannot follow dark mode: ${literals.join(', ')}`,
    ).toEqual([]);
  });
});
