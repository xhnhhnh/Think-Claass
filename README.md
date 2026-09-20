<h1 align="center">Think-Class</h1>

<p align="center">
  A full-stack classroom gamification platform for teachers, students, parents and administrators.
</p>

Think-Class pairs the day-to-day work of running a classroom with RPG-style motivation: points,
pets, quests, auctions, banking, challenges, territory building, papers, analytics, messaging,
certificates, and public school/site management.

The codebase runs on a **minimal Core + unlimited Plugins** architecture. A small kernel owns
storage, migrations, settings, audit, auth primitives and the HTTP shell; every business domain
ships as a plugin that declares the tables, routes, permissions and ports *it* owns. The kernel
contains no business table names, and plugins never import each other directly.

## Status

| | |
| --- | --- |
| Version | [`package.json`](package.json) → `version` is the single source of truth, and the top [CHANGELOG.md](CHANGELOG.md) entry must match it. See [docs/versioning.md](docs/versioning.md) |
| Runtime | Node.js >= 24 ([`engines`](package.json)) |
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS 3, TanStack Query 5, Zustand |
| Backend | NestJS 11 + Express 4, TypeScript, run through `tsx` |
| Database | SQLite via `better-sqlite3`; migrations are forward-only and checksummed |
| Plugins | 20 under [`plugins/`](plugins) — see the list below |

The README deliberately does not repeat the version number: it said `1.6.7` for two major
releases after the project had moved on. That is what `package.json` is for.

## Architecture

```text
packages/
  kernel/           Core: storage + migrations, settings, audit, HTTP shell, auth primitives
  plugin-runtime/   Discovers plugins from manifests and boots them
  plugin-sdk/       The API a plugin compiles against (ctx.db, ctx.audit, ctx.cleanup, ...)
  contracts/        Pure types shared across the plugin boundary (no runtime code)

plugins/
  <slug>/           One business domain: a plugin.json manifest plus src/ — controllers,
                    service/repository, support, and an index.ts where the plugin registers
                    its routes, ports (ctx.provide) and cross-domain cleanup rules.

api/                Composition root: server.ts, app.ts, app.module.ts, db.ts, maintenance.ts
src/
  features/         Frontend domain modules (API clients, hooks, page exports)
  components/       Shared UI, including BrandMark / WebsiteIcon
  pages/            Route-facing legacy page locations
  hooks/ lib/ store/ mocks/ app/    Cross-cutting frontend infrastructure
tests/              Vitest suites: app, backend, guardrails
docs/               Design records and the migration archive
```

The 20 plugin domains:

```text
admin  assignments  battles  challenge  classroom  collaboration  dungeon  economy
engagement  gacha  identity  insights  learning  marketplace  parent-buff  payment
pet  portal  slg  system
```

`api/modules/` no longer exists — every domain is a plugin now.

### The rules the architecture is held to

These are enforced by the guardrail suite ([`tests/guardrails/`](tests/guardrails)), not by
convention:

- **Plugins talk to each other only through published ports.** A domain publishes one with
  `ctx.provide('<slug>.public', ...)` and another consumes it with `ctx.use(...)` — or
  `ctx.tryUse(...)` for an optional dependency that degrades instead of failing. A raw import
  across plugins is allowed only through that plugin's `public.ts`; nothing needs one today.
- **The kernel never imports a plugin**, and contains zero business knowledge — not a table name,
  not a feature key.
- **`packages/contracts` is types only.**
- **Schema lives only in migrations.** `api/db.ts` may not contain `ADD COLUMN` / `CREATE INDEX`.
- **The HTTP surface is frozen by a snapshot.** `npm run api:surface:check` fails on unintended
  drift, so a refactor can change who implements a route without changing the route.
- **Every `plugin.json` conforms** — required fields, no self-dependency, semver ranges on
  `dependsOn`.
- **`ENCRYPTION_KEY` has no default anywhere in the source.**

Migrating a domain means moving its routes, tables and ports into `plugins/<slug>` in a single
commit, so the endpoint snapshot and the route-collision guardrail never see an intermediate
state.

## Quick Start

Requirements: Node.js >= 24 and npm. No global tooling.

```bash
npm install
```

Create a `.env` in the repository root:

