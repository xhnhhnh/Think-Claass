English | [简体中文](SECURITY.zh-CN.md)

# Security Policy

Think-Class stores classroom data, including student names encrypted at rest, and it serves both a Web application and a WeChat mini program. It is also software that schools and teachers can self-host, so a single code-level defect can affect many deployments at once.

This document explains which versions receive security fixes, how to report a vulnerability privately, what is in scope, how to test safely, and how operators can harden a deployment. It is a project policy, not a promise of a specific response time or remedy.

## Supported versions

Security fixes are developed against `main` and shipped in the latest release. **Only the latest release and `main` are supported**; older releases and tags are not maintained, and security fixes are not backported to them.

There is no long-term-support branch. The latest tag is the supported release; a deployment that cannot update should still report, and the maintainers will say whether the issue is fixed in the latest release and, where possible, what mitigation applies to the older one.

- Security fixes ship in the next regular release; there is no separate security-only distribution.
- Pre-release tags (`vX.Y.Z-rc.N`) are for validation and are not supported releases; they do not receive backports either.

Self-hosted deployments should update to the latest release first — the updater verifies the release archive's `SHA256SUMS` — before asking whether a vulnerability applies. The version of an installation is the `version` field in [`package.json`](package.json), which is also what a release tag names.

## Reporting a vulnerability

Use GitHub private vulnerability reporting: https://github.com/xhnhhnh/Think-Claass/security/advisories/new

- Do **not** open a public issue containing reproduction steps, exploit details, affected routes or student data.
- Do **not** open a public pull request that fixes an unpatched vulnerability; coordinate the fix with the maintainers first.
- If that reporting entry point is unavailable, open a minimal public issue **without technical details** asking for a private channel; a maintainer will follow up privately.
- The project does not publish a security email address. Do not send reports to an address you find elsewhere; use the GitHub advisory entry point above.
- If you are unsure whether something is a vulnerability, report it privately anyway; triage is the maintainers' job, not a precondition for reporting.

## What to include in a report

- The affected version or commit (`package.json` `version`, or `git rev-parse HEAD`), and the branch if it is not `main`.
- The deployment mode: Web, WeChat mini program, self-hosted or cloud, including the hosting arrangement where relevant (for example PM2 or a container).
- The environment: Node.js version, operating system, and whether a reverse proxy or CDN sits in front of the API.
- Step-by-step reproduction: the roles, routes and inputs involved, and whether the issue requires authentication.
- What happened versus what you expected, and how reliably it reproduces.
- Impact: what an attacker gains and what data is exposed.
- Logs or screenshots with names, IDs, tokens and deployment paths redacted.
- Whether real student data was involved — answer the question without sending the data itself.
- Any mitigation you have already applied, and a patch or test case if you have one.
- A pointer to any earlier report or advisory about the same issue, and whether it has already been made public anywhere.

## In scope

- Authentication and session handling: login, session lifetime (`SESSION_TTL_MS`), session cookies and tokens, and the legacy header bridge (`ALLOW_LEGACY_HEADER_AUTH`).
- Per-role authorization: whether a student, parent, teacher or superadmin can reach an endpoint they should not, or another school's records.
- Encryption of student names at rest: the key-length check, the AES scheme, and decryption-failure behaviour.
- WeChat integration: `WECHAT_APPID` / `WECHAT_SECRET` handling, the server-side `code2session` exchange, and the dev-login bypass (`WECHAT_ALLOW_DEV_LOGIN`).
- File upload and path handling, including traversal, filename construction and the serving of uploaded files.
- Exposure of AI provider keys (`AI_API_KEY`), of prompts, or of one student's data in a result returned to another.
- Installer and updater integrity: `SHA256SUMS` verification, archive extraction (the deployment scripts extract and run as root), and the trust boundary of running an update.
- Multi-school isolation: cross-school reads or writes.
- Parent access to data about minors.
- Audit logging that silently drops actions an operator needs to investigate an incident.

## A note on deployments we do not operate

Self-hosted and cloud deployments are operated by the schools and administrators who run them, not by the maintainers of this repository. If you believe a specific deployment is vulnerable, you can report the software issue here, but do not test against that deployment without its operator's permission. If you are the operator, the hardening checklist below is for you.

If you are a student, parent or teacher using such a deployment, contact that deployment's operator for account or data issues; the maintainers cannot access its database or logs. If you run a modified fork of this code, that deployment is maintained by you.

## Testing guidelines

