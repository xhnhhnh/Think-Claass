# Design system and the UI-R shell

> **What this document is for**: the entry point for the front-end presentation layer, the
> way [`docs/migration/HANDOFF.md`](migration/HANDOFF.md) is the entry point for the backend
> architecture. It records the tokens, the shell's contract, the interaction model, the debt
> this refactor removed, and the commands that keep it removed.
>
> **Verify before believing**: the numbers here were measured with `npm run ui:audit`, and
> the guardrails that enforce them are
> [`ui-token-contract.test.ts`](../tests/guardrails/ui-token-contract.test.ts) and
> [`ui-route-coverage.test.ts`](../tests/guardrails/ui-route-coverage.test.ts). When this
> document and a command disagree, the command is right — fix the document.

---

## 1. What UI-R replaced

The previous round (P0–P8, still recorded in §9) removed the *debt*: raw controls, hex
literals, `!important` overrides, off-brand accents. It reached zero on all fourteen of its
metrics. What it did not change was the **shape**:

| The old shape | What it cost |
| --- | --- |
| Four layout components rendering one `CampusShell` with a `role` prop that replaced the *entire* palette | a "success" chip was three different greens; a dialog portalled to `<body>` missed the scope and came out green in the parent area |
| A sidebar of 25 flat entries in the teacher console | a console you scroll to navigate, ordered by nothing a reader could perceive |
| An `h1` in the shell plus a page header in each of 76 pages | the title printed twice, and the primary action in the middle of the page |
| A 96-pixel hero banner with a stock illustration and a product sentence above every page | on a 13-inch laptop the first real control was below the fold |
| `pathname === item.path` for the active state | no rail entry highlighted on any parameterised route, and a hard-coded page title |
| No navigation on a phone except a horizontally scrolling strip of the *same* 25 entries | reachable, unusable |
| Marketing-style page structure everywhere | a console that reads as a brochure |

UI-R replaces the shape. It is not a reskin: the tokens, the shell, the navigation model, the
page template and the measurement all changed identity at once, and the 76 pages are being
migrated onto the new template in batches (§8).

## 2. Tokens: three tiers

Everything lives in `src/index.css` and is registered in `tailwind.config.js`. **A page
never writes a colour literal, and never writes `!important`.**

| Tier | Names | Consumed as | Changes per… |
| --- | --- | --- | --- |
| **Product** | `--brand*`, `--fg-1/2/3`, `--surface-1..4`, `--surface-steel`, `--line-1/2/strong`, `--success/warning/info/danger/participation` (+ soft variants), `--chart-1..5` | `bg-surface-2`, `text-fg-3`, `border-line-1` | never |
| **Role accent** | `--role`, `--role-soft`, `--role-ink`, `--role-contrast`, `--focus` | `bg-role`, `text-role-ink`, `outline-role` | `data-role` on `<html>` |
| **Density / shape / motion** | `--radius*`, `--elev-1/2/3`, `--bar-h`, `--rail-w`, `--dock-h`, `--control-h*`, `--motion-*` | `rounded-card`, `shadow-raised`, `h-bar`, `h-control` | never |

Two decisions inside that table are load-bearing:

- **The role is an accent, not a skin.** `data-role` re-points four variables. Nothing else.
  A "success" badge is the product's green in all four consoles, so colour keeps meaning; a
  dropdown portalled out of the shell still inherits the reader's accent; and there is no
  second palette that can drift out of sync with the first.
- **Colour distinguishes purpose.** Green marks the brand, teacher actions and growth;
  collaboration uses blue, competition amber, and participation violet. Student, parent and
  administrator navigation accents are blue, amber and slate. Large surfaces stay paper or
  neutral so accents remain easy to scan.
- **Status has three steps, not one.** `--success`, `--success-soft`, `--success-ink`. Before,
  every caller built a chip from one colour plus an opacity, which produced the same chip in
  nine shades. Three named steps is what makes "a badge looks like this" a fact.

**Dark mode is real.** `.dark` on `<html>` is a full second product palette plus four lifted
role accents. It existed in the stylesheet before and nothing ever set it; `RoleTheme` now
owns it, defaults to the OS preference, and can be overridden by the reader.

**The pre-UI-R aliases still resolve**, as aliases rather than a second palette:
`--background`, `--primary`, `--canvas`, `--paper`, `--ink-*`, `--card*`, `--sidebar*` all
forward to a tier above. They exist so an unmigrated page keeps rendering, and they are
counted by `ui:audit` so the count can only fall. `--campus-*` and the `.theme-*` classes
are **deleted**, not aliased: keeping them would have kept the palette-swapping alive.

