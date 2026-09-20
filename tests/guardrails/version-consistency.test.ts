/**
 * G19 - version management stays consistent.
 *
 * The design is `docs/versioning.md`. Every rule in it that a machine can check lives here, because
 * the previous process had no checks at all and drifted in three measured ways at once: the release
 * archive omitted `packages/` and `plugins/`, no GitHub Release ever received an asset, and
 * `package.json` said 1.7.0 while the CHANGELOG's newest entry said 1.6.7.
 *
 * The assertions are deliberately about *disagreement between places that should agree*, not about a
 * particular number: nothing here needs editing when a release is cut, which is what makes it safe
 * to keep in the suite.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOT } from './lib/paths.mjs';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Files that must agree on the release archive's name. */
const ASSET_NAME_SOURCES = [
  'scripts/deploy-common.sh',
  'pack.sh',
  'update.sh',
  'install.sh',
  'plugins/admin/src/admin.update.ts',
  '.github/workflows/release.yml',
];

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function tags() {
  return execFileSync('git', ['tag', '--list', 'v*'], { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

function compareVersions(left, right) {
  const parse = (value) => value.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const [a, b] = [parse(left), parse(right)];
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

describe('G19 version management', () => {
  const pkg = JSON.parse(read('package.json'));
  const changelog = read('CHANGELOG.md');

  it('package.json carries a semver version', () => {
    expect(pkg.version).toMatch(SEMVER);
  });

  it('the CHANGELOG has a section for exactly that version', () => {
    // The drift this catches: package.json 1.7.0 vs CHANGELOG top 1.6.7, which nothing noticed.
    const sections = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)].map((match) => match[1]);
    // A floor, not a target: it catches "the regex stopped matching", not the number of releases.
    expect(sections.length).toBeGreaterThan(2);
    expect(sections[0]).toBe(pkg.version);
  });

  it('no tag is ahead of package.json', () => {
    // A tag newer than the manifest means something was published without a version bump - the
    // mirror image of the CHANGELOG drift, and the reason a release is a script rather than a habit.
    const ahead = tags().filter((tag) => compareVersions(tag, pkg.version) > 0);
    expect(ahead).toEqual([]);
  });

  it('every place that names the release archive uses the same name', () => {
    const names = new Set();
    for (const rel of ASSET_NAME_SOURCES) {
      const text = read(rel);
      for (const match of text.matchAll(/think-class-[A-Za-z0-9._-]*\.zip/g)) names.add(match[0]);
    }
    // The updater derives its default from `${APP_NAME}-release.zip`, and this is the value that
    // both the release workflow and the download path have to agree on.
    expect([...names]).toEqual(['think-class-release.zip']);
  });

  it('the release archive ships the plugin runtime and the plugins themselves', () => {
    // The version-management round found pack.sh copying dist/api/prisma but neither `packages/`
    // (the kernel, SDK and runtime) nor `plugins/` (every domain). A release built from that list
    // boots a server with no kernel and no domains, and this assertion is what keeps the two
    // directories in it.
    const pack = read('pack.sh');
    expect(pack).toMatch(/cp -r packages\s+"\$RELEASE_DIR\/"/);
    expect(pack).toMatch(/cp -r plugins\s+"\$RELEASE_DIR\/"/);
  });

  it('no tracked script hardcodes the installed version', () => {
    // `CURRENT_VERSION` is per-machine state written by install.sh/update.sh into .env. A literal in
    // tracked source would make every deployment claim the maintainer's version.
    const candidates = execFileSync('git', ['ls-files', '*.sh', '*.ts', '*.mjs', '*.js'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((rel) => !rel.startsWith('tests/'))
      // `git ls-files` reads the index, so a file deleted in the working tree but not
      // yet committed is still listed - and reading it threw ENOENT, which made this
      // guardrail fail for a reason that had nothing to do with versions. Deleting a
      // file is exactly what a refactor does; the check is about its contents.
      .filter((rel) => fs.existsSync(path.join(ROOT, rel)));

    const offenders = candidates.filter((rel) => /CURRENT_VERSION=\d+\.\d+\.\d+/.test(read(rel)));
    expect(offenders).toEqual([]);
  });
});
