# Design system and UI refactor

> **What this document is for**: it is the entry point for the front-end presentation layer the
> same way [`docs/migration/HANDOFF.md`](migration/HANDOFF.md) is the entry point for the
> backend architecture. It records the tokens, the component contract, the debt the refactor is
> removing, and the commands that keep it removed.
>
> **Verify before believing**: every number here was measured with
> `npm run ui:audit`, and the guardrail that enforces them is
> [`tests/guardrails/ui-design-system.test.ts`](../tests/guardrails/ui-design-system.test.ts)
> (G20). When this document and the command disagree, the command is right — fix the document.

---

## 1. The problem this refactor exists to remove

The front end has three copies of one design language, and only the third one is authoritative:

| Where | What it says | Who reads it |
| --- | --- | --- |
| `src/index.css` tokens (`--primary`, `.theme-student`, …) | the intended palette | almost nobody |
| `!important` overrides in the same file | flatten radii/shadows app-wide, repaint `indigo-*`/`violet-*` green | every page, by force |
| `src/components/ui/**` | a component layer pages barely import | 11 `Button` imports against 263 raw `<button>` |

Measured at the P0 baseline (`npm run ui:audit`, before any change):

```text
rawButtons                263   raw <button> elements
rawInputs                  96   raw <input> elements
rawSelects                 27   raw <select> elements
rawTables                  13   raw <table> elements
hexColors                  67   hex colour literals
inlineStyles               18   inline style={{ }} props
nativeDialogs              14   confirm()/prompt()/alert() calls
importantOverrides         14   !important overrides in index.css
recolorRules                9   .public-campus-page recolour rules
inertTokens                74   Tailwind v4-only (inert) tokens
unresolvedTokenUtilities    8   colour utilities for tokens Tailwind cannot resolve
deadUtilities               6   unused utilities declared in index.css
unresolvedCssImports        1   unresolvable @import specifiers
v4OnlyCssImports            1   v4-only @import specifiers
```

Two of those need more than a sentence, because they are invisible in review:

**The component layer was generated for Tailwind v4 while the project runs 3.4.19.** Constructs
such as `ring-3`, `not-aria-[…]`, `*:[…]`, `has-data-*`, `@container/x`, `animate-in`,
`fade-in`, `slide-in-from-*` compile to nothing — the focus rings, the dialog entrances and the
card title font (`font-heading`) have never rendered. G20 compiles each construct through the
project's own Tailwind config and asserts it stays inert, so the claim is a test result rather
than a reading. The same test corrected this document once: the named-group form
`group-data-[size=sm]/card:px-3` **does** compile in v3.4, and was removed from the metric.

**A token can look declared and still be missing.** `src/index.css` defines `--card`,
`--card-foreground`, `--popover` and `--popover-foreground`, but `theme.extend.colors` never
registers them, so `bg-card`, `text-card-foreground`, `bg-popover` and `text-popover-foreground`
compile to nothing: the kit's `Card` renders without a background. That is the
`unresolvedTokenUtilities` metric.

## 2. Rules the refactor is held to

1. **One token source.** Colour, radius, elevation, control height and motion live in
   `src/index.css` and are exposed to Tailwind through `tailwind.config.js`. A page never writes
   a hex literal, and never writes `!important`.
2. **One component layer.** `@/components/ui/**` is the only place that styles a button, input,
   select, table, dialog or state. Pages compose it; they do not restyle raw elements.
3. **No new dependencies.** The kit is built from what is installed (`@base-ui/react`,
   `class-variance-authority`, `tailwind-merge`, `clsx`, `lucide-react`, `sonner`,
   `framer-motion`) and stays on Tailwind 3.4. v4-only syntax is rewritten, not adopted.
4. **Copy is a contract.** Page tests assert visible text and accessible names
   (`getByRole('button', { name: '保存' })`, `暂无更新日志。`). Restyling must not move them.
5. **Ratchet, don't promise.** Every number in §1 has an allowance in
   [`tests/guardrails/lib/allowances.json`](../tests/guardrails/lib/allowances.json) that may only
   go down. `npm run guard` is green at every commit, so red always means "you broke something".