```env
# Which SQLite file to open, relative to the repository root. Default: database.sqlite
DATABASE_FILE="database.sqlite"

# Required on the first boot: they create the superadmin account, and there is no default.
# Change them before the instance is reachable from a network.
SUPERADMIN_USERNAME="superadmin"
SUPERADMIN_PASSWORD="superadmin"

# Required. Exactly 32 bytes, and every instance of this deployment must use the same value.
ENCRYPTION_KEY="<32 characters>"
```

Generate a key:

```bash
node -e "console.log(require('node:crypto').randomBytes(16).toString('hex'))"
```

> **`ENCRYPTION_KEY` is not optional.** Student names are encrypted at rest, and since 2.0.0 the
> application refuses to fall back to a default — a missing or wrong-length key is an error at the
> first value that needs it (guardrail G18). Losing the key makes existing encrypted names
> unreadable; rotating it means re-encrypting the existing rows first, as described in the header of
> [`scripts/rotate-encryption-key.mjs`](scripts/rotate-encryption-key.mjs).
>
> The key is read lazily, so the server still boots without it — it fails when a name is actually
> encrypted or decrypted, not at import time.

Start the full development stack:

```bash
npm run dev
```

That runs Vite and the API together. The frontend is on `http://localhost:5173` and proxies `/api`
to the API on `http://localhost:3001` ([`vite.config.ts`](vite.config.ts)). The superadmin console
is at `/beiadmin`.

Run the two halves separately when you want them in their own terminals:

```bash
npm run client:dev   # Vite only
npm run start        # API only
```

> **Editing `plugins/**` or `packages/**` will not restart the API.** `npm run dev` starts the
> server through `nodemon`, whose watch list is `["api"]` ([`nodemon.json`](nodemon.json)) — a
> leftover from when every domain lived under `api/`. Restart it by hand, or run
> `npm run start` under your own watcher, while working in a plugin.

The superadmin account is created on the first boot from `SUPERADMIN_USERNAME` and
`SUPERADMIN_PASSWORD`, and only from them — a database with no superadmin row and no variables
refuses to boot rather than falling back to a published default ([`api/db.ts`](api/db.ts)). Every
other account is created in the app: teachers register themselves (or an admin creates them in the
console) and students and parents are added by their teacher. The boot seeds no example teacher,
class, shop item or point preset, and there is no fixed student or parent password.

### Configuration

Everything else is optional and read from the environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API port |
| `DATABASE_FILE` | `database.sqlite` | SQLite file, resolved against the repository root |
| `UPLOADS_DIR` | `uploads` | Uploaded files |
| `STATIC_DIR` | `dist` | Built frontend, served when it exists |
| `ADMIN_PATH` / `VITE_ADMIN_PATH` | `/beiadmin` | Superadmin console base path |
| `LOG_LEVEL` | `info` (`silent` under `NODE_ENV=test`) | Root log level |
| `KERNEL_ENABLED` | unset | Unset boots the legacy Nest root; `1` boots the kernel as the composition root instead (`isKernelEnabled()` in [`api/app.ts`](api/app.ts)). Plugins mount in both — see the next row |
| `PLUGINS_ENABLED` | `true` | Maps to `pluginsEnabled`. Without the host the legacy root has no modules at all — every domain is a plugin and [`api/app.module.ts`](api/app.module.ts) declares `imports: []` — so this is the default composition's only source of business routes. Setting `0` is only meaningful together with `KERNEL_ENABLED=1` (kernel-only); with the legacy root, `PLUGINS_ENABLED=0` used to leave `/api/students`, `/api/classes`, `/api/auth/login` and every sibling answering 404 while `/api/health` still answered 200, and it is now refused at boot by `assertUsableComposition()` ([`api/app.ts`](api/app.ts)) |
| `PLUGIN_DIRS` | `plugins,plugins-ext` | Directories scanned for plugin manifests |
| `SESSION_TTL_MS` | 7 days | Session lifetime |
| `ALLOW_LEGACY_HEADER_AUTH` | `false` | Accepts `x-user-role` / `x-user-id` as identity. These headers are client-supplied and cannot be verified, so with this on any caller becomes any user — including `superadmin` — and every per-endpoint authorization check becomes advisory. Closed by default; set `1` only for a deployment that genuinely still needs the bridge (every bridged request is logged). See [`packages/kernel/src/auth`](packages/kernel/src/auth) |
| `THINK_CLASS_ROOT` | `process.cwd()` | Deployment root |

