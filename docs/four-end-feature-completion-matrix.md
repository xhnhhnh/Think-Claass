# Four-End Feature Completion Matrix

Updated: 2026-05-24 17:49 +08:00

## Completion Contract

- Scope is the functionality already exposed by current routes, pages, API modules, and release docs.
- Card-key activation is the production-ready account opening path for this round.
- Payment provider configuration and service boundaries remain available for future real-channel integration, but live WeChat/Alipay collection is not part of this round.
- Frontend business calls should enter through `src/features/*`; `src/api/*` remains a compatibility surface.
- Public HTTP paths remain compatible with the existing `/api/*` routes.

## Platform And Admin

| Capability | Super Admin | Teacher | Parent | Student | Status |
| --- | --- | --- | --- | --- | --- |
| Login and role routing | Admin session and private routes | Teacher private route | Parent private route | Student private route | Connected |
| Activation | Generate and audit activation codes | Sees activated class users through normal rosters | Uses activation page | Uses activation page | Connected |
| Payment boundary | Config retained in system settings | Not applicable | Redirects to activation when inactive | Redirects to activation when inactive | Card-key complete, real payment deferred |
| CMS and public site | Announcements, articles, website sections | Announcement banner | Announcement banner where used | Announcement banner where used | Connected |
| System operations | Stats, settings, audit logs, database export/import/reset | Not applicable | Not applicable | Not applicable | Connected |
| Open API | API keys and public school entries | Not applicable | Not applicable | Not applicable | Connected |

## Classroom And Learning

| Capability | Super Admin | Teacher | Parent | Student | Status |
| --- | --- | --- | --- | --- | --- |
| Teacher and class setup | Teacher CRUD | Class, group, student, feature management | Bound student data | Class-scoped dashboard data | Connected |
| Points and records | Audit visibility | Award/deduct and record history | Growth report | Points balance and history | Connected |
| Attendance and leaves | Audit visibility | Attendance and leave review | Leave request | Report visibility | Connected |
| Assignments and exams | Aggregate counts | Create assignments and exams, grade tracking | Assignment visibility | Submit assignments, view exam results | Connected |
| Papers and knowledge graph | Aggregate counts | Subjects, knowledge graph, papers, editor | Report visibility | Paper attempts, wrong questions, study plan | Connected |

## Engagement And Marketplace

| Capability | Super Admin | Teacher | Parent | Student | Status |
| --- | --- | --- | --- | --- | --- |
| Messages and home-school communication | Audit visibility | Read and reply | Send and read | Interactive wall and peer review | Connected |
| Family tasks | Feature setting | Enables class feature | Create/update/delete tasks | Receives point changes through linked student | Connected |
| Praises and certificates | Audit visibility | Create certificates and praises | Report visibility | Certificate and achievement views | Connected |
| Shop and redemption | Audit visibility | Item CRUD and verification | Report visibility | Buy, view tickets, redeem | Connected |
| Auctions, blind boxes, lucky draw | Audit visibility | Manage auctions, boxes, draw config | Not applicable | Bid, unbox, draw | Connected |

## Gamification And Analytics

| Capability | Super Admin | Teacher | Parent | Student | Status |
| --- | --- | --- | --- | --- | --- |
| Pets and gacha | Asset/config boundary | Manage pet appearance and class pet state | Dashboard pet view | Adopt, interact, draw pets | Connected |
| Economy | Aggregate counts | Stock management | Report visibility | Bank and trades | Connected |
| Dungeon, challenge, world boss | Aggregate counts | Boss management and class challenge visibility | Report visibility | Run dungeon, answer challenge, attack boss | Connected |
| Territory and battles | Aggregate counts | Configure territories and battles | Not applicable | Contribute and join battles | Connected |
| Analytics and bigscreen | System stats | Class analytics and bigscreen | Growth report | Student-facing summaries | Connected |

## Remaining Hardening Items

- Production page/component imports from legacy `@/api/*` have been migrated to `src/features/*/api` facades; `src/api/*` now remains a compatibility surface for legacy callers and tests.
- Keep all role guards using fresh class-feature data where a user belongs to a class.
- Add smoke-style tests around activation, feature gating, and cross-role flows as behavior changes land.
- Keep empty states, error states, and disabled feature states consistent across the four roles.

## Current Gap List

| Area | Finding | Status |
| --- | --- | --- |
| Platform/auth | Teacher settings used the admin teacher-update endpoint, which is blocked for teacher actors. | Closed with `PUT /api/auth/profile`, feature API facade, and page test. |
| Classroom facade migration | Parent communication, student lucky draw/shop, teacher dashboard, and class feature panel still imported legacy `@/api/*` directly. | Closed; production pages/components now use `src/features/classroom/api`. |
| Engagement/marketplace | Messages, family tasks, certificates, redemption, shop, auctions, blind boxes, and lucky draw need cross-role regression verification after facade migration. | Closed; home-school sender roles patched and engagement/marketplace tests pass. |
| Gamification/analytics | Pet, gacha, dungeon, challenge, economy, territory, battles, bigscreen, teacher analysis, and parent report need route/API smoke verification. | Closed; targeted service/hook/page tests pass. |
| UX hardening | Disabled feature, empty, error, and role fallback states are present but still need final route smoke. | Closed; browser smoke covered four logins and 69 role routes. |
