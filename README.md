# Think-Class

Think-Class is a full-stack classroom gamification platform for teachers, students, parents, and administrators. It combines day-to-day classroom operations with RPG-style learning motivation: points, pets, quests, auctions, banking, challenges, territory building, papers, analytics, communication, certificates, and public school/site management.

The current codebase has been reorganized around vertical business domains. New frontend business code should enter through `src/features/*`; legacy `src/api/*` files remain as compatibility facades.

## Status

- Current version: `1.6.7`
- Runtime: Node.js `>=24`
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Query
- Backend: Express, TypeScript, SQLite, Prisma where legacy models already use it
- Primary database: local SQLite
- Public routes and legacy HTTP paths are kept compatible

## Product Areas

| Area | Main Capabilities |
| --- | --- |
| Auth and roles | Superadmin, teacher, student, parent login, activation and invite-code flows |
| Classroom operations | Students, classes, groups, presets, features, attendance, leaves, records, bigscreen |
| Engagement | Messages, family tasks, praises, certificates, redemptions, lucky draw, announcements, danmaku |
| Learning content | Assignments, exams, smart papers, submissions, knowledge graph, wrong questions, study plans |
| Marketplace | Shop items, auctions, blind boxes, student purchases and teacher management |
| Pet and play domains | Pets, dungeon, gacha, battles/brawl, territory/SLG |
| Economy and challenges | Bank accounts, stocks, challenge questions, world boss |
| Platform and portal | Admin CMS, teachers, activation codes, audit logs, OpenAPI, public website, settings, payment hooks |

## Architecture

```text
api/
  modules/              Domain-oriented backend module entry points
  routes/               Legacy route registration and compatibility fallback
  services/             Shared backend services

src/
  features/             Frontend domain APIs, hooks, page exports
  shared/               DTO and payload contracts shared by domains
  api/                  Compatibility facades for old imports
  components/           Shared UI components
  pages/                Legacy page locations and route-facing components
```

### Current Module Boundaries

Backend modules currently include:

`admin`, `auth`, `battles`, `challenge`, `classroom`, `collaboration`, `dungeon`, `economy`, `engagement`, `gacha`, `insights`, `learning`, `marketplace`, `pet`, `platform`, `portal`, and `slg`.

Frontend feature modules currently include:

`admin`, `auth`, `battles`, `challenge`, `classroom`, `collaboration`, `dungeon`, `economy`, `engagement`, `gacha`, `learning`, `marketplace`, `pet`, `platform`, `portal`, and `slg`.

See [`docs/modularization-boundary-audit.md`](docs/modularization-boundary-audit.md) for the latest boundary audit and cleanup notes.

## Quick Start

Install dependencies:

```bash
npm install
```

Create or review `.env`:

```env
DATABASE_URL="file:../database.sqlite"
SUPERADMIN_USERNAME="superadmin"
SUPERADMIN_PASSWORD="superadmin"
```

Start the full development stack:

```bash
npm run dev
```

Or start the services separately:

```bash
npm run client:dev
npm run start
```

Default local accounts depend on the active database seed. With the included local configuration, the superadmin account is controlled by `SUPERADMIN_USERNAME` and `SUPERADMIN_PASSWORD`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite and backend dev server together |
| `npm run client:dev` | Start only the Vite frontend |
| `npm run start` | Start the Express API server |
| `npm run check` | Run TypeScript checking |
| `npm run test` | Run Vitest test suite |
| `npm run lint` | Run ESLint |
| `npm run build` | Type-check and build the frontend |
| `bash pack.sh` | Build the production release zip |

## Validation

Before publishing changes, run:

```bash
npm run check
npm run test
npm run lint
npm run build
```

For release packaging:

```bash
bash pack.sh
```

`pack.sh` creates `think-class-release.zip` with the built frontend, API server, deployment scripts, Prisma files when present, and package manifests.

## Development Guidelines

- Prefer `src/features/<domain>` for new frontend API clients, hooks, query keys, and page exports.
- Keep `src/api/*` as compatibility facades for old imports and tests.
- Keep public HTTP paths stable unless a migration plan explicitly says otherwise.
- Reuse shared backend services for password handling, student lookup, points, and feature guards.
- Do not introduce database schema changes as part of boundary-only refactors.
- Keep UI behavior compatible during domain migrations unless the task explicitly includes a redesign.

## Release Notes

The latest release notes are in [`release-notes-v1.6.7.md`](release-notes-v1.6.7.md).

GitHub releases are published from tags such as `v1.6.7` and include the generated production package `think-class-release.zip`.

## Deployment

For Linux servers, use the install script from the repository:

```bash
wget -O install.sh https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh
```

If direct GitHub access is slow or unreliable:

```bash
wget -O install.sh https://ghproxy.net/https://raw.githubusercontent.com/xhnhhnh/Think-Claass/main/install.sh && bash install.sh
```

The deployment scripts manage dependency installation, Prisma generation, package download, and PM2 restart behavior through shared helpers in `scripts/deploy-common.sh`.

## Compatibility Notes

- Legacy backend paths remain available as fallbacks.
- Legacy frontend imports through `src/api/*` remain available.
- Payment flows are kept compatible with the existing provider and mock behavior.
- The main known non-blocking build warning is Vite's large chunk warning; route-level code splitting is intentionally left as a separate performance project.

## License

MIT
