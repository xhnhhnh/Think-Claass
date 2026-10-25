/**
 * Design-language guardrail.
 *
 * The existing UI-R guardrails measure the *component layer* (raw controls, old tokens,
 * unresolved colours). They do not measure the decoration that makes the same product
 * look like several different products: hand-built gradients, display type in a console,
 * heavy shadows, emoji in functional copy, or external texture URLs.
 *
 * This file is the ratchet for those. Two rules keep it usable:
 *
 *   1. Hard invariant metrics must be 0 forever. The 16 `transparenttextures.com`
 *      backgrounds, the last legacy token aliases and the two console emoji are removed
 *      in the same change that introduces the check.
 *   2. Counted metrics start at today's measurement and may only go down. The target is
 *      recorded in the metric definition so the next wave knows what it is buying, but
 *      the assertion uses the ceiling that is true now. A guardrail that is red on day
 *      one teaches everyone to ignore it.
 *
 * The companion browser check (`npm run design:capture`) measures the same screen after
 * it renders: overflow, h1 count and the number of distinct radii/font sizes/shadows.
 * This file covers what the source can prove without a browser.
 */

import { describe, expect, it } from 'vitest';

import { blankComments, findOccurrences, uiSourceFiles } from '../../scripts/migration/lib/ui-audit.mjs';
import { ROOT } from './lib/paths.mjs';

const files = uiSourceFiles(ROOT);

const CONSOLE_PATH =
  /^src\/(?:pages\/(?:Admin|Teacher|Parent)|features\/(?:admin|[^/]+\/pages\/(?:Admin|Teacher|Parent)))/;

interface Metric {
  key: string;
  label: string;
  pattern: RegExp;
  /** The number measured when this guardrail was introduced. May only be lowered. */
  ceiling: number;
  /** The end state this ratchet is buying. Not asserted until the owning wave lands. */
  target: number;
  include?: (rel: string) => boolean;
}

const METRICS: Metric[] = [
  {
    key: 'rawGradientBackgrounds',
    label: 'raw `bg-gradient-to-*` utilities',
    pattern: /\bbg-gradient-to-[a-z]+\b/g,
    ceiling: 62,
    target: 0,
  },
  {
    key: 'displayType',
    label: '`text-4xl`+ / `font-black` in application code',
    pattern: /\b(?:text-(?:4xl|5xl|6xl|7xl|8xl|9xl)|font-black)\b/g,
    ceiling: 145,
    target: 12,
  },
  {
    key: 'heavyShadows',
    label: '`shadow-xl/2xl/floating/glow-*` utilities',
    pattern: /\bshadow-(?:xl|2xl|floating|glow-[a-z-]+)\b/g,
    ceiling: 27,
    target: 8,
  },
  {
    key: 'externalTextures',
    label: 'external texture URLs',
    pattern: /transparenttextures\.com/g,
    ceiling: 0,
    target: 0,
  },
  {
    key: 'legacyAliases',
    label: 'pre-UI-R token aliases (ink/card/muted/primary/...)',
    pattern:
      /\b(?:bg|text|border|ring|divide|placeholder)-(?:ink-[123]|canvas|paper(?:-warm)?|card|card-foreground|muted|muted-foreground|primary|primary-foreground|secondary|secondary-foreground|accent|accent-foreground|destructive|popover|popover-foreground|input|border|background|foreground)(?![\w-])/g,
    ceiling: 0,
    target: 0,
  },
  {
    key: 'consoleEmoji',
    label: 'emoji in admin/teacher/parent page copy',
    pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
    ceiling: 0,
    target: 0,
    include: (rel) => CONSOLE_PATH.test(rel),
  },
];

describe('design language ratchets', () => {
  it('scans a non-trivial front end', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  for (const metric of METRICS) {
    it(`${metric.key} stays within its ceiling (${metric.label})`, () => {
      const found = findOccurrences(ROOT, files, metric.pattern, metric.include);
      const detail = found.offenders.slice(0, 12).join('\n    ');
      expect(
        found.count,
        `${metric.label}: ${found.count} (ceiling ${metric.ceiling}, target ${metric.target})\n    ${detail}`,
      ).toBeLessThanOrEqual(metric.ceiling);
    });
  }

  it('does not count a pattern inside a comment', () => {
    // The guardrail has to be able to explain itself without adding to its own number.
    const counts = (text: string, pattern: RegExp) =>
      [...blankComments(text).matchAll(new RegExp(pattern.source, pattern.flags))].length;
    expect(counts('/* bg-gradient-to-r is banned */', METRICS[0].pattern)).toBe(0);
    expect(counts('// ⚠️', METRICS[5].pattern)).toBe(0);
  });
});
