# Documentation index

English | [简体中文](README.zh-CN.md)

This is the complete index of the repository's documentation. [README.md](../README.md) is the
entry document for product, setup, configuration and deployment; this index maps the rest of the
tree: the entry documents at the repository root, every document under `docs/`, the deployment
assets and the historical records.

## Authority order

When two sources disagree, trust them in this order:

1. The workspace, `git` and command output.
2. [AGENTS.md](../AGENTS.md) — the working agreement for AI agents and maintainers.
3. The [README](../README.md) pair — product, setup, configuration and deployment.
4. This index and the documents it links.

The truth for every volatile number — endpoint count, plugin count, test count, ratchet
allowances, HEAD — is a command output, not a document:

```bash
npm run auth:audit     # per-endpoint authorization inventory
npm run api:surface    # current HTTP surface
npm test               # full test suite and its counts
npm run guard          # guardrail and ratchet numbers
```

If a document disagrees with one of these outputs, the command is right: fix the document in the
same change.

Two documents in this index are entry points whose status can lag behind the tree, and they say so
themselves:

- [docs/migration/HANDOFF.md](migration/HANDOFF.md) is the authoritative entry point for the
  architecture refactor. Its "current state", phase status and numbers are a snapshot from the last
  session that wrote it; verify them against the workspace, `git` and the commands above before
  relying on them. Its rules, guardrails and known-debt sections are the durable part.
- [docs/security/route-authorization-matrix.md](security/route-authorization-matrix.md) admits that
  it lags the route snapshot. `npm run auth:audit` is the authoritative inventory; the matrix is a
  checklist, not a proof.

## Bilingual convention

- Long documents come in pairs: `X.md` (English, canonical) and `X.zh-CN.md` (Chinese translation)
  at the same path. Both are edited in the same change; when they disagree, the English file wins.
- A pair keeps the same heading levels, the same relative link targets (except the reciprocal
  language switch) and the same code fences, so structure can be compared mechanically.
- One-language documents are marked as such in the tables below. Chinese only: the migration
  archive's operational documents, the WeChat mini-program guides, the route-authorization matrix,
  the versioning design record and the branch-strategy document, the older API integration notes and
  the local-reinitialize guide. English only: the P0–P4 phase records and several older engineering
  notes.
- [LICENSE](../LICENSE) is English only. The English text is the legally binding one; do not
  translate it.

## Entry documents

| Document | What it is |
| --- | --- |
| [README.md](../README.md) ([简体中文](../README.zh-CN.md)) | The entry document: product overview, status, architecture, quick start, configuration, scripts, validation and deployment |
| [VERSIONING.md](../VERSIONING.md) ([简体中文](../VERSIONING.zh-CN.md)) | The version numbering and release specification: semver rules, tags, plugin and kernel versions, the single source of truth |
| [AGENTS.md](../AGENTS.md) ([简体中文](../AGENTS.zh-CN.md)) | The working agreement for AI agents and maintainers: authority order, non-negotiables, commands, change workflow, definition of done |
| [CONTRIBUTING.md](../CONTRIBUTING.md) ([简体中文](../CONTRIBUTING.zh-CN.md)) | Local setup, workflow, test commands and the pull-request process |
| [SECURITY.md](../SECURITY.md) ([简体中文](../SECURITY.zh-CN.md)) | How to report a vulnerability privately, and how operators harden a deployment |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) ([简体中文](../CODE_OF_CONDUCT.zh-CN.md)) | Community expectations and how they are enforced |
| [CHANGELOG.md](../CHANGELOG.md) | User-facing changes, one section per release (English only) |
| [LICENSE](../LICENSE) | MIT license text (English only; the binding version) |

## Architecture and refactor

These documents record the refactor from a monolithic `api/` to the minimal-core-plus-plugins
architecture. [docs/migration/HANDOFF.md](migration/HANDOFF.md) is the authoritative entry point;
the phase records are evidence of how it landed, not a statement of the present.

| Document | What it is |
| --- | --- |
| [migration/HANDOFF.md](migration/HANDOFF.md) | The authoritative entry point for the architecture refactor: state, next objective as acceptance criteria, guardrails, known debt. Chinese only; its status can lag — verify with the workspace, `git` and the commands above |
| [migration/BOOTSTRAP_PROMPT.md](migration/BOOTSTRAP_PROMPT.md) | The prompt to paste into a fresh session to continue the refactor; deliberately records rules, not status. Chinese only |
| [migration/00-baseline.md](migration/00-baseline.md) | P0 — baseline freeze: a frozen, green baseline with machine-generated metrics and an HTTP surface snapshot |
| [migration/01-kernel.md](migration/01-kernel.md) | P1 — kernel and workspace skeleton: a minimal core that boots and serves infrastructure endpoints with zero plugins |
| [migration/02-contracts-and-auth.md](migration/02-contracts-and-auth.md) | P2 — contract consolidation and authentication hardening: one contract home, real sessions |
| [migration/03-plugin-runtime.md](migration/03-plugin-runtime.md) | P3 — plugin runtime and reference plugins: discovery, manifest validation, dependency resolution, ports |
| [migration/04-capabilities-and-domains.md](migration/04-capabilities-and-domains.md) | P4 — capability system, audit sink, the `game` split and the domain-to-plugin migration |
| [migration/admin-cascade-decision.md](migration/admin-cascade-decision.md) | The cross-domain cascade-deletion decision: who owns it, in what order, and why atomicity is kept. Chinese only |
| [architecture-refactor.md](architecture-refactor.md) | Earlier vertical-domain refactor notes from before the kernel/plugin architecture |
| [modularization-boundary-audit.md](modularization-boundary-audit.md) | The module-boundary audit and the compatibility surface it left behind |

## Engineering standards

