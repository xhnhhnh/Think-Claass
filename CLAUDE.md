# CLAUDE.md

This repository's canonical instructions for AI agents are in
[`AGENTS.md`](AGENTS.md) (English) and [`AGENTS.zh-CN.md`](AGENTS.zh-CN.md)
(简体中文). Read `AGENTS.md` before planning or editing anything; this file is
only a pointer and must not grow into a second source of rules.

Non-negotiables (details and commands are in `AGENTS.md`):

- Never commit secrets, `.env`, API keys, or real student data. `ENCRYPTION_KEY`
  has no default and must never be rotated casually.
- Schema changes live only in new migrations; never edit an applied migration.
- Before claiming a change is done, run `npm run check`, `npm run guard`, and
  the test project relevant to the change (plus `npm run api:surface:check` for
  HTTP changes).
- Keep the English/Chinese document pairs and `docs/README.md` in sync.
- The workspace, `git`, and command output are the truth; documents can lag.
