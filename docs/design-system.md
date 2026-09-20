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

*(Filled in by P1: the semantic aliases, the radius/elevation/motion scale, and which role
theme owns which accent. Until then the authoritative list is `src/index.css`.)*

## 6. Component contract

*(Filled in by P2: one row per exported component — import path, purpose, props, and the state
variants it owns — so that a new page is composed rather than styled.)*
