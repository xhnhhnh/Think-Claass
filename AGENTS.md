English | [简体中文](AGENTS.zh-CN.md)

# AGENTS.md

This file is the working agreement for AI agents (Codex, Claude Code, Cursor, Copilot, and others) and for maintainers who work the same way. It is intentionally specific to Think-Class. [`CONTRIBUTING.md`](CONTRIBUTING.md) ([简体中文](CONTRIBUTING.zh-CN.md)) covers the human contributor workflow; this file covers how to work without breaking the architecture, the data, or the release chain. Security reports follow [`SECURITY.md`](SECURITY.md) ([简体中文](SECURITY.zh-CN.md)); participation follows [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) ([简体中文](CODE_OF_CONDUCT.zh-CN.md)).

## 1. How to use this file

### 1.1 Precedence

When sources disagree, trust them in this order:

1. The workspace, `git`, and command output.
2. This file.
3. [`README.md`](README.md) ([简体中文](README.zh-CN.md)) for product, setup, configuration and deployment.
4. [`docs/README.md`](docs/README.md) ([简体中文](docs/README.zh-CN.md)) for the document map, and the document itself.

If a document says something the tree contradicts, the tree wins. Fix the document in the same change and say so in the commit message. Do not "fix" the code to match a stale document.

### 1.2 Start every session with verification

Run these before planning:

```bash
git status --short
git log --oneline -5
git rev-parse --abbrev-ref HEAD
```

If `git status` is dirty, decide whether the change is finished-but-uncommitted or broken; do not assume a previous session stopped where its summary says. Read [`docs/migration/HANDOFF.md`](docs/migration/HANDOFF.md) for the refactor history and [`docs/migration/BOOTSTRAP_PROMPT.md`](docs/migration/BOOTSTRAP_PROMPT.md) for the long-running refactor prompt, but treat their status sections as historical. Numbers in docs (plugins, endpoints, tests, ratchet allowances, HEAD) go stale; get the current value from a command.

### 1.3 Do not claim work you did not verify

Never report a test, type-check, build, or endpoint as passing unless it ran in this session. If a command could not run (sandbox, network, missing dependency), report the exact command and error. Do not edit tests, snapshots, or configuration to make a gate green.

## 2. Repository shape

The project is a full-stack classroom gamification platform. One API and one database serve four consoles (superadmin, teacher, student, parent) and a WeChat mini program.

```text
api/                    Composition root: server.ts, app.ts, app.module.ts, db.ts, maintenance.ts
packages/
  kernel/               Storage and migrations, settings, audit, HTTP shell, auth primitives
  plugin-runtime/       Discovers manifests and boots plugins
  plugin-sdk/           The API a plugin compiles against (ctx.db, ctx.audit, ctx.cleanup, ports)
  contracts/            Pure shared types (no runtime code)
plugins/<slug>/         One business domain: plugin.json plus src/, public.ts and index.ts
src/
  features/<domain>/    Frontend business modules
  components/           Shared UI and the design-system kit
  app/routing/          Route table and generated module map
tests/                  app, backend, e2e, guardrails, miniprogram, plugins
docs/                   Design records, standards, the migration archive and the WeChat guides
miniprogram/            WeChat mini program source (separate TypeScript project)
wechat/                 Developer-tools working copy, gitignored; sync from miniprogram/, never edit as source
scripts/                Release, migration ratchets, security audits and verification scripts
```

Read [`README.md`](README.md) ([简体中文](README.zh-CN.md)) for setup, environment variables and deployment. Read [`docs/design-system.md`](docs/design-system.md) before changing UI. Read [`docs/branch-strategy.md`](docs/branch-strategy.md) before assuming which branch owns what: `main` is the Web release line, and a feature branch may be checked out instead.

## 3. Non-negotiables

### 3.1 Secrets and personal data

- Never commit `.env`, API keys, passwords, AppSecrets, private keys or real student data. [`.env.example`](.env.example) is the only tracked configuration template; real values live in the deployment's environment.
- `ENCRYPTION_KEY` is mandatory and has no default anywhere (guardrail G18). It must be exactly 32 bytes, the same on every instance of a deployment, and backed up. Losing it makes encrypted student names unreadable. Rotate only through [`scripts/rotate-encryption-key.mjs`](scripts/rotate-encryption-key.mjs), never by generating a new key in place.
- Do not print secrets in logs, tests, issues or summaries. Redact names, IDs, tokens and file paths that identify a deployment.
- Use synthetic data in fixtures and tests. Do not copy a production database into the repository or into a test.

### 3.2 Database and migrations