- Test on your own local instance, created from a clean checkout with synthetic data.
- Never use real student data, real names or a production database.
- Stop as soon as you have confirmed access or impact; do not exfiltrate data, modify records or leave persistence behind.
- Keep your test environment isolated from any deployment you do not own.
- If a test would affect other users, stop and ask the maintainers first.
- Clean up your test instance and any test accounts afterwards, and redact anything you quote from logs.

## Out of scope and expectations

- Good-faith security research only. Do not use the project to attack, scan or degrade a deployment you do not own.
- Do not access other people's deployments, accounts or data, and do not test against production data or real students.
- No denial of service, brute force, spam or resource-exhaustion testing.
- No social engineering of maintainers, teachers, students or parents.
- Do not publish details before a fix is available and a disclosure date has been agreed.
- Vulnerabilities in third-party services (GitHub, the WeChat platform, an AI provider) belong with that provider; tell us separately if Think-Class's use of the service exposes its users.
- Issues that require an already-compromised host, a leaked `ENCRYPTION_KEY` or physical access are still welcome as reports, but state the prerequisite clearly.
- Reports with no plausible impact path, including raw automated-scanner output, may be answered as informational; that is not a judgement on the effort.

## Safe harbor and coordinated disclosure

The maintainers will not pursue or support legal action against researchers who act in good faith under this policy: they report privately and promptly, avoid privacy violations and data destruction, do not degrade the service, and give the maintainers a reasonable opportunity to fix the issue before publishing. The project cannot bind third parties, so this statement covers only the project's own response.

We coordinate disclosure:

1. We acknowledge the report and ask for anything missing.
2. We reproduce and triage it, and tell you what we believe the impact is.
3. We fix it, usually on a private branch, and prepare a release.
4. We agree a disclosure date with you, publish an advisory with the fix, and credit you if you want credit.

There is no fixed embargo period in this policy; we will discuss a timeline with you and keep the report confidential until then.

## Operator hardening checklist

- Set `ENCRYPTION_KEY` and back it up. It must be exactly 32 bytes and identical on every instance of the deployment; losing it makes encrypted student names unreadable. Rotate only after re-encrypting the existing rows as described in the header of [`scripts/rotate-encryption-key.mjs`](scripts/rotate-encryption-key.mjs).
- Keep `ALLOW_LEGACY_HEADER_AUTH` off. The legacy header bridge trusts client-supplied identity; with it on, any caller can claim any role, including superadmin.
- Do not set `WECHAT_ALLOW_DEV_LOGIN` in production. Set `NODE_ENV=production` explicitly: the deployment scripts do not set it, and the WeChat plugin's first guard against the dev-login bypass depends on it.
- Verify `SHA256SUMS` before every update; the updater refuses an archive whose checksum is missing or wrong.
- Keep `database.sqlite*`, `uploads/`, `logs/` and `.env` off the public web and out of version control.
- Use a strong, unique superadmin password, stored in a password manager rather than in a document.
- Keep `WECHAT_SECRET` and `AI_API_KEY` on the server only; never put them in a client bundle or the mini program package.
- Serve the app over HTTPS, and restrict who can reach the superadmin console.
- Treat [`docs/security/route-authorization-matrix.md`](docs/security/route-authorization-matrix.md) as a checklist, not a proof. Run `npm run auth:audit`, whose output is authoritative, and use the matrix to review the endpoints it names.
- If a secret leaks, treat it as compromised and rotate it; for `ENCRYPTION_KEY`, re-encrypt the existing data first.

## Response expectations

- Reports are handled on a best-effort basis by the maintainers. We aim to acknowledge a report as soon as practicable, but no response time or fix deadline is guaranteed.
- There is no bug bounty program and no payment for reports.
- We may ask for more information or ask you to retest a fix. A report that stays private until disclosure is agreed is the most helpful.
- We will say whether a report is accepted for a fix, and tell you when the fix ships.
- If a report cannot be reproduced or is out of scope, we will say so and explain why; you are welcome to send new information.

## Related documents

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) ([简体中文](CODE_OF_CONDUCT.zh-CN.md)) — the conduct expected from everyone in the project's spaces.
- [CONTRIBUTING.md](CONTRIBUTING.md) ([简体中文](CONTRIBUTING.zh-CN.md)) — setup, validation and the pull request process.
- [docs/README.md](docs/README.md) ([简体中文](docs/README.zh-CN.md)) — the documentation map.
- [docs/security/route-authorization-matrix.md](docs/security/route-authorization-matrix.md) — the per-controller authorization checklist.
