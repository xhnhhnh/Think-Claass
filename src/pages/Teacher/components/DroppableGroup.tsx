import { useDroppable } from '@dnd-kit/core';
import { Users } from 'lucide-react';

export function DroppableGroup({ groupId, groupName, count, average, children }: any) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-${groupId}`,
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`min-w-0 rounded-panel border p-4 transition-colors sm:p-5 ${
        isOver ? 'border-role bg-role-soft/60' : 'border-line-1 bg-surface-2 shadow-card'
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg-1">
          <span className="rounded-card bg-role p-2 text-role-contrast">
            <Users className="w-4 h-4" />
          </span>
          {groupName}
          <span className="rounded-full border border-line-1 bg-surface-1 px-2 py-0.5 text-xs font-medium text-fg-2">
            {count} 人
          </span>
          {average !== undefined && count > 0 && (
            <span className="rounded-full bg-role-soft px-2 py-0.5 text-xs font-medium text-role-ink">
              人均成长 {average}
            </span>
          )}
        </h3>
      </div>
      <div className="flex min-h-20 flex-col gap-2">
        {children}
      </div>
    </div>
  );
}
