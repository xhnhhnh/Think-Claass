import type { CSSProperties } from 'react';
import { BRAND_GREEN, BRAND_LEAF_LEFT, BRAND_LEAF_RIGHT, BRAND_STEM } from '@/lib/brandIcon';

export type BrandMarkVariant = 'badge' | 'glyph';
export interface BrandMarkProps {
  variant?: BrandMarkVariant;
  className?: string;
  style?: CSSProperties;
  width?: number | string;
  height?: number | string;
  title?: string;
}

export default function BrandMark({ variant = 'badge', className, style, width = '1em', height = '1em', title }: BrandMarkProps) {
  const color = variant === 'glyph' ? 'currentColor' : BRAND_GREEN;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={width} height={height} className={className} style={style}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {title ? <title>{title}</title> : null}
      <path fill={color} d={BRAND_LEAF_LEFT} />
      <path fill={color} d={BRAND_LEAF_RIGHT} />
      <path fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" d={BRAND_STEM} />
    </svg>
  );
}
