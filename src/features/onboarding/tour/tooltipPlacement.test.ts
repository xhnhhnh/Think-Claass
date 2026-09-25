import { describe, expect, it } from 'vitest';

import { TOOLTIP_ESTIMATED_HEIGHT, tooltipPosition } from './tooltipPlacement';
import type { TargetRect } from './useTourTarget';

/**
 * Tooltip placement.
 *
 * Pure arithmetic, tested at viewport sizes a test can state, because the bug this suite exists for
 * was invisible everywhere else: placement used to consider only above and below, and for a target
 * as tall as the sidebar - most of the viewport - neither fits, so it fell back to "centred" and sat
 * *on top of* the sidebar it was describing. jsdom cannot catch that, because nothing in jsdom has a
 * size; a real browser did, and these are the cases it found.
 *
 * The invariant every case asserts is the same one: **the tooltip is never over its target.** The
 * target is the control the reader has to press.
 */

const VIEWPORT = { width: 1280, height: 800 };

/** The tooltip's footprint, using the estimated height the placement itself reasons with. */
function footprint(position: { left: number; top: number; width: number }) {
  return {
    left: position.left,
    top: position.top,
    right: position.left + position.width,
    bottom: position.top + TOOLTIP_ESTIMATED_HEIGHT,
  };
}

function overlapsTarget(
  position: { left: number; top: number; width: number },
  target: TargetRect,
): boolean {
  const tooltip = footprint(position);
  return (
    tooltip.left < target.left + target.width &&
    tooltip.right > target.left &&
    tooltip.top < target.top + target.height &&
    tooltip.bottom > target.top
  );
}

describe('tooltipPosition', () => {
  it('puts the tooltip below a short target', () => {
    const target: TargetRect = { top: 300, left: 500, width: 200, height: 36 };

    const position = tooltipPosition(target, VIEWPORT);

    expect(position.placement).toBe('below');
    expect(position.top).toBeGreaterThan(target.top + target.height);
    expect(overlapsTarget(position, target)).toBe(false);
  });

  it('puts it above a target that has no room underneath', () => {
    const target: TargetRect = { top: 700, left: 500, width: 200, height: 36 };

    const position = tooltipPosition(target, VIEWPORT);

    expect(position.placement).toBe('above');
    expect(position.top + TOOLTIP_ESTIMATED_HEIGHT).toBeLessThan(target.top);
    expect(overlapsTarget(position, target)).toBe(false);
  });

  it('puts it beside a target too tall to sit under, instead of over it', () => {
    // The sidebar as the browser measured it: 271x680 inside an 800px viewport.
    const sidebar: TargetRect = { top: 80, left: 0, width: 271, height: 680 };

    const position = tooltipPosition(sidebar, VIEWPORT);

    expect(position.placement).toBe('right');
    expect(position.left).toBeGreaterThan(sidebar.left + sidebar.width);
    expect(overlapsTarget(position, sidebar)).toBe(false);
  });

  it('puts it on the left when the right is occupied', () => {
    const target: TargetRect = { top: 80, left: 1000, width: 260, height: 680 };

    const position = tooltipPosition(target, VIEWPORT);

    expect(position.placement).toBe('left');
    expect(position.left + position.width).toBeLessThan(target.left);
    expect(overlapsTarget(position, target)).toBe(false);
  });

  it('never overlaps its target, at any position in the viewport', () => {
    // The regression net: every placement the function can choose, walked across the viewport.
    const sizes: TargetRect[] = [
      { top: 0, left: 0, width: 120, height: 32 },
      { top: 0, left: 600, width: 200, height: 40 },
      { top: 380, left: 480, width: 300, height: 44 },
      { top: 740, left: 200, width: 240, height: 36 },
      { top: 60, left: 0, width: 271, height: 700 },
      { top: 20, left: 900, width: 300, height: 500 },
    ];

    const overlaps = sizes.filter((target) => overlapsTarget(tooltipPosition(target, VIEWPORT), target));

    expect(overlaps, 'targets the tooltip covered').toEqual([]);
  });

  it('centres a step with no target', () => {
    const position = tooltipPosition(null, VIEWPORT);

    expect(position.placement).toBe('centre');
    expect(position.left).toBeGreaterThan(0);
    expect(position.top).toBeGreaterThan(0);
  });

  it('keeps the tooltip inside a short viewport', () => {
    const short = { width: 900, height: 420 };
    const target: TargetRect = { top: 380, left: 700, width: 180, height: 30 };

    const position = tooltipPosition(target, short);

    expect(position.left).toBeGreaterThanOrEqual(16);
    expect(position.top).toBeGreaterThanOrEqual(16);
    expect(position.left + position.width).toBeLessThanOrEqual(short.width - 16 + 0.001);
    expect(position.top + TOOLTIP_ESTIMATED_HEIGHT).toBeLessThanOrEqual(short.height - 16 + 0.001);
  });

  it('narrows the tooltip rather than overflowing a phone-width viewport', () => {
    const phone = { width: 360, height: 720 };
    const target: TargetRect = { top: 200, left: 0, width: 120, height: 400 };

    const position = tooltipPosition(target, phone);

    expect(position.width).toBeLessThanOrEqual(phone.width - 32);
    expect(position.left).toBeGreaterThanOrEqual(16);
    expect(position.left + position.width).toBeLessThanOrEqual(phone.width - 16 + 0.001);
  });
});
