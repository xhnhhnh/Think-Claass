English | [简体中文](VERSIONING.zh-CN.md)

# Version numbering specification

This file is the normative version-numbering and release specification for Think-Class. It is short on purpose: [`docs/versioning.md`](docs/versioning.md) is the design record and explains why each rule exists, including the incidents that produced it. If the two disagree, the workspace and the commands win; fix the stale document in the same change.

The English file is canonical; the Chinese translation is kept in step and says so at the top.

## 1. Scope and authority

This specification applies to:

- the application version in [`package.json`](package.json), git tags and GitHub Releases;
- the newest entry in [`CHANGELOG.md`](CHANGELOG.md);
- each plugin's version in its `plugin.json`;
- the kernel API version in [`packages/kernel/src/config/loadConfig.ts`](packages/kernel/src/config/loadConfig.ts);
- the installed-version marker `CURRENT_VERSION` written to `.env` by [`install.sh`](install.sh) and [`update.sh`](update.sh).

The release mechanism is [`scripts/release.mjs`](scripts/release.mjs), the CI pipeline is [`.github/workflows/release.yml`](.github/workflows/release.yml), and the machine checks are [`tests/guardrails/version-consistency.test.ts`](tests/guardrails/version-consistency.test.ts) (guardrail G19) plus the documentation guardrail.

## 2. Version format

### 2.1 Application versions

The application version is semantic versioning: `MAJOR.MINOR.PATCH` (for example `X.Y.Z`, never with a leading `v` in the manifest). A git tag prefixes it with `v`: `vX.Y.Z`.

- Three numeric components, no leading zeroes.
- No build metadata (`+...`); the release script and G19 reject it.
- A version number is allocated once. A version that has a tag is never reused; a bad release is corrected by the next PATCH, not by moving or deleting a tag.
- Versions increase monotonically. A tag may not name a version greater than `package.json` (G19).

### 2.2 Release candidates

A release candidate uses `X.Y.Z-rc.N` (for example `2.1.0-rc.1`). It exists to validate the deployment path before the final release.

- It is cut with an explicit version: `npm run release -- 2.1.0-rc.1`.
- It is a prerelease on GitHub; `releases/latest` does not point at it, and update checks ignore it.
- It is not a supported release for security fixes; the final `X.Y.Z` is a new version, not a rebuild of the candidate.
- Do not invent other suffixes or use build metadata. `-rc.N` is the only prerelease form this project uses.

### 2.3 Plugin versions

Every plugin has its own semantic version in `plugins/<slug>/plugin.json`. It is independent of the application version.

- MAJOR: an incompatible change to the plugin's published port (`<slug>.public`).
- MINOR: a new route, port method or permission key.
- PATCH: internal implementation only.
- `dependsOn` ranges and the plugin's `kernel` range use semantic-version ranges; a compatible plugin bump must not break its dependants.
- A plugin version is not copied from the app version and is not tied to the release tag.

The manifest rules are enforced by the plugin-manifest guardrail; `plugins/pet/plugin.json` shows the shape.

### 2.4 Kernel API version

`KERNEL_API_VERSION` describes the SDK and context a plugin compiles against. It is decoupled from the application version.

- Additive changes (a new optional context member, a new SDK helper that does not change existing semantics) do not bump it.
- Removing a method, changing its semantics, or changing a required manifest field bumps it by one.
- When it bumps, every plugin's `kernel` range must be updated; `npm run check` and the runtime resolver reject a mismatch.
- The constant lives in [`packages/kernel/src/config/loadConfig.ts`](packages/kernel/src/config/loadConfig.ts); its value is never copied into documentation.

## 3. The single source of truth

| Artifact | Role | Written by | Hand-edit? |
| --- | --- | --- | --- |
| [`package.json`](package.json) `version` | The only application version | `npm run release` | No |
| [`package-lock.json`](package-lock.json) | Mirrors the root version in two places | `npm run release` in the same commit | No |
| git tag `vX.Y.Z` | Immutable release event | `npm run release` (push with `--push`) | Never move or delete |
| [`CHANGELOG.md`](CHANGELOG.md) newest section | Human-facing change record | `npm run release` seeds it; maintainers fill it | Allowed, but it must equal `package.json` |
| GitHub Release | Distribution and release notes | CI on a tag push | No |
| `.env` `CURRENT_VERSION` | Installed runtime state | [`install.sh`](install.sh) / [`update.sh`](update.sh) | Runtime data, never tracked |
| `plugins/<slug>/plugin.json` `version` | Plugin compatibility | The plugin owner | No application version |
| `KERNEL_API_VERSION` | Kernel compatibility | Kernel maintainers | No application version |

`package-lock.json` is a mirror, not a second source: release the version through the script so both copies move together.

## 4. When to bump

Ask: can an existing installation upgrade without editing configuration or data? If yes, MINOR or PATCH; if no, MAJOR.