The two composition switches are set by nothing in this repository: `install.sh`, `update.sh`,
`update.ps1`, `pack.sh`, `nodemon.json` and `package.json` set neither, and the PM2 launcher runs
`npm run start` with the environment as-is ([`scripts/deploy-common.sh:325`](scripts/deploy-common.sh)).
The defaults above are therefore also the deployed configuration, which is why `PLUGINS_ENABLED`
defaulting to `true` is load-bearing rather than a preference.

`assertUsableComposition()` ([`api/app.ts`](api/app.ts)) is fail-closed on both of its branches: the
legacy root with `PLUGINS_ENABLED=0`, and a plugin host that is enabled but activated zero plugins,
both **throw at boot** rather than start. Neither is hypothetical — the first was what every launcher
ran before the default changed, and the only symptom was the business surface: `/api/health` answered
200 with `plugins: { total: 0, active: 0 }` while `/api/students`, `/api/classes`, `/api/auth/login`,
`/api/pet/health` and `/api/website/home` all answered 404. [`api/index.ts`](api/index.ts) (the Vercel
entry) goes through the same `createApp()`, so a serverless deployment was exposed the same way.

`DATABASE_URL` is **not** the runtime switch. The Prisma CLI reads it from `.env`; the application
resolves `DATABASE_FILE` ([`packages/kernel/src/config/loadConfig.ts`](packages/kernel/src/config/loadConfig.ts)),
and `api/prismaClient.ts` passes that same file to Prisma explicitly so the two cannot diverge.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite + API together |
| `npm run client:dev` | Vite only |
| `npm run start` | API only (`tsx api/server.ts`) |
| `npm run server:dev` | API under `nodemon` |
| `npm run build` | `tsc -b` and build the frontend into `dist/` |
| `npm run preview` | Serve the built frontend |
| `npm run check` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Full Vitest suite: app + backend + guardrails |
| `npm run test:app` | Frontend and legacy `api/**` suites (jsdom + MSW) |
| `npm run test:backend` | Kernel and server-side suites (node), including a real plugin host |
| `npm run guard` | Guardrail suite only |
| `npm run api:surface:check` | Fail if the HTTP surface drifted |
| `npm run measure` | Migration ratchets: endpoints, dead code, adopted tables |
| `npm run release` | Cut a version — dry-run unless `--push` |
| `bash pack.sh` | Build the production zip |

## Validation

Run this before publishing changes. The first four are the gates CI enforces, in the same order
([`.github/workflows/release.yml`](.github/workflows/release.yml)):

```bash
npm run check
npm run api:surface:check
npm run guard
npm test
npm run lint            # local only; not part of the release workflow
```

The default composition (no composition variables set) must serve business routes. Nothing in the
repository sets `PLUGINS_ENABLED`, so the default is what actually ships, and the failure mode when it
is wrong is silent: `/api/health` still answers 200 with `plugins: { total: 0, active: 0 }` while the
whole business surface 404s. [`tests/plugins/legacy-default-composition.test.ts`](tests/plugins/legacy-default-composition.test.ts),
which the `backend` project collects ([`vitest.backend.config.ts:29`](vitest.backend.config.ts)) and so
`npm test` enforces, boots a real subprocess to pin the default **and** both edges of it: with `KERNEL_ENABLED` and
`PLUGINS_ENABLED` both deleted from the child environment, `/api/kernel/info` must report
`pluginsEnabled: true`, `/api/kernel/plugins` must list the 20 plugins, `/api/website/home` must answer
200, and `/api/pets/999` must reach the pet controller's own `Student not found` rather than Nest's
`Cannot GET` catch-all; legacy + `PLUGINS_ENABLED=0` must **fail to start** with a message naming the
variable; and `KERNEL_ENABLED=1 PLUGINS_ENABLED=0` (kernel-only) must still start and answer
`/api/health` with `kernel.plugins.total === 0`, with `/api/students` answering the kernel's own
`NOT_FOUND` envelope rather than a plugin route.

`tests/plugins/legacy-boot-probe.test.ts` covers the same composition but pins `PLUGINS_ENABLED=1`
explicitly, which is precisely the configuration nothing deploys.

