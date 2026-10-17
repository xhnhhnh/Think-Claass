/**
 * Documentation standards guardrail.
 *
 * This repository keeps several documents in two languages, ships a complete docs
 * index, and claims MIT in both READMEs. Each of those is a promise that silently
 * rots: a translation misses a link, a new docs file is never indexed, a README
 * says "MIT" with no LICENSE file, or CLAUDE.md grows into a second, conflicting
 * source of rules. None of that fails a normal test suite, so this guardrail makes
 * it fail here instead.
 *
 * It is deliberately unnumbered: the historical G-numbers have been reused across
 * rounds (G20 and G21 each describe two different checks), so adding another number
 * would make that ambiguity worse. The checks below are named for what they assert.
 *
 * The checks are structural, not literary. A translation may word things differently;
 * it may not drop a heading, a link or a code block, because those are what make the
 * two versions navigable together.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOT } from './lib/paths.mjs';

const REQUIRED_FILES = [
  'README.md',
  'README.zh-CN.md',
  'AGENTS.md',
  'AGENTS.zh-CN.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.zh-CN.md',
  'SECURITY.md',
  'SECURITY.zh-CN.md',
  'CODE_OF_CONDUCT.md',
  'CODE_OF_CONDUCT.zh-CN.md',
  'LICENSE',
  'VERSIONING.md',
  'VERSIONING.zh-CN.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'docs/README.md',
  'docs/README.zh-CN.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
];

/** The standard-document entries the README pair must both advertise. */
const README_DOC_LINKS = [
  'AGENTS.md',
  'AGENTS.zh-CN.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.zh-CN.md',
  'SECURITY.md',
  'SECURITY.zh-CN.md',
  'CODE_OF_CONDUCT.md',
  'CODE_OF_CONDUCT.zh-CN.md',
  'VERSIONING.md',
  'VERSIONING.zh-CN.md',
  'docs/README.md',
  'docs/README.zh-CN.md',
  'LICENSE',
];

// `wechat/` is not skipped here: `docs/wechat/` is documentation we must index.
// This walk is only ever used on `docs/`, so the root working copy never appears.
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.tmp', 'logs', 'uploads']);

const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const relOf = (absolute: string): string => path.relative(ROOT, absolute).split(path.sep).join('/');

function isExternal(target: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target) || /^(?:mailto|tel):/i.test(target) || target.startsWith('#');
}

/**
 * Resolve a markdown link target against the file it appears in, returning a
 * repository-relative POSIX path, or null for external/anchor-only targets.
 * Anchors and query strings are dropped; percent-encoding is decoded so Chinese
 * file names in `docs/wechat/submission/` resolve the same way a browser sees them.
 */
function resolveLink(fromFile: string, raw: string): string | null {
  const target = raw.trim();
  if (!target || isExternal(target)) return null;

  const withoutFragment = target.split('#')[0].split('?')[0];
  if (!withoutFragment) return null;

  let decoded = withoutFragment;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    // Keep the raw value: a malformed escape should fail as a missing file, not
    // as an exception that hides which document is broken.
  }

  const resolved = decoded.startsWith('/')
    ? path.posix.normalize(decoded.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), decoded));
  return resolved.replace(/\/$/, '');
}

/** Inline markdown links (and images), in document order. */
function linkTargets(text: string): string[] {
  return [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1].trim());
}

function relativeLinkList(fromFile: string): string[] {
  return linkTargets(read(fromFile))
    .map((target) => resolveLink(fromFile, target))
    .filter((target): target is string => target !== null);
}

function relativeLinks(fromFile: string): string[] {
  return [...new Set(relativeLinkList(fromFile))].sort();
}