- Migrations are forward-only and checksummed. Never edit a migration that has already been applied; add a new one.
- Schema changes live only in migrations. Do not add `ADD COLUMN`, `CREATE INDEX` or equivalent DDL to [`api/db.ts`](api/db.ts) (guardrail G17).
- The boot schema must satisfy every declaration about it: tables and the hand-maintained column list, plus the reverse direction (SQLite columns that Prisma does not model) — guardrail G13.
- Do not reset, reinitialize or delete a database as a convenience. `npm run local:reinitialize` is destructive and only valid for an unpublished local instance after a verified backup; ask the user first.

### 3.3 Architecture boundaries

- The kernel contains no business knowledge — not a business table name, not a feature key. Guardrail G5.
- Plugins never import each other directly. A domain publishes a port with `ctx.provide('<slug>.public', ...)`; another consumes it with `ctx.use(...)` or `ctx.tryUse(...)`. A raw import is allowed only through the other plugin's `public.ts`.
- [`packages/contracts`](packages/contracts) is type-only (guardrail G6).
- A new backend domain is a new `plugins/<slug>` with a conforming `plugin.json`, not a new directory under `api/`. Do not add static plugin routes to the frontend route entry (guardrail G4).
- Reuse the kernel and runtime services — password handling, student lookup, points, feature guards, audit, cleanup — instead of reimplementing them.

### 3.4 HTTP surface and authorization

- Public HTTP paths are a contract. Do not rename or reshape them casually. If a change is intentional, update the snapshot with `npm run api:surface:update` in the same change and expect [`tests/guardrails/snapshots/api-surface.json`](tests/guardrails/snapshots/api-surface.json) to move.
- Every new endpoint needs a client, otherwise guardrail G22 fails. Add role/permission tests; the e2e project is the layer that catches client/server disagreement.
- Run `npm run auth:audit` after touching routes or authorization. [`docs/security/route-authorization-matrix.md`](docs/security/route-authorization-matrix.md) is a checklist, not a proof: it admits it can lag, and the command is authoritative.
- Keep route collisions at zero (guardrail G11). A domain must not be registered in both `api/` and `plugins/`.

### 3.5 Versioning and releases

- `package.json` `version` is the single source of truth. Do not write the version anywhere else.
- Cut releases only with `npm run release -- patch|minor|major` (dry-run unless `--push`). Never hand-edit the version, the top CHANGELOG section, or a tag. Guardrail G19 enforces that the manifest, CHANGELOG and tags agree.
- Do not add an `## [Unreleased]` heading to [`CHANGELOG.md`](CHANGELOG.md): it would break G19. A release commit updates the CHANGELOG through the script.
- Do not push tags, publish a GitHub Release, or run the release script unless the user explicitly asks. A pushed tag publishes; it is not reversible in the normal workflow.

### 3.6 Dependencies and tooling

- `npm` is the package manager (`package-lock.json` is tracked). Do not switch to pnpm/yarn or regenerate the lockfile as a side effect.
- Do not add, upgrade or remove dependencies unless the user asks. Prefer an existing utility from the repo, the kernel or the plug-in SDK.
- Do not run `npm install` just to make the tree look complete. If a command genuinely needs a missing dependency, stop and report it.
- Keep TypeScript configuration and lint rules intact. `strict` is false by design in this codebase; do not turn it on as an unrelated cleanup.

### 3.7 Destructive operations

Ask for explicit approval before: dropping or reinitializing a database, deleting `uploads/` or `logs/`, force-pushing, rewriting history, deleting a branch, pushing tags, or running install/update scripts against a real deployment. Never run a command whose target path you have not verified.

### 3.8 UI contract

- Never write a raw colour literal or `!important` in a page. Use the design tokens and the component kit documented in [`docs/design-system.md`](docs/design-system.md).
- Use the page scaffold and the shared kit rather than inventing a local layout. Pages must handle loading, empty, error and disabled states; an empty state must not stand in for a failed read (guardrail G24).
- Keep generated files generated: routing and class-feature catalogues come from `npm run route-modules` and `npm run class-features`, not hand edits.

### 3.9 Documentation

- The repository keeps long documents in English plus a `.zh-CN.md` translation. Update both in the same change. The English file is canonical when they disagree.
- Add every new `docs/**/*.md` to both [`docs/README.md`](docs/README.md) ([简体中文](docs/README.zh-CN.md)) indexes. The docs-standards guardrail fails when the index, a link or a pair is out of sync.
- Do not cite volatile counts or hashes in documentation. State the command that produces the number.
- If a document is stale, fix it in the same change rather than leaving a known-false statement. If the fix is too large for the current change, say so and record it.

## 4. Commands

### 4.1 Development

```bash
npm install
npm run dev
npm run client:dev
npm run start
npm run build
npm run preview
```

