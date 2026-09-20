/**
 * The Think-Class mark, as geometry - the single definition.
 *
 * There is deliberately no `public/favicon.svg`: that file was a second copy of exactly this path
 * data, which meant every tweak had to be made twice, and the two copies had already drifted once.
 * Two consumers read from here instead:
 *
 *   - `<BrandMark>` renders it in the app (login card, campus header, sidebar, public site);
 *   - `brandIconDataUrl()` is what the browser tab falls back to before a superadmin uploads a
 *     `site_favicon` in platform settings.
 *
 * The mark is a **phone with a sprout growing on its screen**: the product is a classroom that
 * children carry in their pocket, and the sprout is the growth the app is about. The phone is a
 * filled silhouette rather than an outline because the mark has to survive 16px in a browser tab,
 * where an outline turns to mush and a solid shape still reads.
 *
 * Geometry, on a 32-unit grid (the viewBox both consumers use):
 *   plate    0 .. 32              full bleed; consumers round it with CSS
 *   body     8.5 .. 23.5 x 2.5 .. 29.5, 3.6r  - the silhouette, and the only thing at 16px
 *   screen   11 .. 21 x 6.2 .. 25.8, 1.9r      - a hole, so the plate (or the page) shows through
 *   earpiece 14.3 .. 17.7 x 3.6 .. 4.65       - a hole in the top bezel
 *   home     13.4 .. 18.6 x 27.1 .. 28.2      - a hole in the bottom bezel
 *   sprout   stem 15.35 .. 16.65 x 14.4 .. 22, two leaves meeting it at y 17
 *
 * The earpiece and the home indicator matter more than they look: without them a rounded rectangle
 * with a hole is a card, and those two slots are what make it a phone at a glance.
 *
 * Both colours are artwork, not tokens - `HEX_COLOR_EXEMPT` in the design-system audit names this
 * file, because a brand mark that resolved through `--primary` would change colour with the role
 * theme (the parent area's primary is orange) and stop being a mark.
 */

export const BRAND_PLATE = '#0A0B0D';
export const BRAND_GREEN = '#32F08C';

/**
 * The phone, as body-plus-holes; `evenodd` is what cuts the screen, the earpiece and the home
 * indicator out of the silhouette, so the plate shows through them.
 */
export const BRAND_PHONE_PATH = [
  // body
  'M12.1 2.5H19.9A3.6 3.6 0 0 1 23.5 6.1V25.9A3.6 3.6 0 0 1 19.9 29.5H12.1A3.6 3.6 0 0 1 8.5 25.9V6.1A3.6 3.6 0 0 1 12.1 2.5Z',
  // earpiece slot
  'M14.825 3.6H17.175A0.525 0.525 0 0 1 17.7 4.125A0.525 0.525 0 0 1 17.175 4.65H14.825A0.525 0.525 0 0 1 14.3 4.125A0.525 0.525 0 0 1 14.825 3.6Z',
  // screen
  'M12.9 6.2H19.1A1.9 1.9 0 0 1 21 8.1V23.9A1.9 1.9 0 0 1 19.1 25.8H12.9A1.9 1.9 0 0 1 11 23.9V8.1A1.9 1.9 0 0 1 12.9 6.2Z',
  // home indicator
  'M13.95 27.1H18.05A0.55 0.55 0 0 1 18.6 27.65A0.55 0.55 0 0 1 18.05 28.2H13.95A0.55 0.55 0 0 1 13.4 27.65A0.55 0.55 0 0 1 13.95 27.1Z',
].join('');

/**
 * The sprout on the screen: a stem and two leaves, drawn inside the screen's box (x 11 .. 21,
 * y 6.2 .. 25.8) so it needs no clip path. Leaves are quadratics through the stem, which is what
 * gives them a point at the tip and a belly at the base.
 */
export const BRAND_SPROUT_PATH = [
  // stem
  'M15.25 14.15A0.75 0.75 0 0 1 16.75 14.15V19.65A0.75 0.75 0 0 1 15.25 19.65Z',
  // left leaf: a lens from the stem out to a point, so the two leaves stay separate shapes
  'M15.4 15.9C13.2 15.4 11.9 13.7 11.8 11.6C14 11.9 15.6 13.4 15.4 15.9Z',
  // right leaf
  'M16.6 15.9C18.8 15.4 20.1 13.7 20.2 11.6C18 11.9 16.4 13.4 16.6 15.9Z',
].join('');

/**
 * The standalone badge as markup. A `<link rel="icon">` needs a document, not a component, so this
 * is the bridge; keep it in step with `<BrandMark>` by deriving both from the constants above.
 */
export function brandIconSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    `<rect width="32" height="32" fill="${BRAND_PLATE}"/>`,
    `<path fill="${BRAND_GREEN}" fill-rule="evenodd" d="${BRAND_PHONE_PATH}"/>`,
    `<path fill="${BRAND_GREEN}" d="${BRAND_SPROUT_PATH}"/>`,
    '</svg>',
  ].join('');
}

/** The mark as a `data:` URL, for `document.head` - no network request, no shipped asset. */
export function brandIconDataUrl(): string {
  return `data:image/svg+xml,${encodeURIComponent(brandIconSvg())}`;
}
