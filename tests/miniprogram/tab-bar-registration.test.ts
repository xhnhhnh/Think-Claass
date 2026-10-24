import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The custom tab bar is a component, not the framework's built-in bar: a page only renders it when
 * its own JSON lists it in `usingComponents`.
 *
 * Two pages forgot that (the parent's 温馨家园 and the superadmin's 管理), and both are landing
 * pages - the parent's home tab and the page the 管理 tab opens - so the missing bar turned them
 * into dead ends. A page whose wxml draws `<custom-tab-bar>` without declaring it does not fail at
 * build time; it simply draws nothing, which is why this is a static test over the page manifests.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe('mini program custom tab bar registration', () => {
  const pagesDir = path.join(ROOT, 'miniprogram', 'pages');
  const hostPages = walk(pagesDir)
    .filter((file) => file.endsWith('.wxml'))
    .filter((file) => fs.readFileSync(file, 'utf8').includes('<custom-tab-bar'));

  it('is declared by every page that renders it', () => {
    // A regression here means the bar silently disappears from that page.
    expect(hostPages.length).toBeGreaterThanOrEqual(9);

    for (const wxml of hostPages) {
      const manifestPath = wxml.replace(/\.wxml$/, '.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        usingComponents?: Record<string, string>;
      };
      expect(
        manifest.usingComponents?.['custom-tab-bar'],
        `${path.relative(ROOT, wxml)} renders <custom-tab-bar>, so ${path.relative(ROOT, manifestPath)} must declare it`,
      ).toBe('/custom-tab-bar/index');
    }
  });

  it('covers the two landing pages that used to be missing the declaration', () => {
    const rendered = hostPages.map((file) => path.relative(pagesDir, file).replace(/\\/g, '/'));
    // 温馨家园 is the parent's home tab; 管理 is what the 管理 tab opens for an operator account.
    expect(rendered).toContain('parent/dashboard.wxml');
    expect(rendered).toContain('admin/manage.wxml');
  });
});
