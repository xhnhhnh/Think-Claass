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
| `Table` family | `@/components/ui/table` | tabular data | consumed by `DataTable` |
| `DataTable` | `@/components/ui/data-table` | list pages | columns + rows; **owns loading and empty** so pages stop inventing both |
| `Toolbar` | `@/components/ui/toolbar` | search + filters + actions above a list | the search input gets its accessible name from `searchLabel`, not the placeholder |
| `StatCard` | `@/components/ui/stat-card` | dashboard figures | `tone` is an enum, so a caller cannot introduce a ninth palette |
| `SectionCard` | `@/components/ui/section-card` | titled block with actions | what the settings/website pages are stacks of |
| `Progress` | `@/components/ui/progress` | usage bars | Base UI's indicator owns the dynamic width, so no page needs an inline style; `toneForUsage` carries the threshold rule |
| `FileInput` | `@/components/ui/file-input` | hidden file picker | `label` is required: a hidden input has no visible label to borrow a name from |
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

### P3 — the public surface

Home, About, Services, News, Contact, the login page (all three roles, registration and invite-code
binding), activation, the payment landing page, and the admin console's login.

The phase exists to delete a block. `.public-campus-page` in `index.css` repainted nine families of
`indigo-*`/`violet-*` classes green, because the public pages were written in a design language the
product does not use. Migrating them onto tokens made the block redundant, and it is gone -
`recolorRules` 9 → 0, `importantOverrides` 14 → 7.

| Metric | P2 | P3 |
| --- | --- | --- |
| `rawButtons` | 262 | 253 |
| `rawInputs` | 95 | 89 |
| `rawSelects` | 26 | 25 |
| `hexColors` | 67 | 51 |
| `offBrandAccents` | 788 | 667 |
| `inlineStyles` | 18 | 16 |
| `importantOverrides` | 14 | 7 |
| `recolorRules` | 9 | **0** |

Two structural wins worth naming: `loginStyles.ts` (eleven hex colours, a second copy of the three
role palettes, and a `ROLE_THEME` map read by four components) is **deleted** - login is a token
scope now, so choosing a role sets `theme-*` on the page wrapper and `bg-primary` follows. And
`PortalShell` collapses four copies of the same sticky header + back button + footer into one.

**Deferred to P8, deliberately:** `HomePage.tsx` is still a single ~700-line file with its sections
inline. Splitting it is maintainability work rather than design-system work, and it was not worth
holding the phase's exit criterion (the block's deletion) hostage to it. It is listed in §8.

### P4 — the admin console

Twelve pages, ten of them rewritten this phase: the dashboard, settings, website, system reset,
open-api, codes, teachers, announcements, articles, audit logs.

Two blocks died here. `.theme-admin .campus-content` (four `!important`s) repainted the console's
dark panels white; it existed only because the dashboard was still written in an abandoned
"editorial dark" spec - `glass-dark` panels, `bg-slate-800/50` wells, eight neon icon colours. P4
moved the dashboard onto the tokens, so the block went with it. It was also quietly harmful: the
rule that darkened `text-slate-400` applied to the **update log panel** too, a `bg-slate-950`
terminal where a mid grey is nearly invisible. Deleting it improved the page it was meant to fix.

Six hand-written `<table>` blocks became `DataTable`, and with them went six hand-written loading
rows, six empty blocks and six "加载中..." cells. Nine `confirm()`/`window.confirm()` calls became
`ConfirmDialog`, including the two on the dashboard that guard a database export and an import.

| Metric | P3 | P4 |
| --- | --- | --- |
| `rawButtons` | 253 | **209** |
| `rawInputs` | 89 | **62** |
| `rawSelects` | 25 | **22** |
| `rawTables` | 12 | **5** |
| `offBrandAccents` | 667 | **608** |
| `inlineStyles` | 16 | **15** |
| `nativeDialogs` | 14 (19 after the metric fix) | **10** |
| `importantOverrides` | 7 | **3** |
| `deadCode` | 54 | **52** |
| built CSS | 181,422 bytes | 174,539 bytes |

Three test contracts were updated on purpose, and each is an improvement rather than a workaround:

- `Admin/SystemReset.test.tsx` clicked through the new dialog instead of stubbing `window.confirm`.
  The test's name - "calls the real reset contract after confirmation" - now asserts the
  confirmation, plus a second test that the confirm button stays disabled until the word is exact.
- `Admin/Settings.test.tsx` reaches its checkbox with `getByRole('checkbox', { name })` instead of
  `getByLabelText`. Base UI renders the visible control as a `role="checkbox"` span with the real
  input `aria-hidden`, so a label query can never find it - and role queries are what
  testing-library recommends for custom controls anyway.
- The metric was widened, and its value went **up**: `window.confirm(` was excluded by the
  lookbehind that keeps `dialog.confirm(` (a method) out, so five real dialogs had been invisible.
  Widening a metric mid-refactor is only acceptable because the phase then took nine of them out.

