import type { CSSProperties } from 'react';

import {
  BRAND_EYES_PATH,
  BRAND_GREEN,
  BRAND_PLATE,
  BRAND_SCREEN_PATH,
} from '@/lib/brandIcon';

/**
 * The Think-Class brand mark, drawn inline so it scales without a raster step and can be
 * recoloured by the surrounding text colour.
 *
 * Why a component instead of a shipped icon file: the mark is used at 16px in the footer, 28px in
 * the sidebar and 64px on the login card. A file can only be scaled, so a surface that wants a
 * monochrome mark on a dark background - or a crisper render on a retina display - has to ship a
 * second asset. One path serves all of them.
 *
 * The geometry lives in `@/lib/brandIcon`, which is also what the browser tab uses; this file only
 * decides how it is painted.
 */
export type BrandMarkVariant = 'badge' | 'glyph';

export interface BrandMarkProps {
  /**
   * `badge` - the dark plate plus the green mark, for light surfaces (cards, headers, login).
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
      {variant === 'badge' ? <rect width="32" height="32" fill={BRAND_PLATE} /> : null}
      <g fill={variant === 'badge' ? BRAND_GREEN : 'currentColor'}>
        {/* `evenodd` is what cuts the screen out of the frame; the eyes are plain diamonds. */}
        <path fillRule="evenodd" d={BRAND_SCREEN_PATH} />
        <path d={BRAND_EYES_PATH} />
      </g>
    </svg>
  );
}