| Document | What it is |
| --- | --- |
| [versioning.md](versioning.md) | The design record behind the version rules: rationale, release pipeline and historical breakpoints. The normative summary is `VERSIONING.md` at the repository root. Chinese only |
| [branch-strategy.md](branch-strategy.md) | Which branch owns what: `main` as the Web release line, the mini-program feature branch, and how the two stay in step. Chinese only |
| [design-system.md](design-system.md) | The front-end presentation layer: tokens, the UI-R shell contract, the interaction model and the commands that keep it in place |
| [security/route-authorization-matrix.md](security/route-authorization-matrix.md) | Per-endpoint authorization matrix. It admits that it lags the route snapshot — `npm run auth:audit` is authoritative. Chinese only |
| [api-integration-checklist.md](api-integration-checklist.md) | Historical front-end API integration and test checklist. Chinese only |
| [four-end-feature-completion-matrix.md](four-end-feature-completion-matrix.md) | Feature completion across the four consoles: superadmin, teacher, parent and student |
| [second-batch-integration-matrix.md](second-batch-integration-matrix.md) | Second-batch page integration matrix. Chinese only |
| [second-batch-integration-report.md](second-batch-integration-report.md) | Second-batch page integration report. Chinese only |

## Operations

| Document | What it is |
| --- | --- |
| [local-reinitialize.md](local-reinitialize.md) | Destructive reinitialization of an unpublished local instance: verified backup, new superadmin credentials, new encryption key. Chinese only |

The deployment assets themselves live at the repository root, not under `docs/`:
[deploy/](../deploy/) (the Dockerfile and the Nginx HTTPS template used by the WeChat Cloud Run
track), [install.sh](../install.sh), [update.sh](../update.sh) and [pack.sh](../pack.sh). The
procedures are described in [README.md](../README.md) and [docs/wechat/](wechat/README.md).

## WeChat mini program

This whole group is Chinese only: it is the deployment, release and competition-submission
documentation for the WeChat mini program. Track A (WeChat Cloud Run) is recommended; Track B
(self-hosted with `install.sh`, Nginx and certbot) is for a server and an already-filed domain.

| Document | What it is |
| --- | --- |
| [wechat/README.md](wechat/README.md) | The mini-program documentation index: the Track A vs Track B decision table, shared prerequisites and the document map |
| [wechat/00-competition-checklist.md](wechat/00-competition-checklist.md) | Competition hard constraints, timeline and the material checklist |
| [wechat/05-action-plan.md](wechat/05-action-plan.md) | The action plan for an individual-subject, serverless, Cloud Run route: one-page quick reference plus red lines |
| [wechat/10-deploy-cloudrun.md](wechat/10-deploy-cloudrun.md) | Track A — deploy on WeChat Cloud Run: no server, no domain, no domain filing |
| [wechat/20-deploy-selfhosted.md](wechat/20-deploy-selfhosted.md) | Track B — self-hosted server: `install.sh`, Nginx and certbot HTTPS |
| [wechat/30-release-miniprogram.md](wechat/30-release-miniprogram.md) | Mini-program console configuration, device preview, upload, review, release and rollback |
| [wechat/40-troubleshooting.md](wechat/40-troubleshooting.md) | Troubleshooting checklist: domain, certificate, TLS, concurrency, session and storage |
| [wechat/50-ai-capability.md](wechat/50-ai-capability.md) | Deployment-coordinate quick reference and the project's AI capability inventory, including what is not wired |
| [wechat/60-teacher-account-and-filing.md](wechat/60-teacher-account-and-filing.md) | Step-by-step guide for a non-technical teacher: mini-program registration and filing |
| [wechat/submission/01-作品介绍文档-PDF源.md](wechat/submission/01-作品介绍文档-PDF源.md) | Submission material — project introduction document, the PDF source |
| [wechat/submission/02-提审文案与测试账号清单.md](wechat/submission/02-提审文案与测试账号清单.md) | Submission material — review copy, test accounts, screenshots and preset data |
| [wechat/submission/03-演示数据种子清单.md](wechat/submission/03-演示数据种子清单.md) | Submission material — demo and review data seed checklist |

## API reference

| Document | What it is |
| --- | --- |
| [后端接口说明/API接口文档.md](../后端接口说明/API接口文档.md) | API reference notes (Chinese only). The HTTP surface itself is frozen by the endpoint snapshot; `npm run api:surface` prints the current set |

## Historical records

These are kept for context, not as current instructions; never cite them as status.

- `.trae/documents/` — plans written by earlier AI sessions. They describe intentions, not how the
  tree ended up.
- `release-notes-v*.md` at the repository root — frozen release notes from before the release
  script existed; superseded by [CHANGELOG.md](../CHANGELOG.md), and no longer drive anything.
- The phase records under `docs/migration/` (00–04, linked above) — evidence of how the refactor
  landed, not a snapshot of the present.

## Maintenance

- Every new `docs/**/*.md` must be added to both language versions of this index in the same
  change. An index that silently drops a file is worse than no index.
- Paired documents are edited together. An English-only change leaves the `.zh-CN.md` counterpart
  out of sync, and the docs-standards guardrail treats that as a failure.
- Generated artifacts come from commands, not hand edits: route modules, class-feature catalogues
  and the endpoint snapshot are produced by `npm run route-modules`, `npm run class-features` and
  `npm run api:surface:update`. The documents describe the output, they do not generate it.
- A stale document is a defect. Fix it in the same change that touches the area; if the fix does
  not belong in that change, say so and record it.
- Do not cite volatile numbers — plugin count, endpoint count, test count, ratchet allowances, HEAD
  hashes — in documentation. Cite the command that produces the number instead; the commands in
  "Authority order" are the truth.
- When a document and the tree disagree, the tree wins: fix the document and say so in the commit
  message.
