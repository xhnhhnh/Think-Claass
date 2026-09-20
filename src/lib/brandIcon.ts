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
 * **Style: a bright green app tile with the phone drawn in one ink colour, monoline.** The previous
 * mark was the inverse - a near-black plate with a solid green silhouette - which read as a developer
 * tool. This one is an app icon: a green tile, a rounded monoline phone, round caps and joins, and a
 * sprout branching off the stem inside it. Everything is a stroke of one width (with the two slots
 * thinner), so it stays crisp when it is scaled and it inherits a colour instead of baking one in.
 *
 * Geometry, on a 32-unit grid (the viewBox both consumers use):
 *   plate    0 .. 32                    full bleed and green; consumers round it with CSS
 *   body     9.6 .. 22.4 x 4 .. 28, 3.4r, stroked 2.4 -> outer edge 8.4 .. 23.6 x 2.8 .. 29.2
 *   earpiece 14.6 .. 17.4 at y 6.6      stroked 1.6, so it reads as a slot rather than a bar
 *   home     14.3 .. 17.7 at y 25.4     stroked 1.6
 *   sprout   stem 16 x 20.4 .. 13.4, leaves from (16, 15.4) to (13.2, 12.6) and (18.8, 12.6)
 *
 * The earpiece and the home slots matter more than they look: without them a rounded rectangle with
 * a plant in it is a card, and those two slots are what make it a phone at a glance.
 *
 * Both colours are artwork, not tokens - `HEX_COLOR_EXEMPT` in the design-system audit names this
 * file, because a mark that resolved through `--primary` would change colour with the role theme
 * (the parent area's primary is orange) and stop being a mark.
 */

/** The tile the mark sits on. */
export const BRAND_GREEN = '#32F08C';

/** The phone, the slots and the sprout, all in this one colour. */
export const BRAND_INK = '#0A0B0D';

/** One weight for the phone and the sprout; the two slots use a thinner one below. */
export const BRAND_STROKE_WIDTH = 2.4;

/** The slots are thinner than the body on purpose: they are details, not structure. */
export const BRAND_SLOT_STROKE_WIDTH = 1.6;

/** The phone body: a rounded rectangle, stroked. One subpath. */
export const BRAND_PHONE_PATH = [
  'M13 4H19A3.4 3.4 0 0 1 22.4 7.4V24.6A3.4 3.4 0 0 1 19 28H13A3.4 3.4 0 0 1 9.6 24.6V7.4A3.4 3.4 0 0 1 13 4Z',
].join('');

/** Earpiece and home indicator: two open strokes, drawn thinner. */
export const BRAND_SLOTS_PATH = ['M14.6 6.6H17.4', 'M14.3 25.4H17.7'].join('');

/**
 * The sprout: a stem with two leaves branching from its top. Strokes rather than filled leaves -
 * a filled leaf shape is the first thing to turn to mud when the mark is drawn at 16px, and a
 * round-capped stroke stays the same weight all the way down.
 */
export const BRAND_SPROUT_PATH = [
  'M16 20.4V13.4',
  'M16 15.4L13.2 12.6',
  'M16 15.4L18.8 12.6',
].join('');

/**
 * The standalone badge as markup. A `<link rel="icon">` needs a document, not a component, so this
 * is the bridge; keep it in step with `<BrandMark>` by deriving both from the constants above.
 */
export function brandIconSvg(): string {
  const stroke = `fill="none" stroke="${BRAND_INK}" stroke-linecap="round" stroke-linejoin="round"`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    `<rect width="32" height="32" fill="${BRAND_GREEN}"/>`,
    `<path ${stroke} stroke-width="${BRAND_STROKE_WIDTH}" d="${BRAND_PHONE_PATH}"/>`,
    `<path ${stroke} stroke-width="${BRAND_SLOT_STROKE_WIDTH}" d="${BRAND_SLOTS_PATH}"/>`,
    `<path ${stroke} stroke-width="${BRAND_STROKE_WIDTH}" d="${BRAND_SPROUT_PATH}"/>`,
    '</svg>',
  ].join('');
}

/** The mark as a `data:` URL, for `document.head` - no network request, no shipped asset. */
export function brandIconDataUrl(): string {
  return `data:image/svg+xml,${encodeURIComponent(brandIconSvg())}`;
}
