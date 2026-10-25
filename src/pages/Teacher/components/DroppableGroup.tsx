import { useDroppable } from '@dnd-kit/core';
import { Users } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * One group column on the teacher workbench.
 *
 * The reference layout reads as a board, not a stack of cards: a tinted header with the
 * group's identity and average, then hairline-separated student rows. The tone alternates by
 * column so two groups are distinguishable without inventing a new palette per group.
 */
export function DroppableGroup({ groupId, groupName, count, average, index = 0, children }: any) {
  const { setNodeRef, isOver } = useDroppable({ id: `group-${groupId}` });
  const warm = index % 2 === 0;

  return (
    <section
      ref={setNodeRef}
      data-slot="group-board"
      aria-label={`${groupName}，${count} 人`}
      className={cn(
        'min-w-0 rounded-card border bg-surface-2 transition-colors',
        isOver ? 'border-role ring-2 ring-role/10' : 'border-line-1',
      )}
    >
      <header
        className={cn(
          'flex items-center justify-between gap-3 rounded-t-card border-b border-line-1 px-4 py-3',
          warm ? 'bg-warning-soft/35' : 'bg-role-soft/30',
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-card',
              warm ? 'bg-warning-soft text-warning-ink' : 'bg-role-soft text-role-ink',
            )}
          >
            <Users aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-body font-semibold text-fg-1">{groupName}</h3>
            <p className="text-caption text-fg-3">{count} 人</p>
          </div>
        </div>
        {count > 0 ? (
          <div className="shrink-0 text-right">
            <div className="text-metric text-fg-1 tabular-nums">{average}</div>
            <div className="text-caption text-fg-3">人均成长</div>
          </div>
        ) : null}
      </header>
      <div className="divide-y divide-line-2 px-1 py-1">
        {children}
      </div>
    </section>
  );
}