Two kit components landed with the pages that needed them rather than "for later": `Progress`
(the dashboard's hand-built bar, whose dynamic width is why `inlineStyles` could not reach 0) and
`FileInput` (the two hidden pickers, which had no accessible name).

### P5 — the parent area

Six pages: 温馨家园, 成长足迹, 家庭时光, 请假假条, 学习采撷 and 家校信箱.

The interesting find was a **palette that never existed**. The parent area was written against
`coral-*` - `bg-coral-400` on its primary buttons, `text-coral-500` on its accents, `border-coral-100`
on its cards - and `coral` is not a Tailwind family and was never registered in
`tailwind.config.js`. All 74 occurrences compiled to nothing, so the area's filled buttons had **no
background at all** and its "coral" cards had no border. The audit did not catch it either, because
`unresolvedTokenUtilities` only knew about *project tokens* whose palette entry was missing. It now
knows both shapes - a token with no entry, and a family/shade no palette resolves - which is why that
metric moved from 0 to 79 and back to 0.

| Metric | P4 | P5 |
| --- | --- | --- |
| `rawButtons` | 209 | **191** |
| `rawInputs` | 62 | **58** |
| `hexColors` | 51 | **28** |
| `offBrandAccents` | 608 | **557** |
| `inlineStyles` | 15 | **14** |
| `nativeDialogs` | 10 | **9** |
| `unresolvedTokenUtilities` | 0 | **0** (was 79 mid-phase) |
| built CSS | 174,539 bytes | 170,381 bytes |

`#fffdfa` was a warm paper the parent pages used 30 times - it is `bg-paper-warm`. The orange hero
gradients written as three hexes are the role theme's own `primary`. The inline confetti arrays moved
into `src/lib/celebrationPalette.ts`, which is exempt by name like the brand mark, because a confetti
palette is artwork rather than a surface.

**A regression this phase caused, and what now prevents it.** The colour migration was done with
literal swap maps, and a swap whose replacement carried its own opacity produced classes like
`bg-muted/50/70` (from `bg-slate-50/70`): not Tailwind classes at all, and therefore invisible rather
than merely wrong. Thirty of them were checked in across ten files, three of them from P3's portal
work. They are repaired, and `inertTokens` gained a `doubled opacity modifier (x/a/b)` entry so the
tooling is held to the same standard as the pages. The lesson is in the shape of the fix: a bulk
rename needs a metric that can see its output, or it moves debt instead of removing it.

**A collision worth recording.** The parent pages' kit migration ran in parallel with the colour pass
above, and the two writers briefly fought over the same files - one of them reverted the other's work
with a `git checkout`, and a PowerShell array-flattening bug mangled two files (every `h` replaced by
an `o`) before it was caught by the typechecker. Both were recovered by restoring from git and
re-applying the edits with node scripts, and the final state is the one this log describes. The
process rule that came out of it: **one writer per file, and no `git checkout` on a path another
writer owns** - the same rule the migration's own handoff states for its phases.

**Deliberately left for P6/P8:** `Report.tsx` and `ParentCommunicationPage.tsx` are colour-migrated
and on the kit's `Button`, but still write their own page header and loading states. They are listed
in §8.

### P6 — the teacher console

Thirty-nine files, 8,294 lines: the largest family in the product. It went from **144 raw buttons to
1**, from 54 raw inputs to 0, from 22 selects to 0, and from 205 off-brand accent utilities to 0.

| Metric | P5 | P6 |
| --- | --- | --- |
| `rawButtons` | 191 | **48** |
| `rawInputs` | 58 | **4** |
| `rawSelects` | 22 | **0** |
| `rawTables` | 5 | **1** |
| `hexColors` | 28 | **25** |
| `offBrandAccents` | 557 | **244** |
| `inlineStyles` | 14 | **11** |
| `nativeDialogs` | 9 | **2** |
| built CSS | 170,381 bytes | 168,940 bytes |

Everything left in the table above is the **student area**, which is P7 - except one deliberate
exception and one class of artwork:

- **The big screen keeps one raw `<button>`.** It is the 3xl countdown readout on a projection
  surface; the kit's control is 2.25rem tall and cannot carry it. It has an `aria-label`, and the
  page is documented in §2 as a stage rather than a page.
- **All 25 remaining hex literals are confetti palettes** (22 in the student area, 3 on the big
  screen). They belong in `src/lib/celebrationPalette.ts`, which is exempt by name; moving them is
  P7's first mechanical step.

Two pre-existing defects the console surfaced, both now fixed rather than documented:

- `animate-[slideRight_2s_linear_infinite]` (the big screen's transmission bar) and `.scrollbar-hide`
  were written in a page and defined **nowhere**, so both compiled to nothing - the bar never moved
  and the strip never hid its scrollbar. The keyframes and the utility now exist in `index.css`,
  outside `@layer`, so they are emitted whether or not a utility references them.
- One more native dialog than the phase brief listed: `TeacherBrawlPage.tsx` also had a
  `window.confirm`. The writer found it, the audit confirms the teacher area is at 0, and the
  lesson is recorded with the others - **the brief is a plan, the audit is the measurement.**

Two decisions worth keeping:

- **The brawl page's tug-of-war bar stays two `motion.div`s.** It is one track with two scores
  pulling against each other; two `Progress` bars would be a redesign of the page's central idea,
  not a migration of it. Every ordinary width bar in the console *is* `Progress`.
- **`TeacherShopPage`'s `alert('网络错误，请稍后重试')` became `toast.error`** with the identical
  message. It is the one behaviour change of the phase, it is user-visible (no more blocking browser
  dialog), and it is right: the metric only matched `window.alert(` and would have left it behind.

### P7 — the student area

Twenty-three pages, the most playful family in the product: pet evolution, dungeon runs, the
interactive wall's danmaku, the skill tree's starfield, the territory map, gacha pulls, the bank's
sparkline.

All of it is on the tokens now, and **the game feel was the constraint rather than the casualty**:
`framer-motion` entrances, gradients, glows and full-bleed dark canvases survive, because they are
the product's idea. What changed is where their colours come from - a starfield is
`bg-secondary-foreground`, a glow is `shadow-glow-primary`, a completed node is `success` and an
unlockable one is `info` (mapping both to `primary` would have made two different states the same
green on a dark canvas, which is the kind of "consistency" that destroys meaning).

| Metric | P6 | P7 |
| --- | --- | --- |
| `rawButtons` | 48 | **1** |
| `rawInputs` | 4 | **0** |
| `rawSelects` | 0 | 0 |
| `rawTables` | 1 | **0** |
| `hexColors` | 25 | **0** |
| `offBrandAccents` | 244 | **0** |
| `inlineStyles` | 11 | **3** |
| `nativeDialogs` | 2 | **0** |
| `importantOverrides` | 3 | 3 |
| built CSS | 168,940 bytes | **161,412 bytes** |

Two more classes that were written and never defined, both now real: `animate-blob` (six student
pages carried it, so their decorative blobs never moved) and `animate-spin-slow`/
`animation-delay-*`. This is the fourth instance of the same defect - a class name that looks like a
style and compiles to nothing - and it is why G20's contract list has grown with every phase.

### P8 — cleanup

The last override block is gone: the radius and shadow flattening, which forced `rounded-3xl`,
`rounded-2xl` and every `shadow-lg|xl|2xl|[…]` to the campus scale. The classes were rewritten to
the tokens they were being forced to (`rounded-panel`, `rounded-card`, `shadow-raised`) - which is
the same value written where it belongs - so deleting the block moved nothing on screen.
`importantOverrides` is **0**, and a new override block fails G20 instead of being reviewed.

The three blocks that lived in that section are now a comment recording what each was compensating
for. That comment is the most useful thing in this document: every one of them existed because a
page's markup said one thing and the product needed another, and the fix was always to change the
page.

**Done in the same round, and worth recording because it is the only structural move left:** the
`HomePage` was 702 lines of sections written inline. It is **68** now, with the page's data in
`components/home/homeContent.ts` and one file per section (`HomeNav`, `HomeHero`, `HomeQuickLinks`,
`HomeAudience`, `HomeAbout`, `HomeJourney`, `HomeClassroomMoments`, `HomeNews`, `HomeClosingCta`,
`HomeFooter`). The split was verified as a *move* rather than a rewrite: the CJK copy multiset, the
`className` multiset, the double-quoted string literals and all 626 numeric literals (typewriter
delays, animation durations, stagger factors) are identical between the original file and the new
set, and every original code line reappears in order inside exactly one section file.

Two smaller closures: `Report.tsx` and `ParentCommunicationPage.tsx` use `PageHeader` now, and
`src/components/ui/dropdown-menu.tsx` was **deleted** - it was the last unadopted kit primitive, no
file imported it, and the `deadCode` ratchet counts an unreferenced file. If a menu is needed, it
comes back from shadcn with the styles already fixed, which is cheaper than carrying it dead.

## 8. Deferred / open

| Item | Phase | Why it is not done |
| --- | --- | --- |
| Browser-based visual regression | - | No automation is installed and the project does not add dependencies; visual acceptance is the maintainer's pass over the URL lists published at the end of each phase |
| `bigscreen`'s one raw `<button>` and the three data-driven inline styles | - | Declared exceptions, not debt: the countdown readout is a projection-stage instrument, and the danmaku overlay's per-message position/colour plus two animation-driven bar widths are values a class cannot carry |