`npm run dev` starts Vite and the API together — frontend on `http://localhost:5173`, API on `http://localhost:3001`, with `/api` proxied. The superadmin console is at `/beiadmin`. `nodemon` watches only `api/`; editing `plugins/` or `packages/` does not restart the API, so restart it yourself or run `npm run start` under your own watcher.

The first boot requires `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD` and a 32-byte `ENCRYPTION_KEY` in `.env`. There is no default account, no seeded teacher or student, and no fixed password. The rest of the configuration is optional and documented in [`README.md`](README.md) and [`.env.example`](.env.example).

### 4.2 Checks and tests

```bash
npm run check
npm run lint
npm run guard
npm run api:surface:check
npm run auth:audit
npm run miniprogram:check
npm test
npm run test:app
npm run test:backend
npm run test:e2e
```

- `check` is TypeScript with no emit; `lint` is ESLint.
- `guard` is the static guardrail suite — migration ratchets, architecture boundaries, UI contracts, version consistency and the documentation standards. It is fast; run it often.
- `api:surface:check` fails on unintended HTTP surface drift.
- `auth:audit` prints the per-controller authorization inventory and fails on endpoints the tree cannot attribute.
- `miniprogram:check` type-checks the separate mini program project.
- `test` runs all four Vitest projects: `app`, `backend`, `e2e` and `guard`. It is the gate; for a focused change, run the relevant project first and the full suite before claiming done.

The release workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)) runs on `v*` tags and manual dispatch: type-check, API surface, mini program type-check, guardrails, tests, packaging, checksums and publishing. There is currently no pull-request workflow, so a PR must include the local gate output.

### 4.3 Release and packaging

```bash
npm run release -- patch
npm run release -- minor --push
bash pack.sh
npm run local:reinitialize
```

`release` runs the gates, writes the version in one place, updates the CHANGELOG and tags the commit; it never publishes. Pushing the tag is what publishes. `pack.sh` builds `think-class-release.zip`; CI writes `SHA256SUMS` next to it. `local:reinitialize` is destructive; see §3.7.

### 4.4 Environment notes

- Node.js >= 24 is required ([`package.json`](package.json)).
- Windows is a supported development environment. Shell scripts are Bash; run them through Git Bash/WSL. `update.ps1` exists for Windows deployments.
- `uploads/`, `logs/`, `dist/`, `.tmp/` and `database.sqlite*` are local state and must not be committed.
- The mini program source is [`miniprogram/`](miniprogram); [`wechat/`](wechat) is a gitignored copy for the WeChat developer tools. Regenerate it with [`scripts/wechat/sync-miniprogram.mjs`](scripts/wechat/sync-miniprogram.mjs), never by editing the copy.

## 5. What to run for which change

Choose the smallest set that actually covers the change, then run the full gate before reporting done.

| Change | Minimum checks |
| --- | --- |
| Documentation only | `npm run guard` (docs standards + links) |
| Frontend UI or client code | `npm run check`, `npm run test:app`, `npm run guard`, `npm run lint` |
| Backend or plugin behaviour | `npm run check`, `npm run test:backend`, `npm run test:e2e`, `npm run guard` |
| New or changed HTTP route | the above plus `npm run api:surface:check` and `npm run auth:audit` |
| Migration or schema | `npm run check`, `npm run test:backend`, `npm run test:e2e`, `npm run guard` (G13/G17) |
| Plugin manifest or ports | `npm run guard`, `npm run test:backend` |
| Mini program | `npm run miniprogram:check`, the mini program tests under `tests/miniprogram` |
| Version or release | `npm run release` (it runs the gates); do not hand-edit |
| Dependency or build change | `npm run check`, `npm run build`, the relevant test project |

## 6. Where code and docs belong

### 6.1 Backend

A new domain is `plugins/<slug>/`:

```text
plugins/<slug>/
  plugin.json           Manifest: name, version, kernel range, dependsOn, tables, feature flags, routes
  src/                  Controllers, service/repository, support helpers
  src/index.ts          Registers routes, ports and cleanup rules
  src/public.ts         The only surface another plugin may import
```

The kernel and the runtime stay generic. If a change requires the kernel to know a business name, the design is wrong: publish a port instead, or add an infrastructure-tier plugin.

### 6.2 Frontend

New business code enters through `src/features/<domain>/` (API client, hooks, page exports). Shared UI lives in `src/components/` and the design-system kit. Route-facing pages are registered in the route table; generated files are produced by scripts and must not be edited by hand.

### 6.3 Tests