function headingLevels(text: string): number[] {
  return [...text.matchAll(/^(#{1,6})\s/gm)].map((match) => match[1].length);
}

function fenceLanguages(text: string): string[] {
  return [...text.matchAll(/^```([^\r\n]*)/gm)].map((match) => match[1].trim());
}

function section(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Every `X.zh-CN.md` under the root or docs/, paired with its English base. */
function translatedPairs(): string[] {
  const rootFiles = fs
    .readdirSync(ROOT)
    .filter((name) => name.endsWith('.zh-CN.md'))
    .map((name) => path.join(ROOT, name));
  const docsFiles = walk(path.join(ROOT, 'docs')).filter((file) => file.endsWith('.zh-CN.md'));
  return [...rootFiles, ...docsFiles].map(relOf).sort();
}

const BASE = (zh: string): string => zh.replace(/\.zh-CN\.md$/, '.md');

/** Remove one occurrence: the language switch, not every cross-reference. */
function withoutFirst(links: string[], target: string): string[] {
  const out = [...links];
  const index = out.indexOf(target);
  if (index !== -1) out.splice(index, 1);
  return out;
}

describe('documentation standards', () => {
  it('ships every standard document and does not leave an empty placeholder', () => {
    const problems: string[] = [];
    for (const rel of REQUIRED_FILES) {
      const full = path.join(ROOT, rel);
      if (!fs.existsSync(full)) {
        problems.push(`${rel}: missing`);
        continue;
      }
      if (!fs.statSync(full).isFile()) problems.push(`${rel}: not a file`);
      else if (read(rel).trim().length === 0) problems.push(`${rel}: empty`);
    }
    expect(problems).toEqual([]);
  });

  it('keeps every English/Chinese pair structurally identical', () => {
    const pairs = translatedPairs();
    expect(pairs.length).toBeGreaterThanOrEqual(5);

    const problems: string[] = [];
    for (const zh of pairs) {
      const en = BASE(zh);
      if (!fs.existsSync(path.join(ROOT, en))) {
        problems.push(`${zh}: missing English base ${en}`);
        continue;
      }
      const enText = read(en);
      const zhText = read(zh);

      const enHeadings = headingLevels(enText).join(',');
      const zhHeadings = headingLevels(zhText).join(',');
      if (enHeadings !== zhHeadings) {
        problems.push(`${zh}: heading levels differ (${enHeadings} vs ${zhHeadings})`);
      }

      const enFences = fenceLanguages(enText).join('\u0000');
      const zhFences = fenceLanguages(zhText).join('\u0000');
      if (enFences !== zhFences) {
        problems.push(`${zh}: fenced-code languages differ`);
      }

      // Each file is allowed one link to the other language version (the switch at
      // the top). If both files cross-reference both versions in the body, that
      // stays; only the switch occurrence is exempted.
      const enLinks = [...new Set(withoutFirst(relativeLinkList(en), zh))].sort();
      const zhLinks = [...new Set(withoutFirst(relativeLinkList(zh), en))].sort();
      const onlyEn = enLinks.filter((link) => !zhLinks.includes(link));
      const onlyZh = zhLinks.filter((link) => !enLinks.includes(link));
      if (onlyEn.length > 0) problems.push(`${zh}: links missing from the translation: ${onlyEn.join(', ')}`);
      if (onlyZh.length > 0) problems.push(`${zh}: links not present in the English file: ${onlyZh.join(', ')}`);
    }

    expect(problems).toEqual([]);
  });

  it('has no dead relative links in the standard documents', () => {
    const files = [
      'README.md',
      'README.zh-CN.md',
      'AGENTS.md',
      'AGENTS.zh-CN.md',
      'CONTRIBUTING.md',
      'CONTRIBUTING.zh-CN.md',
      'SECURITY.md',
      'SECURITY.zh-CN.md',
      'CODE_OF_CONDUCT.md',
      'CODE_OF_CONDUCT.zh-CN.md',
      'VERSIONING.md',
      'VERSIONING.zh-CN.md',
      'CLAUDE.md',
      'docs/README.md',
      'docs/README.zh-CN.md',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ];

    const problems: string[] = [];
    for (const file of files) {
      for (const target of relativeLinks(file)) {
        const full = path.join(ROOT, target);
        if (!fs.existsSync(full)) {
          problems.push(`${file}: ${target}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('indexes every markdown file under docs/ from both indexes', () => {
    const indexes = ['docs/README.md', 'docs/README.zh-CN.md'];
    const docsFiles = walk(path.join(ROOT, 'docs'))
      .filter((file) => file.endsWith('.md'))
      .map(relOf)
      .filter((rel) => rel !== 'docs/README.md' && rel !== 'docs/README.zh-CN.md')
      .sort();
    expect(docsFiles.length).toBeGreaterThan(10);

    const problems: string[] = [];
    for (const index of indexes) {
      const linked = new Set(relativeLinks(index));
      for (const doc of docsFiles) {
        if (!linked.has(doc)) problems.push(`${index} does not link ${doc}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps the README documentation tables in step and advertises the standard set', () => {
    const enText = read('README.md');
    const zhText = read('README.zh-CN.md');
    const enSection = section(enText, '## Documentation');
    const zhSection = section(zhText, '## Documentation');
    expect(enSection.length).toBeGreaterThan(0);
    expect(zhSection.length).toBeGreaterThan(0);

    const resolveSection = (file: string, text: string): string[] =>
      [...new Set(
        linkTargets(text)
          .map((target) => resolveLink(file, target))
          .filter((target): target is string => target !== null),
      )].sort();

    const enLinks = resolveSection('README.md', enSection).filter((link) => link !== 'README.zh-CN.md');
    const zhLinks = resolveSection('README.zh-CN.md', zhSection).filter((link) => link !== 'README.md');

    expect(enLinks).toEqual(zhLinks);

    const missing = README_DOC_LINKS.filter((rel) => !enLinks.includes(rel) || !zhLinks.includes(rel));
    expect(missing).toEqual([]);
  });

  it('keeps LICENSE, package.json and both README License sections agreeing on MIT', () => {
    const license = read('LICENSE');
    expect(license).toContain('MIT License');
    expect(license).toContain('Permission is hereby granted, free of charge');
    expect(license).toContain('THE SOFTWARE IS PROVIDED "AS IS"');

    const pkg = JSON.parse(read('package.json'));
    expect(pkg.license).toBe('MIT');

    for (const file of ['README.md', 'README.zh-CN.md']) {
      const text = read(file);
      const licenseSection = section(text, '## License');
      expect(licenseSection, `${file} has no ## License section`).not.toBe('');
      expect(licenseSection, `${file} License section does not link LICENSE`).toMatch(/\]\(LICENSE\)/);
      expect(licenseSection, `${file} License section does not mention MIT`).toMatch(/MIT/);
    }
  });

  it('documents the version numbering rules', () => {
    const en = read('VERSIONING.md');
    for (const token of [
      'MAJOR.MINOR.PATCH',
      'X.Y.Z-rc.N',
      'package.json',
      'package-lock.json',
      'CHANGELOG.md',
      'vX.Y.Z',
      'npm run release',
      'G19',
      'KERNEL_API_VERSION',
      'plugin.json',
    ]) {
      expect(en, `VERSIONING.md does not mention ${token}`).toContain(token);
    }

    const zh = read('VERSIONING.zh-CN.md');
    for (const token of [
      'MAJOR.MINOR.PATCH',
      'X.Y.Z-rc.N',
      'package.json',
      'package-lock.json',
      'CHANGELOG.md',
      'npm run release',
      'KERNEL_API_VERSION',
      'plugin.json',
    ]) {
      expect(zh, `VERSIONING.zh-CN.md does not mention ${token}`).toContain(token);
    }

    for (const file of ['VERSIONING.md', 'VERSIONING.zh-CN.md']) {
      const linked = new Set(relativeLinks(file));
      for (const required of [
        'docs/versioning.md',
        'scripts/release.mjs',
        'tests/guardrails/version-consistency.test.ts',
      ]) {
        expect(linked, `${file} does not link ${required}`).toContain(required);
      }
    }
  });

  it('wires CLAUDE.md and AGENTS.md together without duplicating the rules', () => {
    const claude = read('CLAUDE.md');
    expect(claude).toContain('AGENTS.md');
    expect(claude).toContain('AGENTS.zh-CN.md');

    for (const file of ['AGENTS.md', 'AGENTS.zh-CN.md']) {
      const text = read(file);
      const linked = new Set(relativeLinks(file));
      for (const required of ['docs/README.md', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md']) {
        expect(linked, `${file} does not link ${required}`).toContain(required);
      }
      expect(text).toContain('ENCRYPTION_KEY');
      expect(text).toContain('migration');
    }
  });

  it('ships issue and pull-request templates with the required fields', () => {
    const pr = read('.github/PULL_REQUEST_TEMPLATE.md');
    expect(pr).toContain('- [ ]');
    expect(pr).toContain('npm run check');
    expect(pr).toContain('npm run guard');

    for (const file of ['.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml']) {
      const text = read(file);
      expect(text).toContain('name:');
      expect(text).toContain('description:');
      expect(text).toContain('body:');
      expect(text.match(/^\s*- type: /gm)?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(text).toContain('required: true');
    }

    const config = read('.github/ISSUE_TEMPLATE/config.yml');
    expect(config).toContain('blank_issues_enabled');
    expect(config).toContain('contact_links');
    expect(config).toContain('security/advisories/new');
  });
});
