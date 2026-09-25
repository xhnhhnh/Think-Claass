#!/usr/bin/env node
/**
 * Cut a release: gates, version bump, changelog entry, commit, tag.
 *
 *   npm run release -- patch          # 2.0.0 -> 2.0.1
 *   npm run release -- minor --push   # 2.0.1 -> 2.1.0, then push the commit and the tag
 *   npm run release -- 2.1.0-rc.1     # an explicit version (prereleases are allowed)
 *   npm run release -- patch --dry-run
 *
 * ## Why a script instead of a checklist
 *
 * The previous process was "edit package.json, hand-write release-notes-vX.Y.md, tag, build a zip,
 * upload it". Three things went wrong with it, all measured in the version-management round
 * (docs/versioning.md section 9): the packaged tree omitted `packages/` and `plugins/`, no release
 * ever got an asset, and `package.json` (1.7.0) drifted away from the CHANGELOG's newest entry
 * (1.6.7) with nothing to notice. A script makes the order non-negotiable and the state checkable:
 * the gates run first, the version is written in exactly one place, and the tag is created from the
 * commit that passed.
 *
 * ## What it deliberately does NOT do
 *
 * It does not publish anything. Pushing the tag is what publishes: `release.yml` then builds the
 * archive, writes `SHA256SUMS` and creates the GitHub Release. Keeping "cut a version" and "build
 * the artifact" in different places is what lets the artifact come from a clean checkout of the
 * tagged commit instead of from a working tree somebody happened to have.
 *
 * `--dry-run` (or simply not passing a bump) prints the plan and changes nothing.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

const GATES = [
  ['npm run check', 'type-check'],
  ['npm test', 'tests'],
  ['npm run api:surface -- --check', 'API surface snapshot'],
  ['npm run guard', 'guardrails'],
];

/**
 * Runs one gate with its output going straight to this terminal.
 *
 * `shell: true` is required, not cosmetic, and the command is passed as a single string because of
 * it. Node's CVE-2024-27980 fix made `execFileSync('npm.cmd', ...)` throw EINVAL on Windows - the
 * old call shape could never work there, and `npm run release` is the only supported way to cut a
 * version (docs/versioning.md §3), so on Windows the documented process failed before the first
 * gate. A shell resolves `npm` to `npm.cmd` without this script naming the extension itself.
 *
 * The command stays one string rather than command+args: with `shell: true` Node concatenates
 * arguments instead of escaping them (and warns about it, DEP0190). The gates above are literals
 * under this script's control, so there is nothing to escape.
 */
function run(command) {
  const result = spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.error) throw result.error;
  // A gate that does not exit 0 must stop the release: the version is not written for a tree that
  // failed its own acceptance gates.
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Git output is read, never streamed: every use is a decision (`status`, `tag --list`). */
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value).trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ?? null };
}

function formatVersion(version) {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease ? `${base}-${version.prerelease}` : base;
}

function nextVersion(current, bump) {
  const parsed = parseVersion(current);
  if (!parsed) throw new Error(`package.json version is not semver: ${current}`);

  const explicit = parseVersion(bump);
  if (explicit) return explicit;

  switch (bump) {
    case 'major':
      // A major release drops any prerelease tail: 2.0.0-rc.3 + major -> 3.0.0.
      return { major: parsed.major + 1, minor: 0, patch: 0, prerelease: null };
    case 'minor':
      return { major: parsed.major, minor: parsed.minor + 1, patch: 0, prerelease: null };
    case 'patch':
      return { major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1, prerelease: null };
    default:
      throw new Error(`unknown bump "${bump}" - use patch, minor, major or an explicit X.Y.Z`);
  }
}

/** The changelog section a release starts with: a skeleton with the three headings it uses. */
function changelogSection(version, date) {
  return [
    `## [${version}] - ${date}`,
    '',
    '<!-- 一两句话说明这一版解决的核心问题；下面按 Added / Changed / Fixed 记，写"为什么"而不只是"改了什么"。 -->',
    '',
    '### Added',
    '- ',
    '',
    '### Changed',
    '- ',
    '',
    '### Fixed',
    '- ',
    '',
  ].join('\n');
}

function insertChangelog(section) {
  const existing = fs.readFileSync(CHANGELOG, 'utf8');
  const firstSection = existing.search(/^## \[/m);
  if (firstSection === -1) {
    throw new Error('CHANGELOG.md has no "## [version]" section to insert before');
  }
  // Keep the title block, put the new entry above the newest existing one.
  return existing.slice(0, firstSection) + section + '\n' + existing.slice(firstSection);
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const push = args.includes('--push');
  const dryRun = args.includes('--dry-run');
  const bump = args.find((arg) => !arg.startsWith('--'));

  if (!bump) {
    console.log('usage: npm run release -- patch|minor|major|X.Y.Z [--push] [--dry-run]');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const version = formatVersion(nextVersion(pkg.version, bump));
  const tag = `v${version}`;

  console.log(`release plan: ${pkg.version} -> ${version}   (tag ${tag}${push ? ', push' : ', no push'})`);

  // Releasing the version that is already in the manifest would add a second CHANGELOG section for
  // it and tag a commit that is not a release - which is how the drift this script exists to prevent
  // starts. "I need to redo that release" is answered by the next patch version.
  if (version === pkg.version) {
    console.error(`package.json is already at ${version}: bump to a new version (patch/minor/major) to release`);
    process.exit(1);
  }

  // 1. A release must be cut from a clean tree: an uncommitted change would be either lost or
  //    dragged into the release commit, and neither is a decision this script may make.
  const dirty = git(['status', '--porcelain']);
  if (dirty) {
    console.error('working tree is not clean:\n' + dirty);
    process.exit(1);
  }

  // 2. Refuse a version that already exists as a tag. Tags are immutable by policy, so the answer
  //    to "I need to redo that release" is a new patch version.
  if (git(['tag', '--list', tag])) {
    console.error(`tag ${tag} already exists - releases are immutable; cut the next version instead`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n--dry-run: would run these gates, then bump, then commit, then tag:');
    for (const [command, label] of GATES) console.log(`  - ${command}   (${label})`);
    return;
  }

  // 3. Gates before anything is written.
  for (const [command, label] of GATES) {
    console.log(`\n=== ${label}: ${command}`);
    run(command);
  }

  // 4. Version, in one place.
  pkg.version = version;
  fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');

  // 5. Changelog skeleton, so "no entry" cannot happen silently - G19 fails if the top section
  //    stops matching package.json.
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(CHANGELOG, insertChangelog(changelogSection(version, date)));

  // 6. Commit and tag, in that order: the tag must point at the release commit.
  git(['add', 'package.json', 'CHANGELOG.md']);
  git(['commit', '-m', `release: ${tag}`]);
  git(['tag', '-a', tag, '-m', `Think-Class ${tag}`]);

  console.log(`\ntagged ${tag}. Next:`);
  console.log('  1. fill in the CHANGELOG section (amend the commit with `git commit --amend --no-edit` if needed)');
  console.log(`  2. git push origin HEAD:main${push ? '   (already requested)' : ' --follow-tags'} to publish`);
  console.log('  3. watch the CI run: it builds the archive, writes SHA256SUMS and creates the Release');

  if (push) {
    console.log(git(['push', 'origin', 'HEAD:main', '--follow-tags']));
    console.log(`pushed main and ${tag}`);
  }
}

main();