### A defect worth recording, because the build could not see it

`@apply` inside `@layer base` is resolved by PostCSS *before* Tailwind publishes
`theme.extend`, so a theme colour is unknown and the dev pipeline fails with
``The `bg-surface-1` class does not exist``. The production build tolerated the same source
and emitted correct CSS, so `npm run build` was green while `npm run dev` served a blank
`#root` on every route. Every colour in `index.css` is therefore written as
`hsl(var(--token))` by hand. **If you add an `@apply` there, check the dev server, not just
the build.**

## 3. The shell

One component, `src/app/layouts/AppShell.tsx`, draws all four consoles. A console differs in
three ways only: which destinations the route table gives it, what the brand says, and which
feature flags gate the menu. The four `*Layout.tsx` files are thin adapters that supply those.

```
┌───────────┬──────────────────────────────────────────────┐
│           │  ContextBar   breadcrumb · h1 · actions · ⌘K  │  h-bar
│ SidebarNav├──────────────────────────────────────────────┤
│  groups   │  ContentArea                                 │
│  collapse │   └ PageScaffold (variant)                   │
│  footer   │                                              │
└───────────┴──────────────────────────────────────────────┘
     ▲ on a phone: MobileBar on top, MobileTabBar pinned at the bottom
```

### The layout modes

| Mode | When | What it looks like |
| --- | --- | --- |
| `workbench` | every console route on a viewport ≥ `lg` | collapsible rail, context bar, content |
| `mobile` | the same routes below `lg` | summary bar + four-tab dock + 「更多」 drawer |
| `immersive` | a route whose table entry says `mode: 'immersive'` | no chrome at all; a single floating exit names where it goes |

The mode comes from the route table, so a page declares what it is in one place. The rail and
the dock are **not** the same navigation with different styling — they show different
destinations, so exactly one is mounted (`useIsDesktop`), and the reason is documented there.

### The context bar