| Change | Bump |
| --- | --- |
| A required environment variable, a manual data migration, a removed or changed HTTP surface, or a new deployment prerequisite | MAJOR |
| New feature, route or plugin; an old installation can upgrade without configuration changes | MINOR |
| Bug fix or internal refactor; external behaviour and deployment are unchanged | PATCH |
| Validation before a release | Prerelease `-rc.N` |
| Incompatible change to a plugin port | Plugin MAJOR |
| New plugin route, port method or permission key | Plugin MINOR |
| Plugin internals | Plugin PATCH |
| Incompatible kernel SDK or context change | `KERNEL_API_VERSION` +1 |

Schema rules interact with the version:

- Migrations are forward-only; never edit an applied migration.
- A destructive schema change (dropping a column or table, changing a type without a compatibility path) must be a MAJOR with a migration path; it must not ride in a MINOR or PATCH.
- A schema change in a MINOR or PATCH must be backward compatible with the previous release for at least one version: add nullable columns or tables, or dual-write.

## 5. Release procedure

A release is one atomic event: the tag.

1. Start from a clean tree on the release line. `git status --porcelain` must be empty.
2. Choose the next version with section 4. Do not edit `package.json` by hand.
3. Run the release script (a dry run prints the plan without writing):

```bash
npm run release -- patch
npm run release -- minor
npm run release -- 2.1.0-rc.1
npm run release -- patch --dry-run
```

4. The script refuses a dirty tree, a version that is already in the manifest, and a version whose tag already exists. It runs the gates (`check`, `test`, `api:surface:check`, `guard`), writes `package.json` and `package-lock.json`, inserts a CHANGELOG skeleton, commits `release: vX.Y.Z`, and creates an annotated tag. It does not push unless `--push` is passed.
5. Fill in the CHANGELOG section — what changed and why — and amend the release commit if needed.
6. Push the commit and the tag (`git push origin HEAD:main --follow-tags`, or use `--push`). Pushing the tag publishes.
7. CI runs the gates (type-check, API surface, mini-program type-check, guardrails, tests), builds the archive with `bash pack.sh`, writes `SHA256SUMS`, and creates or updates the GitHub Release with the CHANGELOG section as its notes.

Do not run the release script, push a tag, or publish a Release unless the maintainer explicitly asks.

## 6. What a release publishes

- `think-class-release.zip` plus `SHA256SUMS`. Both are required; a missing checksum is a failed release.
- Asset names do not contain the version; the tag is the serial number and the GitHub Release is the versioned container.
- Release notes come from the CHANGELOG section for that version.
- Pre-release tags are marked as GitHub prereleases; `releases/latest` and the update check skip them.
- The project does not publish npm packages, does not use semantic-release or release-please, and does not write the version into the frontend bundle.

Deployments verify the checksum and refuse an archive without it. The installed version is `.env` `CURRENT_VERSION`, not a tracked source file.

## 7. CHANGELOG rules

- The newest section starts with `## [X.Y.Z] - YYYY-MM-DD` and must match `package.json` (G19). No `## [Unreleased]` heading: it would break the check.
- Use `### Added`, `### Changed` and `### Fixed`; explain why, not only what.
- The release script inserts the skeleton; a human fills it. The GitHub Release body is extracted from this section.
- Files named `release-notes-vX.Y.md` are a frozen historical archive from before the release script. Do not add new ones.

## 8. Prohibited practices

- Hand-editing the version in `package.json` or `package-lock.json`.
- Moving, deleting or reusing a tag; creating a tag for a version that is absent from the manifest.
- Editing the top CHANGELOG section so it no longer matches `package.json`, or adding an `[Unreleased]` section.
- Releasing from a dirty tree, or releasing the version that is already in the manifest.
- Writing `CURRENT_VERSION=<version>` into a tracked file; it is runtime state.
- Copying the current application version into documentation. Say "read `package.json`" or cite the command.
- Using build metadata or an arbitrary suffix instead of `-rc.N`.
- Publishing an npm package or introducing a release bot.
- Destructive schema changes in a MINOR or PATCH.

## 9. Enforcement

Guardrail G19 in [`tests/guardrails/version-consistency.test.ts`](tests/guardrails/version-consistency.test.ts) checks:

1. `package.json.version` is valid semver.
2. The top CHANGELOG section equals `package.json.version`.
3. No tag is ahead of `package.json`.
4. The release asset name is identical in the deploy scripts, `pack.sh`, the updater and CI.
5. `pack.sh` still ships `packages/` and `plugins/`.
6. No tracked file contains a `CURRENT_VERSION=<version>` literal.

Also:

- [`scripts/release.mjs`](scripts/release.mjs) refuses a dirty tree, the same version and an existing tag.
- The release workflow runs the gates before packaging.
- The documentation guardrail checks that this specification and its Chinese translation exist, stay structurally in step and are indexed.

## 10. Rollback and recovery

- Application rollback: keep the previous release directory and `CURRENT_VERSION`; switch back, restore the marker and restart. Do not touch the database.
- Database rollback is not supported: migrations are forward-only. A schema change must be compatible with the previous release for one version; destructive changes wait for a MAJOR.
- A bad release is repaired by the next PATCH. The tag is immutable: do not delete or move it. A GitHub Release may be marked prerelease or deleted, but deployments may already have installed it, so the fix is still a new version.
