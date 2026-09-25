/** Shared leaf geometry for the app mark and browser icon. */
export const BRAND_GREEN = '#185A43';
export const BRAND_INK = '#185A43';
export const BRAND_LEAF_LEFT = 'M15.1 17.2C7.5 17.8 4.6 13.1 5.2 7.3c5.2.1 9.1 2.7 9.9 9.9Z';
export const BRAND_LEAF_RIGHT = 'M16.6 14.9C16.8 7.6 21.1 4.6 27.6 4c-.2 6.5-3.7 10.5-11 10.9Z';
export const BRAND_STEM = 'M16.2 28.2v-10c0-4.4 2.5-7.9 6.5-10.2';

export function brandIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="${BRAND_GREEN}" d="${BRAND_LEAF_LEFT}"/><path fill="${BRAND_GREEN}" d="${BRAND_LEAF_RIGHT}"/><path fill="none" stroke="${BRAND_GREEN}" stroke-width="2" stroke-linecap="round" d="${BRAND_STEM}"/></svg>`;
}

export function brandIconDataUrl(): string {
  return `data:image/svg+xml,${encodeURIComponent(brandIconSvg())}`;
}
