English | [简体中文](CONTRIBUTING.zh-CN.md)

# Contributing to Think-Class

Thank you for taking the time to make Think-Class better. The project is a full-stack classroom gamification platform: a React/Vite frontend, a NestJS/Express backend on SQLite, a minimal kernel with plugins, and a WeChat mini program. Contributions of every size are welcome — code, documentation, translation fixes, bug reports and design feedback.

## What we welcome

- **Code**: frontend features, backend behaviour, plugins, kernel and runtime improvements, and the tests for them.
- **Documentation**: fixes to the English documents and to their Chinese translations. A translation fix is a real contribution, not a second-class one.
- **Reports**: reproducible bugs, accessibility problems, confusing error messages and stale documentation.
- **Reviews and design feedback** on open issues and pull requests.

By participating you agree to follow the [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) ([简体中文](CODE_OF_CONDUCT.zh-CN.md)). Do not report a security issue in public: follow [SECURITY.md](SECURITY.md) ([简体中文](SECURITY.zh-CN.md)) instead.

## Before you start

Read these first; each answers a different question:

- [README.md](README.md) ([简体中文](README.zh-CN.md)) — setup, configuration, scripts, validation and deployment.
- [AGENTS.md](AGENTS.md) ([简体中文](AGENTS.zh-CN.md)) — the working agreement: architecture boundaries, red lines and the checks a change needs. It is written for AI agents and applies to human maintainers who work the same way.
- [docs/README.md](docs/README.md) ([简体中文](docs/README.zh-CN.md)) — the map of every document in the repository.
- [docs/migration/HANDOFF.md](docs/migration/HANDOFF.md) — required reading before touching the kernel, the plugin boundary or a migration; it is the authoritative entry point for the architecture refactor.
- [.env.example](.env.example) — the tracked configuration template.

**The workspace, `git` and command output are the source of truth.** Documents are written by people and can lag; when a document and the tree disagree, trust the tree, fix the document in the same change, and say so in the commit message. Do not change working code to match a stale document.

## Prerequisites and the first run

### Requirements

- Node.js >= 24 (see the [`engines`](package.json) field) and npm. No global tooling is required.
- `npm` is the canonical package manager and `package-lock.json` is the canonical lockfile. Do not switch to pnpm or yarn, and do not regenerate the lockfile as a side effect of another change.
- Windows is a supported development environment. The shell scripts (`install.sh`, `update.sh`, `pack.sh`) are Bash: run them through Git Bash or WSL. `update.ps1` exists for Windows deployments.

Install the dependencies:

```bash
npm install
```

### Configure the environment

Create your local configuration from the tracked template:

```bash
cp .env.example .env
```

Three values are required, and none of them has a default:

```env
SUPERADMIN_USERNAME="<your-admin-name>"
SUPERADMIN_PASSWORD="<unique-strong-password>"
ENCRYPTION_KEY="<32 characters>"
```

- `SUPERADMIN_USERNAME` and `SUPERADMIN_PASSWORD` create the superadmin account. There is no default account and no fixed password; a database with no superadmin row and no variables refuses to boot.
- `ENCRYPTION_KEY` must be **exactly 32 bytes** and has no default anywhere in the source (guardrail G18). It encrypts student names at rest and every instance of a deployment must use the same value. Generate it once with the README's one-liner:

```bash
node -e "console.log(require('node:crypto').randomBytes(16).toString('hex'))"
```

Never regenerate the key casually: losing it makes existing encrypted student names unreadable. When a rotation is genuinely required, re-encrypt the existing rows first, as described in the header of [`scripts/rotate-encryption-key.mjs`](scripts/rotate-encryption-key.mjs).

`.env` holds secrets and must never be committed. Local state such as `database.sqlite*`, `uploads/`, `logs/` and `dist/` is ignored by git as well.

### Start the development stack

```bash
npm run dev
```

