import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { BrainCircuit, GripVertical, Minus, MoreHorizontal, Plus, PlusCircle, Star } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * A pupil row on the workbench.
 *
 * The previous card stacked name, points and three action buttons vertically, so twelve pupils
 * took a screen and a half and the only thing a teacher does repeatedly - score - was hidden in
 * a modal. The row keeps the same operations but puts ±1 in reach; the dialog, praise and AI
 * report move into the per-row overflow menu so the name and the score stay readable.
 */
export function DraggableStudent({
  student,
  selectedStudents,
  toggleSelectStudent,
  openPointsModal,
  openPraiseModal,
  openAIModal,
  onQuickScore,
}: any) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `student-${student.id}` });
  const selected = selectedStudents.includes(student.id);
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const closeMenu = (element: HTMLElement) => {
    element.closest('details')?.removeAttribute('open');
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/student relative flex items-center gap-2 rounded-md px-2 py-2 transition-colors',
        selected ? 'bg-role-soft/60' : 'hover:bg-surface-3/50',
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => toggleSelectStudent(student.id)}
        aria-label={`选择 ${student.name}`}
        className="shrink-0"
      />
      <Avatar name={student.name} size="xs" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold text-fg-1">{student.name}</div>
        <div className="truncate text-caption text-fg-3">{student.username}</div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-body font-semibold text-fg-1 tabular-nums">{student.total_points}</div>
        <div className="text-caption text-fg-3">可用 {student.available_points}</div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {onQuickScore ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              onClick={() => onQuickScore(student.id, -1)}
              aria-label={`给 ${student.name} 减 1 分`}
              title="减 1 分"
            >
              <Minus aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              onClick={() => onQuickScore(student.id, 1)}
              aria-label={`给 ${student.name} 加 1 分`}
              title="加 1 分"
            >
              <Plus aria-hidden="true" />
            </Button>
          </>
        ) : null}

        <details className="relative">
          <summary
            className="flex size-control-xs cursor-pointer list-none items-center justify-center rounded-xs text-fg-3 transition-colors hover:bg-surface-3 hover:text-fg-1 [&::-webkit-details-marker]:hidden"
            aria-label={`${student.name} 的更多操作`}
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </summary>
          <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-card border border-line-1 bg-surface-4 p-1 shadow-raised">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={(event) => {
                openPointsModal('single', student.id);
                closeMenu(event.currentTarget);
              }}
            >
              <PlusCircle aria-hidden="true" />
              自定义评分
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={(event) => {
                openPraiseModal(student.id);
                closeMenu(event.currentTarget);
              }}
            >
              <Star aria-hidden="true" />
              表扬
            </Button>
            {openAIModal ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={(event) => {
                  openAIModal(student.id);
                  closeMenu(event.currentTarget);
                }}
              >
                <BrainCircuit aria-hidden="true" />
                AI 学情
              </Button>
            ) : null}
          </div>
        </details>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          {...attributes}
          {...listeners}
          aria-label={`拖动 ${student.name} 到其他小组`}
          title="拖动到其他小组"
          className="cursor-grab touch-none text-fg-3 active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
