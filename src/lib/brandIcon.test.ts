import { describe, expect, it } from 'vitest';

import {
  BRAND_PHONE_PATH,
  BRAND_SLOTS_PATH,
  BRAND_SPROUT_PATH,
  BRAND_STROKE_WIDTH,
  brandIconDataUrl,
  brandIconSvg,
} from './brandIcon';

/**
 * The brand mark is a favicon, so a typo in its path data fails silently: the tab shows a blank
 * square, or a shape clipped at the viewBox edge, and nothing in the app looks wrong.
 *
 * These assertions are the machine version of "look at it": the stroked geometry inside the 32-unit
 * viewBox, the sprout inside the phone body it grows in, the expected number of subpaths, and both
 * consumers reading the same constants.
 */

const NUM = String.raw`-?\d*\.?\d+`;

/**
 * The anchor points of the path data - the `M`/`L`/`H`/`V` points and the endpoint of each `A`/`C`.
 *
 * Arity matters: an arc carries seven numbers and only its last two are a coordinate, so pairing the
 * numbers blindly (the first version of this helper) invents points like `(0, 0)` from an arc's
 * rotation flags and fails a correct mark.
 */
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, A: 7, C: 6, Z: 0 };

function anchors(path: string): Array<[number, number]> {
  const tokens = path.match(new RegExp(`[MHVACZL]|${NUM}`, 'g')) ?? [];
  const points: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  let i = 0;

  while (i < tokens.length) {
    const command = tokens[i];
    const arity = ARITY[command];
    if (arity === undefined) throw new Error(`unexpected command in path data: ${command}`);
    const args = tokens.slice(i + 1, i + 1 + arity).map(Number);
    i += 1 + arity;

    if (command === 'M' || command === 'L') [x, y] = args;
    else if (command === 'H') x = args[0];
    else if (command === 'V') y = args[0];
    else if (command === 'A' || command === 'C') [x, y] = args.slice(-2);

    if (command !== 'Z') points.push([x, y]);
  }

  return points;
}

/** A stroked path reaches half the stroke width beyond its anchors. */
function strokedBounds(path: string, width = BRAND_STROKE_WIDTH) {
  const points = anchors(path);
  const half = width / 2;
  return {
    x0: Math.min(...points.map(([x]) => x)) - half,
    y0: Math.min(...points.map(([, y]) => y)) - half,
    x1: Math.max(...points.map(([x]) => x)) + half,
    y1: Math.max(...points.map(([, y]) => y)) + half,
  };
}

describe('brand mark geometry', () => {
  it('keeps the stroked geometry inside the 32-unit viewBox', () => {
    for (const [name, path] of [
      ['phone', BRAND_PHONE_PATH],
      ['sprout', BRAND_SPROUT_PATH],
      ['slots', BRAND_SLOTS_PATH],
    ] as const) {
      const { x0, y0, x1, y1 } = strokedBounds(path, name === 'slots' ? 1.6 : BRAND_STROKE_WIDTH);
      expect([name, x0 >= 0, y0 >= 0, x1 <= 32, y1 <= 32], 'a stroke past the viewBox is clipped').toEqual([
        name,
        true,
        true,
        true,
        true,
      ]);
    }
  });

  it('grows the sprout inside the phone body, not over its edge', () => {
    // The body path, inset by its own stroke: 9.6 .. 22.4 x 4 .. 28 at 2.4 wide.
    const inner = { x0: 9.6 + 1.2, y0: 4 + 1.2, x1: 22.4 - 1.2, y1: 28 - 1.2 };
    const sprout = strokedBounds(BRAND_SPROUT_PATH);

    expect(sprout.x0).toBeGreaterThanOrEqual(inner.x0);
    expect(sprout.y0).toBeGreaterThanOrEqual(inner.y0);
    expect(sprout.x1).toBeLessThanOrEqual(inner.x1);
    expect(sprout.y1).toBeLessThanOrEqual(inner.y1);
  });

  it('is one body, two slots and three sprout strokes', () => {
    expect(BRAND_PHONE_PATH.match(/M/g)).toHaveLength(1);
    expect(BRAND_SLOTS_PATH.match(/M/g)).toHaveLength(2);
    // Stem plus two leaves.
    expect(BRAND_SPROUT_PATH.match(/M/g)).toHaveLength(3);
  });

  it('gives the favicon document and the app component the same geometry', () => {
    const svg = brandIconSvg();

    expect(svg).toContain(BRAND_PHONE_PATH);
    expect(svg).toContain(BRAND_SLOTS_PATH);
    expect(svg).toContain(BRAND_SPROUT_PATH);
    expect(svg).toContain('viewBox="0 0 32 32"');
    // The green tile is what the mark is drawn on; without it a transparent favicon disappears into
    // whichever tab colour the browser chose.
    expect(svg).toContain('fill="#32F08C"');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it('produces a data URL the browser can use without a network request', () => {
    const url = brandIconDataUrl();

    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(url.slice('data:image/svg+xml,'.length))).toBe(brandIconSvg());
  });
});
