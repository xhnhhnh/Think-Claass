import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Breadcrumbs.
 *
 * The context bar owns the page's `h1`; this is the "where am I" trail above it,
 * and it is the reason the old shell's giant hero heading is gone - the heading
 * answered "what is this" and nothing answered "where is this".
 *
 * The trail is a `<nav aria-label="面包屑">` containing an ordered list, because
 * that is the structure assistive technology expects; the separators are
 * decorative and hidden from the accessibility tree rather than read out as
 * "chevron right" between every crumb.
 *
 * A trail of one crumb renders nothing: on a top-level page the trail would only
 * repeat the heading directly beneath it.
 */

export interface Crumb {
  label: string;
  /** Optional: the last crumb is the current page and is never a link. */
  to?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
  /** Rendered before the trail - the "back to the area" affordance. */
  leading?: React.ReactNode;
}

export function Breadcrumbs({ items, className, leading }: BreadcrumbsProps) {
  if (items.length <= 1 && !leading) return null;

  return (
    <nav aria-label="面包屑" className={cn('flex min-w-0 items-center gap-2 text-xs', className)}>
      {leading}
      <ol className="flex min-w-0 items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="truncate rounded-xs px-1 py-0.5 font-medium text-fg-3 transition-colors hover:bg-surface-3 hover:text-fg-1"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn('truncate px-1 py-0.5', isLast ? 'font-semibold text-fg-2' : 'text-fg-3')}
                >
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-fg-3/60" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