It answers four questions in order: where am I (breadcrumb), what is this (the `h1`, from the
route table), what can I do here (the page's own buttons, portalled in), how do I get anywhere
else (the palette). The page's buttons stay in the page's React tree — see
`src/components/ui/page-actions.tsx` for why the portal replaced lifted state, and for the
three render-ordering traps that cost a browser run each.

## 4. Navigation and the command palette

The route table is the **single source** for a route's path, label, icon, section, feature
gate, layout mode, dock position and search aliases. There is no second `navItems` array and
no icon table keyed by string: the previous `navRegistry` had both, and a label with no icon
or an icon for a path that no longer exists failed silently.

- **`⌘K` / `Ctrl K` opens the command palette** (`src/app/palette/CommandPalette.tsx`). It
  indexes the route table (filtered by the same feature flags the rail uses), the current
  page's registered actions, and the reader's recent commands. A command that navigates into
  a page the reader has switched off would be a command that visibly does nothing, so the
  palette cannot offer one.
- **A page registers its own actions** with `useRegisterPageCommands`, which is how the
  palette becomes a place to *act* rather than only to go somewhere.
- **`⌘B` collapses the rail; `?` opens the shortcut reference.** Both live in
  `src/app/shortcuts/`, and the reference is written by hand next to them: a generated list
  that silently misses a binding is worse than a list a reviewer can check in one reading.
- **Shortcuts never fire while the reader is typing**, except Escape. A `⌘B` that folds the
  sidebar while somebody is in a password field is a shortcut that feels broken.

## 5. The page template

`PageScaffold` is the one shape a page can be. Before it, "a page" meant 76 files each
deciding what a page looks like — and the measurements are in §1.

| Variant | Structure | For |
| --- | --- | --- |
| `dashboard` | metric row, then cards in a grid | an overview |
| `list` | sticky `Toolbar`, then `DataTable` | anything with rows |
| `detail` | main column + 20rem side rail | a record and its context |
| `form` | constrained measure + sticky action bar on a phone | anything you submit |
| `immersive` | full-bleed, no padding, no measure | the game surfaces and the projection stage |

It does **not** render the page title: the context bar owns the `h1`, and the `title` prop
exists only for the standalone (test) case. `PageHeader`, which the pages still use during
migration, contributes **only its actions** when a shell is present, and moves the page's
description onto the bar's heading as its accessible description.

## 6. The component kit

`src/components/ui/**` is the only place that styles a control. The kit's vocabulary did not
change in UI-R — `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `FormField`, `Card`,
`Dialog`, `ConfirmDialog`, `Badge`, `Table`, `DataTable`, `Toolbar`, `StatCard`,
`SectionCard`, `Progress`, `FileInput`, `PageHeader`, `EmptyState`, `Spinner`, `Skeleton`,
`Label` — but three of its rules did:

1. **Heights are tokens.** A button and the input beside it are both `h-control`, so a form
   row lines up by construction. The previous version sized the button with `h-8` and left
   the input at 36px, which made every form row ragged.
2. **The accent is `bg-role`.** A primary button is "the action here", and which console you
   are in is exactly what that should look like. Destructive stays `danger`, a product
   colour: "this deletes something" does not change meaning between consoles.
3. **Tailwind 3.4 only.** No v4 spelling anywhere; `ui-token-contract.test.ts` compiles each
   contract utility and each inert construct, so "this class does nothing" is a test result
   rather than a reading.

Components UI-R added, with the consumer that justified each:

| Component | Consumer |
| --- | --- |
| `sheet` (bottom/left/right/top, on Base UI's Dialog) | the command palette, the mobile drawer |
| `breadcrumb` | the context bar |
| `nav-item` | the rail, the drawer, the dock |
| `kbd` + `CommandHint` + `useIsApplePlatform` | every shortcut hint, one platform decision |
| `page-scaffold` + `PageSection` | the page template (§5) |
| `page-actions` + `PageActionsProvider`/`Outlet` | lifting a page's buttons into the bar |

## 7. Commands and verification

```bash
npm run check            # tsc --noEmit
npm run lint             # eslint
npm run build            # tsc -b && vite build
npm run test             # all four vitest projects
npm run guard            # the ratchets, including the two UI-R guardrails
npm run ui:audit         # human debt report
npm run ui:audit:check   # non-zero when a metric exceeds its allowance

npm run dev              # then, in another terminal:
npm run tour:verify      # the guided tour, in real Chrome over CDP
npm run shell:verify     # the shell, in real Chrome over CDP
```

`shell:verify` is UI-R's addition and it exists because **jsdom cannot see anything this
refactor is about**: it lays nothing out, so every box is 0×0. Whether the rail sits beside
the content rather than above it, whether the dock is pinned to the bottom of a 390-pixel
phone, whether the palette opens on a real keystroke, whether the role accent reached
`<html>` — all of it needs a renderer. It drives Chrome's DevTools Protocol through Node's
built-in `fetch` and `WebSocket`, so it installs nothing, the same constraint the tour
verifier documents. Its 31 checks are the shell's acceptance test; screenshots land in
`.tmp/shell-verification/`.

Two things it deliberately does *not* do, both learned the hard way while writing it:

- It clicks through the DOM event path (`el.click()`), not `Input.dispatchMouseEvent`. Under
  mobile emulation there is no reliable mapping from a `getBoundingClientRect()` to viewport
  coordinates — the page is laid out at one size and scaled to another — and two attempts at
  correcting for it moved the error rather than removing it. What `el.click()` still catches
  is a broken handler or an overlaying element; what it does not catch is a press being
  swallowed by an unrelated pointer-events layer, which the tour verifier covers for the one
  overlay in this application that has to let a press through.
- It clips screenshots to the emulated viewport. `captureScreenshot` defaults to the whole
  page, which for a long route is thousands of pixels scaled down to fit — unreadable exactly
  where the shell detail is.

## 8. Phase log

### UI-R A — the token layer and the kit

Three tiers, dark mode wired, the `.theme-*` skins and the `--campus-*` compatibility layer
deleted, `data-role` as the accent scope. `buttonVariants` moved onto the control-height
tokens. New kit components: `sheet`, `breadcrumb`, `nav-item`, `kbd`, `page-scaffold`,
`page-actions`.

### UI-R B — the shell

`AppShell` plus `ContextBar`, `SidebarNav`, `MobileBar`, `MobileTabBar` and the drawer; the
route table extended with `group`/`icon`/`mobileTab`/`mode`/`aliases`; `navRegistry` deleted
and replaced by `src/app/nav/` with a segment-wise matcher that handles parameterised paths;
the command palette, the shortcuts and the shortcut reference; `RoleTheme` replacing
`ThemeWrapper`; the four `*Layout.tsx` moved to `src/app/layouts/` with their feature-flag
logic preserved verbatim — including the `canDecide` gate, which is the fix for a redirect
loop that used to bounce every student on every hard refresh.

Measured after this phase: **all 15 audit metrics at target**, 110 guardrail tests, 253 app
tests, 1141 backend tests, and 31/31 shell checks in a real browser.

### UI-R C — the pages (complete)

All **67 console page modules** named by the route table are on `PageScaffold`, none renders its
own page heading, and none writes a pre-UI-R token name. `npm run guard` prints the measurement
on every run, and all four values are at their target:

```text
[UI-R C] 67/67 console pages use PageScaffold (100%); 0 still own a PageHeader,
         0 still use pre-UI-R token names, 0 use an unresolvable colour family.
```

Measured by [`ui-page-contract.test.ts`](../tests/guardrails/ui-page-contract.test.ts) against
four keys in `allowances.json`. The phase was run as four batches by family, one writer per file,
with a shared task per batch carrying its write scope and acceptance criteria.

| Batch | Pages | Notes |
| --- | --- | --- |
| student game | 12 | 8 `immersive`; the family that exposed the dropped-actions defect |
| student non-game | 11 | the batch that dropped the last `getExams` misuse |
| teacher console | 27 + 10 sub-components | the largest batch; took `legacyTokenPages` to 0 |
| admin + parent + portal/auth | 26 + 13 portal components | 8 public pages deliberately have no scaffold |

**The eight public pages are not a gap.** The portal, login, activation and payment routes are
flat routes with no console shell — `PageScaffold` exists to give a console route a consistent
shape under the rail and context bar, and has nothing to offer a visitor-facing page. A separate
assertion checks that they have *not* been given console chrome, and it walks `features/portal/`
recursively: the first version read only the directory root, so it passed vacuously for the five
portal pages it existed to guard.

Reaching `legacyTokenPages` 0 is what makes deleting the compatibility aliases possible, and that
is the next cleanup — the aliases in `index.css` and the `background`/`foreground`/`card`/
`popover`/`sidebar` entries in `tailwind.config.js` now have no consumer left.
`src/pages/Admin/**` also went with this phase: its four one-line forwarding shims were deleted
and the route table points at the real modules, which removed the last of the legacy admin tree.

### UI-R D — measurement and tests

Landed: `ui-token-contract.test.ts` (the compile-level token contract, the correction of the
`v4-only scale value` metric which had been counting `rounded-xs` and `size-control` as inert, and
two guards for the blank-page defect below); `ui-route-coverage.test.ts` (route, destination, dock
and section invariants against the real table); `ui-page-contract.test.ts` (the C-phase ratchet,
now at target); `registry.test.tsx` (the stale-callback trap); `page-scaffold.test.tsx` (the
scaffold and the actions portal); the raw-element exemption widened to `src/app/**` with the
reason recorded; and the `!important` metric taught to ignore `prefers-reduced-motion`.

The per-page tests needed almost no rewriting, which is worth recording: the batches changed
markup and class names, not accessible names or copy, so the existing assertions kept working.
Two tests were repointed at the real admin page modules when their shims were deleted, and one
assertion in `RestartGuideButton.test.tsx` follows the kit's vocabulary
(`hover:bg-muted` → `hover:bg-surface-3`) while testing the same thing.

### UI-R E — acceptance

| Check | Result |
| --- | --- |
| `check` / `lint` / `build` | clean (0 lint errors) |
| `test` (app + backend + guardrails + e2e) | 160 files, 1538 tests |
| `guard` | 19 files, 117 tests |
| `ui:audit:check` | 15/15 metrics within allowance |
| `shell:verify` | 31/31 |
| `sweep:verify` | 35/35, every console route per role |
| `tour:verify` | 18/18 (+ 19/19 under `--reduce`) |

### Four defects the verification found, and what each one taught

These are recorded because each was invisible to the instrument that should have caught it, and
the fix was always to change the instrument rather than the number.

1. **Every route served a blank `#root` in development.** An `@apply` in `@layer base` resolves
   before Tailwind publishes `theme.extend`, so `bg-surface-1` did not exist. `npm run build`
   succeeded and emitted correct CSS the whole time. Now guarded twice: no `@apply` and no hex
   literal in `index.css`.
2. **`h-auto`, `h-12` and `h-14` were inert on every kit control.** The project's `spacing` block
   *replaced* Tailwind's, so its `h-*` rules were emitted after the defaults and `h-control` won
   every conflict — a button written as `h-auto py-5` stayed 36px tall. Fixed by moving the block
   inside `theme.extend`. `tailwind-merge` could not have helped: it does not know `h-control` is
   a height.
3. **`sweep-browser.mjs` reported blank pages that rendered perfectly.** It read `innerText`,
   which is layout-dependent and returned empty in this headless browser on every route. Found by
   screenshotting a failure instead of trusting the character count — which is why a failing route
   now always produces one.
4. **A metric that counted its own documentation, twice.** The `@apply` guard first failed on the
   comment saying `@apply` is banned, and the public-surface check failed on the comment saying
   `Public site, so no PageScaffold`. Both now strip comments, the same fix the UI audit applies.

## 9. The previous round (P0–P8), retained as history

Kept because several of its findings are still the reason a rule exists, and because its
metrics are the baseline the current ones were re-derived from.

| Metric | Baseline | Now |
| --- | --- | --- |
| `rawButtons` | 263 | 1 (the big screen's 3xl countdown, a projection instrument) |
| `rawInputs` / `rawSelects` / `rawTables` | 96 / 27 / 13 | 0 / 0 / 0 |
| `hexColors` | 67 | 0 (brand mark and confetti palette exempt by name) |
| `offBrandAccents` | 790 | 0 |
| `inlineStyles` | 18 | 3 (danmaku position/colour, two animation widths) |
| `nativeDialogs` | 14 | 0 |
| `importantOverrides` | 14 | 0 |
| `inertTokens` | 74 | 0 |

Three findings from that round that are still load-bearing:

- **A class name that looks like a style and compiles to nothing** is this project's most
  expensive recurring defect. It has happened four times: `tw-animate-css` in a v3 project,
  `coral-*` (a family that was never registered, so the parent area's filled buttons had no
  background for months), `animate-blob` and `.scrollbar-hide` (declared nowhere). Hence
  `ui-token-contract.test.ts` compiles its own contract.
- **A metric that is wrong about what it counts is worse than no metric.** It has been
  corrected four times, most recently in UI-R (§8 D). Each correction is recorded in
  `allowances.json` next to the number.
- **One writer per file.** A previous phase lost work to two writers on the same path and to
  a `git checkout` on a file another writer owned. The C phase is run under that rule.

## 10. Declared exceptions

- `src/lib/brandIcon.ts` — the single definition of the brand mark; its colour literals are
  artwork.
- `src/lib/celebrationPalette.ts` — the canvas-confetti palette, also artwork.
- `TeacherBigscreenPage` — a projection-stage surface. It is tokenised, its one raw `<button>`
  is the 3xl countdown readout the kit's control cannot carry, and it declares `immersive`
  mode so the shell gets out of its way.
- `DanmakuOverlay` — per-message position and colour are server data, which is why
  `inlineStyles` is 3 rather than 0.
- `PraiseModal`'s `bg-yellow-100` / `bg-blue-100` — those class strings are **payload values**,
  posted as a praise letter's colour, persisted, and later rendered by the pet wall. Changing them
  would change a request parameter, so they are data that happens to look like styling.

## 11. Known remaining work

Recorded rather than hidden. Each is a real gap, and none of them is a surprise found later.

| Item | Why it is not done |
| --- | --- |
| Delete the pre-UI-R aliases (`--canvas`, `--paper`, `--ink-*`, `--primary`, `--card*`, `--sidebar*`) and their `tailwind.config.js` entries | They have no page consumer left now that `legacyTokenPages` is 0, so this is mechanical — but it touches the kit and the shell, and it wants its own verified pass rather than riding along on the page migration. |
| `src/features/pet/petConfig.ts` supplies `el.bg` as `bg-red-50` / `bg-blue-50` / … | A data file consumed by two pages, outside both batches' write scopes, and no audit metric counts it. The pet stage still renders those tiles in the old colour families. |
| `src/features/classroom/components/analytics/DataInsight.tsx` still writes `bg-paper-warm` / `text-slate-*` | It is a component, not a page module, so `legacyTokenPages` does not see it; `Parent/Report` and `Parent/Assignments` render it. |
| `HomeClosingCta`'s desktop state is `text-fg-1` on `bg-role` | A contrast defect inherited verbatim (it was `ink-1` on `primary`) and preserved rather than redesigned mid-migration. One `md:text-role-contrast` fixes it. |
| The `prose` palette on `NewsPage` | Re-pointing the typography plugin at the tokens needs `theme.typography` in the config. |
| A browser-based visual regression baseline | Still deferred: the project does not add dependencies. `shell:verify` and `sweep:verify` are the substitute, and they assert structure and absence of errors, not pixels. |
