import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { BrainCircuit, GripHorizontal, PlusCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { getRankTier } from '@/lib/rankTier';

export function DraggableStudent({ student, selectedStudents, toggleSelectStudent, openPointsModal, openPraiseModal, openAIModal }: any) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `student-${student.id}` });
  const selected = selectedStudents.includes(student.id);
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-card border bg-surface-1 p-3 transition-colors sm:p-4 ${selected ? 'border-role bg-role-soft/30' : 'border-line-1 hover:border-role/40'}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={() => toggleSelectStudent(student.id)}
          aria-label={`选择 ${student.name}`}
          className="mt-1 h-4 w-4 shrink-0 accent-role"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-24 flex-1">
            <h3 className="truncate text-sm font-semibold text-fg-1">{student.name}</h3>
            <p className="truncate text-xs text-fg-3">{student.username}</p>
          </div>
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-ink">{getRankTier(student.total_points)}</span>
          <div className="text-right text-xs text-fg-3">
            <p>成长 <strong className="text-sm text-fg-1">{student.total_points}</strong></p>
            <p>可用 <strong className="text-sm text-role">{student.available_points}</strong></p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          {...attributes}
          {...listeners}
          aria-label={`拖动 ${student.name} 到其他小组`}
          title="拖动到其他小组"
          className="shrink-0 rounded p-1 text-fg-3 hover:bg-surface-3 hover:text-role focus-visible:outline focus-visible:outline-2 focus-visible:outline-role"
        >
          <GripHorizontal className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
        <Button variant="ghost" onClick={() => openPointsModal('single', student.id)} className="h-8 rounded-card bg-role-soft px-3 text-xs font-medium text-role-ink hover:bg-role-soft/70">
          <PlusCircle className="mr-1 h-3.5 w-3.5" />评分
        </Button>
        <Button variant="ghost" onClick={() => openPraiseModal(student.id)} className="h-8 rounded-card bg-warning-soft px-3 text-xs font-medium text-warning-ink hover:bg-warning-soft/70">
          <Star className="mr-1 h-3.5 w-3.5" />表扬
        </Button>
        {openAIModal && (
          <Button variant="ghost" onClick={() => openAIModal(student.id)} className="h-8 rounded-card px-2 text-xs text-fg-2" title="AI 学情诊断" aria-label={`查看 ${student.name} 的 AI 学情诊断`}>
            <BrainCircuit className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
