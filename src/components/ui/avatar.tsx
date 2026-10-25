import { cn } from '@/lib/utils';

/**
 * Initial-based avatar.
 *
 * The reference workbench uses pupil photos; this product stores no avatar image, so the
 * default is a calm initials plate that carries the same weight. A page may pass a
 * `src` when it really has one (the account menu can use a brand mark), but the roster
 * should not depend on uploads existing.
 */
const SIZES = {
  xs: 'size-6 text-[0.625rem]',
  sm: 'size-8 text-caption',
  md: 'size-10 text-body-sm',
  lg: 'size-12 text-body',
} as const;

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // Chinese names read best as one surname character at small sizes; Latin names as initials.
  if (/[\u4e00-\u9fff]/.test(trimmed)) return trimmed.slice(0, 1);
  return trimmed
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Avatar({
  name,
  size = 'md',
  className,
  src,
  alt,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
  src?: string | null;
  alt?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? name}
        className={cn('shrink-0 rounded-pill border border-line-1 bg-surface-3 object-cover', SIZES[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      title={name}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-pill border border-line-1 bg-surface-3 font-semibold text-fg-2',
        SIZES[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export default Avatar;
