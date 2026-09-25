/**
 * Where the tour's tooltip goes.
 *
 * A module of its own rather than a helper inside `GuidedTour.tsx`, for two reasons: a file that
 * exports a component and a function stops being fast-refreshable (`react-refresh/only-export-components`
 * says so), and this is arithmetic with an invariant worth testing on its own - the tooltip must
 * never cover its target - which is much easier to state without rendering anything.
 *
 * ## The invariant
 *
 * The target is the thing the reader has to press, so a tooltip over it is a tooltip over the
 * button it is telling you to press. The first version considered only above and below and fell back
 * to "centred", which for a target taller than the space on either side - the sidebar, most of the
 * viewport - meant centred *on top of it*. A real browser caught that; jsdom cannot, because nothing
 * in jsdom has a size. So the sides are considered too, and `placement` is returned so the decision
 * is observable rather than inferred from coordinates.
 */

import type { TargetRect } from './useTourTarget';

export const TOOLTIP_MAX_WIDTH = 340;
export const TOOLTIP_GAP = 14;
export const TOOLTIP_MARGIN = 16;

/**
 * Used to decide whether the tooltip fits above, below or beside the target *before* it is rendered.
 *
 * Measured instead of guessed is not an option here: the position has to be chosen in the same
 * commit that renders the tooltip, and measuring it first would mean rendering it off-screen and
 * flashing it into place. The value is a ceiling - the real tooltip is usually shorter - and the
 * only consequence of being wrong is that a step sits a little further from its target.
 */
export const TOOLTIP_ESTIMATED_HEIGHT = 232;

export interface TooltipPosition {
  left: number;
  top: number;
  width: number;
  /** Which side of the target it ended up on. `centre` means nothing fitted. */
  placement: 'below' | 'above' | 'right' | 'left' | 'centre';
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/**
 * Place the tooltip near its target without covering it.
 *
 * The order is by how much room is really available: below, then above, then right, then left, and
 * only when the target fills the viewport is overlapping accepted as the least-bad option.
 * `viewport` is a parameter rather than a read of `window` so the decisions can be tested at sizes a
 * test can state.
 */
export function tooltipPosition(
  rect: TargetRect | null,
  viewport: { width: number; height: number } = {
    width: window.innerWidth,
    height: window.innerHeight,
  },
): TooltipPosition {
  const { width: viewportWidth, height: viewportHeight } = viewport;
  const width = Math.min(TOOLTIP_MAX_WIDTH, viewportWidth - TOOLTIP_MARGIN * 2);
  const height = TOOLTIP_ESTIMATED_HEIGHT;

  const centredLeft = clamp((viewportWidth - width) / 2, TOOLTIP_MARGIN, viewportWidth - TOOLTIP_MARGIN - width);
  const centredTop = clamp(
    (viewportHeight - height) / 2,
    TOOLTIP_MARGIN,
    viewportHeight - TOOLTIP_MARGIN - height,
  );

  if (!rect) {
    return { left: centredLeft, top: centredTop, width, placement: 'centre' };
  }

  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;

  const roomBelow = viewportHeight - TOOLTIP_MARGIN - bottom - TOOLTIP_GAP;
  const roomAbove = rect.top - TOOLTIP_GAP - TOOLTIP_MARGIN;
  const roomRight = viewportWidth - TOOLTIP_MARGIN - right - TOOLTIP_GAP;
  const roomLeft = rect.left - TOOLTIP_GAP - TOOLTIP_MARGIN;

  const centredOnTarget = clamp(
    rect.left + rect.width / 2 - width / 2,
    TOOLTIP_MARGIN,
    viewportWidth - TOOLTIP_MARGIN - width,
  );

  if (roomBelow >= height) {
    return { left: centredOnTarget, top: bottom + TOOLTIP_GAP, width, placement: 'below' };
  }

  if (roomAbove >= height) {
    return { left: centredOnTarget, top: rect.top - TOOLTIP_GAP - height, width, placement: 'above' };
  }

  // A target too tall for either side: sit beside it, level with its middle.
  const besideTop = clamp(
    rect.top + rect.height / 2 - height / 2,
    TOOLTIP_MARGIN,
    viewportHeight - TOOLTIP_MARGIN - height,
  );

  if (roomRight >= width) {
    return { left: right + TOOLTIP_GAP, top: besideTop, width, placement: 'right' };
  }

  if (roomLeft >= width) {
    return { left: rect.left - TOOLTIP_GAP - width, top: besideTop, width, placement: 'left' };
  }

  return { left: centredLeft, top: centredTop, width, placement: 'centre' };
}