For release packaging, `bash pack.sh` builds `think-class-release.zip` containing the built
frontend, the API server, the kernel and runtime packages, all plugins, the deployment scripts and
the package manifests.

## Releases and versioning

A release is one atomic event: a tag. The process is described in [docs/versioning.md](docs/versioning.md)
and enforced by guardrail G19.

```bash
npm run release -- patch        # also: minor | major | 2.1.0 | 2.1.0-rc.1
npm run release -- minor --push # cut it, then push the commit and the tag
```

The script runs the gates, writes the version in exactly one place, updates the changelog and tags
the commit that passed — it never publishes. Pushing the tag is what publishes: CI re-runs the
gates, builds the archive from a clean checkout of that commit, writes `SHA256SUMS` and creates the
GitHub Release.

Deployments verify that checksum and refuse to update when it is missing or wrong, so a release
*always* carries `think-class-release.zip` and `SHA256SUMS` — an empty release is treated as a
failure, not as a slow download.

## Deployment

On a Linux server:

```bash
wget -O install.sh https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh
```

If GitHub is slow or unreachable from the target, use the mirror:

```bash
wget -O install.sh https://ghproxy.net/https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh
```

`install.sh` and `update.sh` share their helpers in `scripts/deploy-common.sh` and manage
dependencies, Prisma generation, package download and the PM2 restart. Instances can also update
themselves from the superadmin settings page: the updater checks the latest GitHub Release,
downloads the archive, verifies the checksum, restarts the PM2 service and appends progress to
`logs/update.log`, with machine-readable status in `logs/update-status.json`.

> Upgrading a deployment that predates the plugin architecture is not a drop-in step: set
> `ENCRYPTION_KEY` on every instance, and re-encrypt existing rows first if the database already
> holds encrypted names. The upgrade notes are at the top of [CHANGELOG.md](CHANGELOG.md).

## Documentation

| Document | What it is |
| --- | --- |
| [docs/migration/HANDOFF.md](docs/migration/HANDOFF.md) | The authoritative entry point for the architecture refactor: current state, the next objective as acceptance criteria, guardrails, known debt |
| [docs/migration/BOOTSTRAP_PROMPT.md](docs/migration/BOOTSTRAP_PROMPT.md) | The prompt to paste into a fresh session to continue that refactor |
| [docs/migration/00-baseline.md](docs/migration/00-baseline.md) – [04](docs/migration/04-capabilities-and-domains.md) | Phase-by-phase records: baseline freeze, kernel, contracts and auth, plugin runtime, capabilities and domains |
| [docs/migration/admin-cascade-decision.md](docs/migration/admin-cascade-decision.md) | How cross-domain cascade deletion is owned and ordered |
| [docs/versioning.md](docs/versioning.md) | Version rules, the release pipeline, and the three breakpoints it fixed |
| [CHANGELOG.md](CHANGELOG.md) | User-facing changes per release |
| [docs/architecture-refactor.md](docs/architecture-refactor.md) | Earlier refactor notes |
| [后端接口说明/API接口文档.md](后端接口说明/API接口文档.md) | API reference notes |

## Development guidelines

- New frontend business code enters through `src/features/<domain>`. Legacy `src/api/*` files remain
  as compatibility facades.
- A new backend domain is a new `plugins/<slug>` with a manifest, not a new directory under `api/`.
- Keep cross-domain access on published ports (`ctx.use` / `ctx.tryUse`), and keep public HTTP paths
  stable.
- Reuse the shared kernel and runtime services — password handling, student lookup, points,
  feature guards, audit, cleanup — instead of re-implementing them.
- Do not introduce schema changes as part of a boundary-only refactor, and never edit a migration
  that has already been applied: migrations are checksummed and forward-only.
- During a migration, do not "fix it while you are in there". An unrequested behaviour change does
  not turn a test red; record the defect and its fix instead.

## Compatibility notes

- Legacy backend paths remain available as fallbacks, and legacy frontend imports through
  `src/api/*` keep working.
- Payment flows stay compatible with the existing provider and mock behaviour.
- The known non-blocking build warning is Vite's large-chunk warning; route-level code splitting is
  deliberately a separate performance project.

## License

MIT
