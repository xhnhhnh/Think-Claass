/**
 * The Think-Class mark, as geometry - the single definition.
 *
 * There is deliberately no `public/favicon.svg` any more. That file was a second copy of exactly
 * this path data, which meant every tweak to the mark had to be made twice, and the two copies had
 * already drifted once (the file carried a frame 3.04px thick on one edge and 3.06px on another,
 * with the eyes off-centre). Two consumers read from here instead:
 *
 *   - `<BrandMark>` renders it in the app (login card, campus header, sidebar, public site);
 *   - `brandIconDataUrl()` is what the browser tab falls back to before a superadmin uploads a
 *     `site_favicon` in platform settings.
 *
 * Geometry, on a 32-unit grid:
 *   plate   0 .. 32          full bleed; consumers round it with CSS
 *   screen  5.5 .. 26.5 x 8.5 .. 23.5, 3px frame, 1.5r outer corners, bottom-left step cut
 *   hole    8.5 .. 23.5 x 11.5 .. 20.5     (3px gutter on every side)
 *   eyes    diamonds at (13,16) and (19,16), half-diagonal 2 - symmetric about the hole
 */

export const BRAND_PLATE = '#0A0B0D';
export const BRAND_GREEN = '#32F08C';

/** The screen frame as one path; `evenodd` is what cuts the hole out of it. */
export const BRAND_SCREEN_PATH =
  'M7 8.5H25A1.5 1.5 0 0 1 26.5 10V22A1.5 1.5 0 0 1 25 23.5H8.5V22H5.5V10A1.5 1.5 0 0 1 7 8.5ZM8.5 11.5H23.5V20.5H8.5Z';

/** The two pixel eyes. Two disjoint diamonds, so any fill rule renders them the same. */
export const BRAND_EYES_PATH = 'M13 14L15 16L13 18L11 16ZM19 14L21 16L19 18L17 16Z';

/**
 * The standalone badge as markup. A `<link rel="icon">` needs a document, not a component, so this
 * is the bridge; keep it in step with `<BrandMark>` by deriving both from the constants above.
 */
export function brandIconSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    `<rect width="32" height="32" fill="${BRAND_PLATE}"/>`,
    `<path fill="${BRAND_GREEN}" fill-rule="evenodd" d="${BRAND_SCREEN_PATH}"/>`,
    `<path fill="${BRAND_GREEN}" d="${BRAND_EYES_PATH}"/>`,
    '</svg>',
  ].join('');
}

/** The mark as a `data:` URL, for `document.head` - no network request, no shipped asset. */
export function brandIconDataUrl(): string {
  return `data:image/svg+xml,${encodeURIComponent(brandIconSvg())}`;
}