6. **Declared exceptions.** `src/lib/brandIcon.ts` (the single definition of the brand mark) and
   `src/lib/celebrationPalette.ts` (the canvas-confetti palette) may contain colour literals;
   `TeacherBigscreenPage` is a projection-stage surface and is tokenised but not card-ified;
   `.dark` tokens exist but no theme switch is wired, and this refactor neither enables nor
   deletes them.

## 3. Commands

```bash
npm run ui:audit          # human report: totals, per-area breakdown, top offenders
npm run ui:audit:json     # machine-readable
npm run ui:audit:check    # non-zero exit when a metric exceeds its allowance
npm run guard             # G20 included; the CI-enforced form of the same ratchet
```

`docs/design-system.md` and `ui-audit.mjs` share one definition of every metric
(`scripts/migration/lib/ui-audit.mjs`), so the report, the CLI gate and CI cannot disagree.

## 4. Phases

Each phase is one commit and ends with `check` + `test:app` + `guard` + `build`, then a visual
pass over that phase's routes.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| P0 | audit + G20 + these notes | guard green; mutations make it red |
| P1 | token layer, single theme owner, palette entries, inert-syntax fixes | `inertTokens` 0, `unresolvedTokenUtilities` 0, both CSS-import metrics 0 |
| P2 | component layer: Select, Textarea, AlertDialog, EmptyState, PageHeader, SectionCard, StatCard, FormField, DataTable, Toolbar, Spinner, Skeleton, motion helpers | every new component has a test; `CrudPage` is its first consumer |
| P3 | portal + auth + payment | `recolorRules` 0, `.public-campus-page` deleted, portal hex 0 |
| P4 | admin console | raw tables/dialogs 0 in `src/pages/Admin/**` and `src/features/admin/**` |
| P5 | parent area | parent hex 0, native dialogs 0 |
| P6 | teacher console (lists, then forms, then game pages) | teacher raw controls 0 |
| P7 | student area | student raw controls 0, inline styles 0 |
| P8 | cleanup | all 14 metrics 0, dead utilities deleted, CHANGELOG entry |

## 5. Token contract

Layers, in order, all in `src/index.css` and registered in `tailwind.config.js`:

| Layer | Names | Consumed as |
| --- | --- | --- |
| Primitives | `--background`, `--foreground`, `--primary`, `--secondary`, `--accent`, `--muted`, `--destructive`, `--border`, `--input`, `--ring`, `--card`, `--popover`, `--sidebar*`, `--chart-1..5` | `hsl(var(--x))` via `bg-*` / `text-*` / `border-*` |
| Status | `--success`, `--warning`, `--info` | `text-success`, `bg-warning/10`, … |
| Surfaces & text | `--canvas`, `--paper`, `--paper-warm`, `--ink-1/2/3` | `bg-canvas`, `bg-paper-warm`, `text-ink-2` |
| Shape | `--radius` (-sm/-md/-lg), `--radius-card` 0.625rem, `--radius-panel` 0.75rem, `--radius-pill` | `rounded-lg`, `rounded-card`, `rounded-panel`, `rounded-pill` |
| Elevation | `--elev-1/2/3` | `shadow-card`, `shadow-raised`, `shadow-floating` |
| Motion | `--motion-fast` 150ms, `--motion-base` 200ms, `--motion-slow` 320ms, `--ease-out-soft` | `duration-base`, `ease-soft`, the `animate-*` keyframes |
| Compatibility | `--campus-canvas/-paper/-paper-warm/-border/-soft-shadow` | legacy `var(--campus-*)` call sites (~100), resolving to the layers above |

Animations are named after the intent and defined as real keyframes: `animate-fade-in`,
`animate-fade-out`, `animate-zoom-in`, `animate-zoom-out`, `animate-slide-in-top/-bottom/-left/-right`.
There is no `animate-in`/`slide-in-from-*` composition: those were the v4 package's vocabulary and
never compiled here.

### The accent palette

The product's identity is **green**, with **amber/orange** and **sky** as the two supporting accents.
Every other colour family in a page is debt, and it is measured: `offBrandAccents` counts
`indigo|violet|purple|fuchsia|pink|rose` utilities, because those are what the pages were written in
and only the portal's copy is repainted by the `.public-campus-page` block.

