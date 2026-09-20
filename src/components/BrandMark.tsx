import type { CSSProperties } from 'react';

import {
  BRAND_GREEN,
  BRAND_INK,
  BRAND_PHONE_PATH,
  BRAND_SLOT_STROKE_WIDTH,
  BRAND_SLOTS_PATH,
  BRAND_SPROUT_PATH,
  BRAND_STROKE_WIDTH,
} from '@/lib/brandIcon';

/**
 * The Think-Class brand mark: a monoline phone with a sprout branching off the stem.
 *
 * Drawn inline so it scales without a raster step and can be recoloured by the surrounding text
 * colour - the mark is used at 16px in the footer, 28px in the sidebar and 64px on the login card,
 * and a shipped file can only be scaled.
 *
 * The geometry lives in `@/lib/brandIcon`, which is also what the browser tab uses; this file only
 * decides how it is painted.
 */
export type BrandMarkVariant = 'badge' | 'glyph';

export interface BrandMarkProps {
  /**
   * `badge` - the green tile with the mark in ink, for light surfaces (cards, headers, login).
   * `glyph` - the mark alone in `currentColor`, for dark or coloured surfaces.
   */
  variant?: BrandMarkVariant;
  className?: string;
  style?: CSSProperties;
  width?: number | string;
  height?: number | string;
  /** Accessible name. Leave it out to render the mark as decorative. */
  title?: string;
}

export default function BrandMark({
  variant = 'badge',
  className,
  style,
  width = '1em',
  height = '1em',
  title,
}: BrandMarkProps) {
  const labelled = Boolean(title);
  // The tile is what carries the colour, so the mark on it is ink; a glyph on someone else's
  // surface has to inherit that surface's text colour instead.
  const stroke = variant === 'badge' ? BRAND_INK : 'currentColor';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={width}
      height={height}
      className={className}
      style={style}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {variant === 'badge' ? <rect width="32" height="32" fill={BRAND_GREEN} /> : null}
      {/* Round caps and joins are the style: one weight for the phone and the sprout, a thinner
          one for the two slots, so the mark keeps the same texture at every size. */}
      <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
        <path strokeWidth={BRAND_STROKE_WIDTH} d={BRAND_PHONE_PATH} />
        <path strokeWidth={BRAND_SLOT_STROKE_WIDTH} d={BRAND_SLOTS_PATH} />
        <path strokeWidth={BRAND_STROKE_WIDTH} d={BRAND_SPROUT_PATH} />
      </g>
    </svg>
  );
}
