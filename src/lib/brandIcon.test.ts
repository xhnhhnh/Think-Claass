import { describe, expect, it } from 'vitest';

import {
  BRAND_PHONE_PATH,
  BRAND_SPROUT_PATH,
  brandIconDataUrl,
  brandIconSvg,
} from './brandIcon';

/**
 * The brand mark is a favicon, so a typo in its path data fails silently: the tab shows a blank
 * square, or a shape clipped at the viewBox edge, and nothing in the app looks wrong.
 *
 * These assertions are the machine version of "look at it": every coordinate inside the 32-unit
 * viewBox, the sprout inside the screen hole it is drawn on, and both consumers reading the same
 * constants.
 */

const NUM = String.raw`-?\d*\.?\d+`;

/**
 * The anchor points of the path data - the `M`/`H`/`V` points and the endpoint of each `A` and `C`.
 *
 * Arity matters: an arc carries seven numbers and only its last two are a coordinate, so pairing the
 * numbers blindly (the first version of this helper) invents points like `(0, 0)` from an arc's
 * rotation flags and fails a correct mark.
 */
const ARITY: Record<string, number> = { M: 2, H: 1, V: 1, A: 7, C: 6, Z: 0 };

function anchors(path: string): Array<[number, number]> {
  const tokens = path.match(new RegExp(`[MHVACZ]|${NUM}`, 'g')) ?? [];
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

    if (command === 'M') [x, y] = args;
    else if (command === 'H') x = args[0];
    else if (command === 'V') y = args[0];
    else if (command === 'A' || command === 'C') [x, y] = args.slice(-2);

    if (command !== 'Z') points.push([x, y]);
  }

  return points;
}

describe('brand mark geometry', () => {
  it('keeps every coordinate inside the 32-unit viewBox', () => {
    const outside = [...anchors(BRAND_PHONE_PATH), ...anchors(BRAND_SPROUT_PATH)].filter(
      ([x, y]) => x < 0 || y < 0 || x > 32 || y > 32,
    );

    expect(outside, 'a coordinate outside the viewBox is a clipped favicon').toEqual([]);
  });

  it('draws the sprout inside the screen it sits on', () => {
    const sprout = anchors(BRAND_SPROUT_PATH);
    const xs = sprout.map(([x]) => x);
    const ys = sprout.map(([, y]) => y);

    // The screen hole from `BRAND_PHONE_PATH`, with a unit of breathing room on each side.
    expect(Math.min(...xs)).toBeGreaterThan(11);
    expect(Math.max(...xs)).toBeLessThan(21);
    expect(Math.min(...ys)).toBeGreaterThan(6.2);
    expect(Math.max(...ys)).toBeLessThan(25.8);
  });

  it('cuts three holes out of the phone: screen, earpiece, home indicator', () => {
    // Four subpaths: the body plus three holes. `evenodd` on the component is what makes them holes.
    expect(BRAND_PHONE_PATH.match(/M/g)).toHaveLength(4);
    expect(BRAND_SPROUT_PATH.match(/M/g)).toHaveLength(3);
  });

  it('gives the favicon document and the app component the same geometry', () => {
    const svg = brandIconSvg();

    expect(svg).toContain(BRAND_PHONE_PATH);
    expect(svg).toContain(BRAND_SPROUT_PATH);
    expect(svg).toContain('viewBox="0 0 32 32"');
    // The plate is what the mark is painted on; without it a transparent favicon disappears into
    // whichever tab colour the browser chose.
    expect(svg).toContain('fill="#0A0B0D"');
  });

  it('produces a data URL the browser can use without a network request', () => {
    const url = brandIconDataUrl();

    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(url.slice('data:image/svg+xml,'.length))).toBe(brandIconSvg());
  });
});