- `tests/app/` — React pages in jsdom against MSW.
- `tests/backend/` — kernel, runtime and plugins against real databases.
- `tests/e2e/` — the composed application over real HTTP, by role.
- `tests/guardrails/` — static architecture and documentation contracts.
- `tests/miniprogram/` — mini program logic.

Prefer adding a test to the project that can actually fail for the defect. A guardrail should be mechanical and explain why it exists; a ratchet may only go down.

### 6.4 Documentation

- Entry points: [`README.md`](README.md) ([简体中文](README.zh-CN.md)), [`AGENTS.md`](AGENTS.md) ([简体中文](AGENTS.zh-CN.md)) and [`docs/README.md`](docs/README.md) ([简体中文](docs/README.zh-CN.md)).
- Architecture/refactor: [`docs/migration/HANDOFF.md`](docs/migration/HANDOFF.md), [`docs/migration/BOOTSTRAP_PROMPT.md`](docs/migration/BOOTSTRAP_PROMPT.md) and the migration records next to them.
- Engineering standards: [`docs/versioning.md`](docs/versioning.md), [`docs/branch-strategy.md`](docs/branch-strategy.md), [`docs/design-system.md`](docs/design-system.md) and [`docs/security/route-authorization-matrix.md`](docs/security/route-authorization-matrix.md).
- WeChat mini program: [`docs/wechat/README.md`](docs/wechat/README.md). These guides are Chinese-only in practice.
- `.trae/documents/` holds historical plans from earlier AI sessions. They are not current instructions; do not cite them as status.

## 7. Change workflow

### 7.1 Plan and scope

- Read the code before changing it. Search for existing helpers before writing a new one.
- One concern per change. Do not bundle a refactor, a fix and a feature.
- During a migration, do not "fix it while you are in there". An unrequested behaviour change does not turn a test red; record the defect and the fix instead.
- Keep diffs reviewable. Do not reformat unrelated files or rename things the task did not ask for.

### 7.2 Commits

The repository uses Conventional Commits with a Chinese or English subject; the body explains why, including constraints that are not obvious from the diff.

```text
type(scope): summary in one line

Why this change is needed, what it deliberately does not do, and any trap
that the next reader would otherwise fall into.

Verification: the commands that were run and their result.
```

Use one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `release`, `ci` or `style`. Scope is usually the domain or tool (`pet`, `wechat`, `release`, `guardrails`, `readme`).

### 7.3 Pull requests

Use [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md). Include the commands and results in the verification section; a checklist without evidence is not verification. Link the issue when one exists. Disclose AI assistance if the change was largely generated, and be able to explain and test it.

### 7.4 Releases

Only maintainers cut releases. The detailed rules are in [`docs/versioning.md`](docs/versioning.md). A release is one atomic event: the tag. Do not create a release from a dirty tree, and do not move a tag after it is published.

## 8. Deployment and operator safety

Deployment assets are [`install.sh`](install.sh), [`update.sh`](update.sh) and [`scripts/deploy-common.sh`](scripts/deploy-common.sh); the updater verifies `SHA256SUMS` and refuses an archive without it. Follow [`README.md`](README.md) for the full procedure and [`docs/wechat/`](docs/wechat/README.md) for the mini program deployment paths.

Production red lines:

- `ENCRYPTION_KEY` set, backed up, and never regenerated.
- `ALLOW_LEGACY_HEADER_AUTH` unset. The header bridge trusts client-supplied identity; with it on, any caller can become any user.
- `WECHAT_ALLOW_DEV_LOGIN` unset in production. The dev login path is refused when `NODE_ENV=production`, but do not rely on that alone.
- The release archive's checksum verified before updating.
- The SQLite database, `uploads/` and `.env` not served publicly, and not committed.
- A unique superadmin password, stored in a password manager, not in a document.

If a secret is exposed, treat it as compromised: rotate the affected credential, and for `ENCRYPTION_KEY` re-encrypt the data first as described in the script header.

## 9. Definition of done

A change is done when:

- The relevant earlier sections are satisfied and the chosen checks are green.
- New behaviour has a test that would fail without the change.
- Documentation pairs and [`docs/README.md`](docs/README.md) ([简体中文](docs/README.zh-CN.md)) are updated when the change affects them.
- No secret, `.env`, student data or local state is staged.
- The version and CHANGELOG are untouched unless this is a release.
- The commit message explains why, and the final summary distinguishes what was verified from what was not.

## 10. When something is unclear

Inspect before asking: read the code, the test, the script or the command output. Ask the user only for decisions that the repository cannot answer — product scope, destructive actions, credentials, legal or publication choices. When asking, state the options and the consequence of each.

If a required command cannot run in the current environment, say so plainly and continue with the checks that can run. A blocked check is not a passed check.
