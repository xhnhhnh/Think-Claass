import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, Square, GripHorizontal, PlusCircle, Star, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { getRankTier } from '@/lib/rankTier';

export function DraggableStudent({ student, selectedStudents, toggleSelectStudent, openPointsModal, openPraiseModal, openAIModal }: any) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `student-${student.id}`,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`bg-paper/80 backdrop-blur-xl/70 backdrop-blur-xl rounded-card shadow-card border transition-all relative group ${
        selectedStudents.includes(student.id) ? 'border-primary ring-2 ring-primary/20 shadow-primary/10' : 'border-white/60 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5'
      }`}
    >
      <div className="p-5 relative">
        <div 
          {...attributes} 
          {...listeners} 
          className="absolute top-3 right-3 text-ink-3/70 hover:text-primary/80 cursor-grab active:cursor-grabbing z-10 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          title="按住拖拽移动小组"
        >
          <GripHorizontal className="w-5 h-5" />
        </div>

        <Button variant="ghost"
          onClick={() => toggleSelectStudent(student.id)}
          className="absolute top-4 left-4 text-ink-3/70 hover:text-primary transition-colors"
        >
          {selectedStudents.includes(student.id) ? (
            <CheckSquare className="h-5 w-5 text-primary" />
          ) : (
            <Square className="h-5 w-5" />
          )}
        </Button>
        
        <div className="flex justify-between items-start mb-4 pl-8">
          <div>
            <h3 className="text-base font-bold text-ink-1">{student.name}</h3>
            <p className="text-xs text-ink-3 mt-0.5">{student.username}</p>
          </div>
          <div className="flex flex-col items-end pr-5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-card text-[10px] font-medium bg-gradient-to-r from-amber-100 to-orange-100 text-orange-800 border border-orange-200/50 shadow-card">
              {getRankTier(student.total_points)}
            </span>
          </div>
        </div>

        <div className="space-y-2.5 mb-5 bg-muted/50 rounded-card p-3 border border-border/50">
          <div className="flex justify-between text-sm">
            <span className="text-ink-3 text-xs font-medium">总积分</span>
            <span className="font-semibold text-ink-2">{student.total_points}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-3 text-xs font-medium">可用积分</span>
            <span className="font-bold text-primary">{student.available_points}</span>
          </div>
        </div>

        <div className="flex space-x-2 pt-1">
          <Button variant="ghost"
            onClick={() => openPointsModal('single', student.id)}
            className="flex-1 flex justify-center items-center py-2 border border-primary/10 text-xs font-medium rounded-card text-primary bg-primary/5 hover:bg-primary/10 transition-colors shadow-card"
          >
            <PlusCircle className="h-3.5 w-3.5 mr-1" />
            评分
          </Button>
          <Button variant="ghost"
            onClick={() => openPraiseModal(student.id)}
            className="flex-1 flex justify-center items-center py-2 border border-warning/20 text-xs font-medium rounded-card text-warning bg-warning/10 hover:bg-warning/20 transition-colors shadow-card"
          >
            <Star className="h-3.5 w-3.5 mr-1" />
            表扬
          </Button>
          {openAIModal && (
            <Button variant="ghost"
              onClick={() => openAIModal(student.id)}
              className="flex justify-center items-center w-8 h-8 border border-accent/50 text-xs font-medium rounded-card text-accent-foreground bg-accent/50 hover:bg-accent/60 transition-colors shadow-card"
              title="AI 学情诊断"
            >
              <BrainCircuit className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