This runs Vite and the API together: the frontend is on `http://localhost:5173` and proxies `/api` to the API on `http://localhost:3001`. The superadmin console is at `/beiadmin`. To run the two halves in separate terminals, use `npm run client:dev` and `npm run start`.

The first boot creates the superadmin account from the environment variables and nothing else. No teacher, student or parent account is seeded: teachers register themselves (or an admin creates them in the console), and students and parents are added by their teacher. The database is a local SQLite file; the rest of the configuration is optional and documented in [README.md](README.md) ([简体中文](README.zh-CN.md)).

> **Editing `plugins/**` or `packages/**` does not restart the API.** `npm run dev` starts the server through `nodemon`, whose watch list is `api/` only ([`nodemon.json`](nodemon.json)). Restart it by hand, or run `npm run start` under your own watcher, while working in a plugin.

## Architecture in 60 seconds

- `packages/kernel` owns storage and migrations, settings, audit, the HTTP shell and auth primitives. It contains no business knowledge — not a table name, not a feature key.
- `packages/plugin-runtime`, `packages/plugin-sdk` and `packages/contracts` are the plugin host, the API a plugin compiles against, and the pure shared types.
- Every business domain is a plugin under `plugins/<slug>/` with a `plugin.json` manifest. Plugins talk to each other only through published ports (`ctx.provide` / `ctx.use` / `ctx.tryUse`).
- Frontend features live in `src/features/<domain>/`; `api/` is the composition root that mounts the kernel and the plugins.
- Tests live in `tests/`: the `app`, `backend`, `e2e`, `guardrails` and `miniprogram` projects. The `backend` project boots a real plugin host and real databases.

Read [docs/migration/HANDOFF.md](docs/migration/HANDOFF.md) for the architecture refactor, [docs/design-system.md](docs/design-system.md) before changing UI, and [docs/branch-strategy.md](docs/branch-strategy.md) before adding a branch: `main` is the only long-lived branch, and the mini program client lives in `miniprogram/` on it.

## Where a change goes

| Change | Where it belongs |
| --- | --- |
| A new backend domain or route | `plugins/<slug>/` with a conforming `plugin.json`; register routes, ports and cleanup rules in `src/index.ts`. Never add a module under `api/`. |
| A frontend feature | `src/features/<domain>/` (API client, hooks, page exports), with shared UI from `src/components/`. |
| A route, page registration or design-system change | Register the route in `src/app/routing/` and regenerate the module map with `npm run route-modules`; read [docs/design-system.md](docs/design-system.md) before changing UI. |
| Kernel, plugin runtime, plugin SDK or contracts | `packages/kernel`, `packages/plugin-runtime`, `packages/plugin-sdk` and `packages/contracts`. `packages/contracts` is types only, with no runtime code. |
| Generated files, snapshots and ratchet baselines | Regenerate with the npm script that owns them — `npm run route-modules`, `npm run class-features`, `npm run api:surface:update`, `npm run ui:audit`, `npm run baseline`. Never edit them by hand. |
| Documentation | Update the English file and its `.zh-CN.md` translation together, and add every new `docs/**/*.md` to both `docs/README.md` indexes. |

If a change seems to require the kernel to know a business name, the design is wrong: publish a port or add an infrastructure-tier plugin instead.

## Validation by change type

Choose the smallest set that actually covers the change, then run the full gate before claiming it is done.

| Change | Minimum local checks |
| --- | --- |
| Documentation, README or translations | `npm run guard` (documentation standards and links) |
| Frontend UI or client code | `npm run check`, `npm run test:app`, `npm run lint`, `npm run guard` |
| Backend or plugin behaviour | `npm run check`, `npm run test:backend`, `npm run test:e2e`, `npm run guard` |
| New or changed HTTP route | the backend set plus `npm run api:surface:check` and `npm run auth:audit` |
| Schema or migration | `npm run check`, `npm run test:backend`, `npm run test:e2e`, `npm run guard` |
| Plugin manifest or ports | `npm run guard`, `npm run test:backend` |
| WeChat mini program | `npm run miniprogram:check` and the mini program tests under `tests/miniprogram` |
| Version or release | `npm run release` (it runs the gates); never edit the version by hand |

