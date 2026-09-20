/**
 * Celebration colours.
 *
 * The confetti palettes were inline hex arrays in four pages - `['#fbbf24', '#f59e0b',
 * '#fb923c']` in the parent area, a red/orange/yellow burst on the big screen, and so
 * on. They are artwork rather than a surface, but they are still a hard-coded palette
 * repeated per page, so they live here: named by intent, one place to change, and
 * exempt from the audit's hex-colour metric by name (`HEX_COLOR_EXEMPT` in
 * `scripts/migration/lib/ui-audit.mjs`).
 *
 * `brand` follows the campus palette (amber/orange, the parent theme's accent);
 * `blaze` is the loud one for the projection screen; `cool` is for the learning
 * screens.
 */
export const CELEBRATION = {
  brand: ['#fbbf24', '#f59e0b', '#fb923c'],
  blaze: ['#ff0000', '#ff7700', '#ffff00'],
  cool: ['#38bdf8', '#34d399', '#a78bfa'],
} as const;

export type CelebrationPalette = keyof typeof CELEBRATION;
