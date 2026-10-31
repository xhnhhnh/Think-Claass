/**
 * Design-token parity: the mini program is a second client, not a second design language.
 *
 * `miniprogram/app.wxss` deliberately writes literal colours instead of CSS variables (the file
 * explains why: WXSS `page { --x }` scoping differs across base-library versions and a token
 * that silently does not resolve leaves a page unstyled with no error). The cost of literals is
 * drift: a brand change in `src/index.css` would leave the mini program on the old green, and
 * nothing would fail.
 *
 * This test converts the web tokens from HSL to hex and asserts every value the mini program's
 * own token comment lists is actually present in its stylesheet. It cannot prove a page uses the
 * tokens, but it does prove the two clients start from the same palette.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const web = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');
const mini = fs.readFileSync(path.join(root, 'miniprogram', 'app.wxss'), 'utf8');
const tabbar = fs.readFileSync(path.join(root, 'miniprogram', 'custom-tab-bar', 'index.wxss'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*([0-9.]+)\\s+([0-9.]+)%\\s+([0-9.]+)%`).exec(web);
  if (!match) throw new Error(`missing web token --${name}`);
  return hslToHex(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** HSL (h in degrees, s/l in percent) to `#RRGGBB`, matching the browser's sRGB output. */
function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hp = h / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [chroma, x, 0];
  else if (hp < 2) [r, g, b] = [x, chroma, 0];
  else if (hp < 3) [r, g, b] = [0, chroma, x];
  else if (hp < 4) [r, g, b] = [0, x, chroma];
  else if (hp < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  const m = lightness - chroma / 2;
  const toHex = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

const EXPECTED: Array<[tokenName: string, label: string]> = [
  ['brand', 'brand'],
  ['surface-1', 'page'],
  ['surface-2', 'card'],
  ['fg-1', 'fg-1'],
  ['fg-2', 'fg-2'],
  ['fg-3', 'fg-3'],
  ['line-1', 'line'],
  ['success', 'success'],
  ['warning', 'warn'],
  ['danger', 'danger'],
  ['info', 'info'],
];

describe('mini program design tokens', () => {
  it.each(EXPECTED)('--%s matches the mini program %s literal', (name, label) => {
    const hex = token(name);
    /*
     * Browser HSL -> sRGB and the hand-picked WXSS literals can differ by one channel step at a
     * boundary (the web brand token resolves to #18593E while the mini program uses #17583E for
     * the same intended colour). Requiring exact equality would make the test about the
     * converter, not about drift, so allow one step per channel and name the label in the error.
     */
    const target = hexToRgb(hex);
    const candidates = [...mini.matchAll(/#[0-9A-Fa-f]{6}/g)].map((match) => match[0].toUpperCase());
    const near = candidates.some((candidate) => {
      const rgb = hexToRgb(candidate);
      return rgb.every((channel, index) => Math.abs(channel - target[index]) <= 1);
    });
    expect(near, `miniprogram/app.wxss has no colour near ${hex} (${label}) from --${name}`).toBe(true);
  });

  it('keeps the 14px/rpx scale aligned', () => {
    // The web body is 14px; the mini program's base is 28rpx. The tab bar label is 24rpx,
    // matching the web's 12px caption. These are the two numbers a re-scale would break.
    expect(mini).toMatch(/font-size:\s*28rpx/);
    expect(tabbar).toMatch(/\.tabbar__text\s*\{[^}]*font-size:\s*24rpx/);
  });

  it('uses the teacher accent for the teacher tab bar', () => {
    expect(tabbar).toMatch(/\.tabbar--teacher \.tabbar__item\.is-active\s*\{[^}]*color:\s*#1C5C87/);
    expect(tabbar).toMatch(/\.tabbar--teacher \.tabbar__item\.is-active \.tabbar__mark\s*\{[^}]*background:\s*#1C5C87/);
  });
});