`npm test` runs all four test projects: `app`, `backend`, `e2e` and `guard`. Run a single project with `npm run test:app`, `npm run test:backend` or `npm run test:e2e` while iterating, but the full gate still applies before a pull request.

The gates CI enforces, in order, are:

```bash
npm run check
npm run api:surface:check
npm run miniprogram:check
npm run guard
npm test
npm run lint            # local only; not part of the release workflow
```

The only GitHub workflow that exists today triggers on release tags (`v*`) and manual dispatch; there is no pull-request workflow. **A pull request must include the local gate output** — the commands and their results — in its verification section. A checklist without evidence is not verification.

## Commit and pull request conventions

The repository uses Conventional Commits: a type from `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `release`, `ci` or `style`, an optional scope, and a subject that may be Chinese or English.

```text
type(scope): summary in one line

Why this change is needed, what it deliberately does not do, and any trap
that the next reader would otherwise fall into.

Verification: the commands that were run and their result.
```

- **One concern per pull request.** Do not bundle a refactor, a fix and a feature; a diff nobody can review is not reviewed.
- **No unrelated drive-by fixes.** During a migration, record a defect and its fix instead of changing behaviour while you are in the area — an unrequested change does not turn a test red.
- Fill in the [pull request template](.github/PULL_REQUEST_TEMPLATE.md), including the verification evidence, and link the issue when one exists.
- Disclose AI assistance when a change was largely generated, and be able to explain and test it.

## Documentation and translations

- Long documents are kept in English plus a `.zh-CN.md` translation. **Update both in the same change**, and treat the English file as canonical when they disagree.
- Add every new `docs/**/*.md` to both indexes: [docs/README.md](docs/README.md) ([简体中文](docs/README.zh-CN.md)).
- A paired Chinese file states at its top that it is a translation of the English file and that the English version wins; keep that notice accurate.
- Do not hardcode volatile counts or hashes (plugins, endpoints, tests, versions, branch names, HEAD). State the command that produces the number and let the command output be authoritative.
- If a document is stale, fix it in the same commit rather than citing it; if the fix is too large for the current change, say so and record it.

## Release process (maintainers only)

A release is one atomic event: a tag. Only maintainers cut releases. The normative numbering rules are in [VERSIONING.md](VERSIONING.md) ([简体中文](VERSIONING.zh-CN.md)); [docs/versioning.md](docs/versioning.md) is the design record.

```bash
npm run release -- patch        # also: minor | major
npm run release -- minor --push # cut it, then push the commit and the tag
```

The script runs the gates, writes the version in exactly one place (`package.json`), updates the changelog and tags the commit that passed. It never publishes. **Pushing the tag is what publishes**: CI re-runs the gates, builds the archive from a clean checkout, writes `SHA256SUMS` and creates the GitHub Release, which deployments verify before updating.

Never hand-edit the version, the top CHANGELOG section or a tag. The normative rules are in [VERSIONING.md](VERSIONING.md) ([简体中文](VERSIONING.zh-CN.md)); [docs/versioning.md](docs/versioning.md) is the design record.

## License

Think-Class is released under the MIT License; see [LICENSE](LICENSE). Contributions are accepted under the same license, so inbound contributions are outbound under MIT.

## Getting help

- Open a GitHub issue for bugs, documentation problems and feature proposals. Use the issue templates when they fit.
- Read [docs/README.md](docs/README.md) ([简体中文](docs/README.zh-CN.md)) before asking where something lives; it indexes the whole documentation set.
- For security issues, follow [SECURITY.md](SECURITY.md) ([简体中文](SECURITY.zh-CN.md)); never file them publicly.
- The project does not promise a response time or an SLA. A clear report with reproduction steps and the commands you ran is the fastest way to get help.