| Was | Becomes |
| --- | --- |
| `text-indigo-500/600`, `bg-indigo-500/600` | `text-primary`, `bg-primary` |
| `bg-indigo-50`, `border-indigo-100/200` | `bg-primary/5`, `border-primary/20` |
| `text-violet-500`, `text-purple-500` | `text-accent-foreground`, `text-secondary-foreground` |
| `bg-violet-50`, `bg-purple-50` | `bg-accent`, `bg-secondary` |
| `from-indigo-500 to-violet-500` | `from-primary to-accent` (or a role gradient token) |
| glow shadows (`shadow-[0_0_15px_rgba(99,102,241,…)]`) | `shadow-glow-primary` |

## 6. Component contract

Everything a page renders comes from `@/components/ui/**`. **A kit component lands with its first
consumer**, because the `deadCode` ratchet counts an unreferenced file: adding a component "for
later" is adding debt with a nicer name.

| Component | Import | Purpose | Notes |
| --- | --- | --- | --- |
| `Button` | `@/components/ui/button` | every action | `variant`: default/outline/secondary/ghost/destructive/link; `size`: xs…icon-lg |
| `Input`, `Textarea`, `Select` | `@/components/ui/{input,textarea,select}` | form controls | `Select` is a styled native `<select>` on purpose - see below |
| `Checkbox` | `@/components/ui/checkbox` | tick boxes | Base UI; `checked` / `onCheckedChange` |
| `FormField` | `@/components/ui/form-field` | label + control + hint + error | wrapping `<label>`, so `getByLabelText` keeps working; the required marker is a CSS pseudo-element |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` | `@/components/ui/card` | surfaces | |
| `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose` | `@/components/ui/dialog` | forms in a modal | Base UI Dialog |
| `ConfirmDialog` | `@/components/ui/alert-dialog` | confirmations | replaces `window.confirm`; Base UI AlertDialog, so focus lands on the least destructive action |
| `Badge` | `@/components/ui/badge` | status chips | `variant` adds success/warning/info to the stock set |
| `Table` family | `@/components/ui/table` | tabular data | *unadopted*: P4's `DataTable` is the intended consumer |
| `DropdownMenu` family | `@/components/ui/dropdown-menu` | menus | *unadopted*: adopt for a user menu or row actions by P8, or delete |
| `PageHeader` | `@/components/ui/page-header` | page title + description + actions | renders an `<h2>`; the shell owns the `h1` |
| `EmptyState` | `@/components/ui/empty-state` | "nothing here" | copy stays with the caller |
| `Spinner`, `Skeleton`, `SkeletonList` | `@/components/ui/{spinner,skeleton}` | loading | `Skeleton` where the incoming shape is known, `Spinner` inside a button |
| `Label` | `@/components/ui/label` | standalone label | |

Two decisions worth stating, because they look like omissions:

- **`Select` is a native `<select>`.** The 27 selects in the app are written as
  `<select value onChange><option>`. A composite listbox would rewrite every call site and change
  keyboard/touch behaviour - a behaviour change this refactor does not get to make. The kit owns the
  *look*; the element stays the browser's.
- **`FormField` uses a wrapping `<label>` and draws `*` with `after:content-['*']`.** The three page
  tests that exercise `CrudPage` reach their controls with `getByLabelText('股票名称')`, which matches
  the label's text content. Nesting the control keeps that working, and a pseudo-element keeps the
  required marker out of the accessible name.

## 7. Phase log

### P0 — measure first

14 metrics, G20's ratchet, `npm run ui:audit`, these notes.

### P1 — the token layer, and a component layer that compiles

| Metric | Before | After |
| --- | --- | --- |
| `inertTokens` | 74 (recounted 126 with the widened pattern set) | **0** |
| `unresolvedTokenUtilities` | 8 | **0** |
| `deadUtilities` | 6 | **0** |
| `unresolvedCssImports` | 1 | **0** |
| `v4OnlyCssImports` | 1 | **0** |
| `offBrandAccents` | 790 (first measurement) | 790 (P3–P8 work) |
| `importantOverrides` | 14 | 14 (unchanged - each phase deletes its own) |
| built CSS | 188,058 bytes | 181,422 bytes |

What became real, rather than merely written down:

- **Focus rings.** `ring-3` does not exist in v3, so `Button`, `Input`, `Checkbox` and the CRUD
  form had no focus ring at all. Now `ring-[3px]`, verified in `dist/assets/index-*.css`.
- **The card surface.** `bg-card`/`text-card-foreground` named tokens the Tailwind theme never
  registered; registering `card`, `popover`, `sidebar*`, `chart*`, `canvas`, `paper`, `ink*` and the
  status colours made the kit render the surface it always claimed.
- **The dialog and menu entrances.** `data-open:`/`data-closed:`/`data-inset:`/`data-disabled:`
  are v4 spellings of `data-[open]:` and friends, and `animate-in fade-in-0 zoom-in-95` was a v4
  package's composition. Base UI already sets those attributes, so the dialogs, the overlay and the
  dropdown menus animate for the first time. `max-h-(--x)`/`w-(--x)`/`origin-(--x)` became
  `max-h-[var(--x)]`, which is what makes a dropdown respect its available height.
- **One theme owner.** `ThemeWrapper` puts the role theme on `<html>` (a layout effect, so no flash),
  `CampusShell` no longer duplicates it, `/teacher` finally gets its own class, and dialog portals -
  which live outside the shell element - now inherit the role palette instead of the default green.
- **Badges.** `rounded-4xl` and `size-3!` meant `Badge` had square corners; it is a pill now.
- Markdown `Card`, `Dialog` and `DropdownMenu` surfaces use `border-border` instead of
  `border-[var(--campus-border)]`, the first two files moved onto tokens.

Two metric corrections came out of doing this, both recorded because a metric that is wrong about
what it counts is worse than no metric:

1. `group-data-[size=sm]/card:px-3` **does** compile in v3.4 - it was in the inert list and was
   removed (79 → 74).
2. Comments were being counted. `!important` in a CSS comment, and `ring-3` in a TypeScript comment
   explaining that `ring-3` is inert, both scored as debt. Both scans now blank comments while
   preserving line numbers.

### P2 — the kit, with its first consumer

Eight components land, all in `src/components/ui/`: `Select`, `Textarea`, `FormField`, `Spinner`,
`Skeleton`/`SkeletonList`, `EmptyState`, `PageHeader`, `ConfirmDialog` (on Base UI's AlertDialog).
`Badge` gains `success`/`warning`/`info`.

They land together with their consumer, `CrudPage` - the app's one generic CRUD page, used by
股票管理, 拍卖行管理 and 盲盒管理 - which now composes all of them instead of carrying its own copy of
every primitive. Its three page tests are the contract: `getByLabelText('股票名称')`, the buttons
named `保存`/`删除`/`取消`, and the delete confirmation all still work, which the 18 new tests in
`kit-primitives.test.tsx` / `kit-states.test.tsx` pin directly.

Also in this phase: `FeatureDisabledState` moved onto `EmptyState` + `Button`; the dead
`src/components/Empty.tsx` was deleted; `CrudPage`'s consumers stopped passing colour to their icons
(`text-indigo-500`, `text-purple-500`), which is how the kit takes over the palette.

| Metric | P1 | P2 |
| --- | --- | --- |
| `rawButtons` | 263 | 262 |
| `rawInputs` | 96 | 95 |
| `rawSelects` | 27 | 26 |
| `rawTables` | 13 | 12 |
| `offBrandAccents` | 790 | 788 |
| `deadCode` (backend ratchet) | 55 | **54** |
| app test files / tests | 65 / 157 | 67 / 175 |
| guard files / tests | 15 / 85 | 15 / 85 |

The third metric correction came from this phase: the raw-element counts were including
`src/components/ui/**`, so `select.tsx`'s own `<select>` was scored as the debt the kit exists to
remove. The counts now exclude the kit - a page writing `<select>` is the debt, the kit wrapping one
is the fix - which is also why `rawSelects`/`rawTables` moved down without a page changing.


