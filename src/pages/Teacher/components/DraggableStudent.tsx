import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, Square, GripHorizontal, PlusCircle, Star, BrainCircuit } from 'lucide-react';

export const getRankTier = (points: number) => {
  const level = Math.floor(points / 100) + 1;
  const tiers = ['青铜', '白银', '黄金', '铂金', '钻石', '战神'];
  const tierIndex = Math.min(Math.floor((level - 1) / 5), 5);
  return `${tiers[tierIndex]} Lv.${level}`;
};

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
      className={`bg-white/80 backdrop-blur-xl/70 backdrop-blur-xl rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border transition-all relative group ${
        selectedStudents.includes(student.id) ? 'border-indigo-400 ring-2 ring-indigo-400/20 shadow-indigo-100/50' : 'border-white/60 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5'
      }`}
    >
      <div className="p-5 relative">
        <div 
          {...attributes} 
          {...listeners} 
          className="absolute top-3 right-3 text-slate-300 hover:text-indigo-400 cursor-grab active:cursor-grabbing z-10 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          title="按住拖拽移动小组"
        >
          <GripHorizontal className="w-5 h-5" />
        </div>

        <button
          onClick={() => toggleSelectStudent(student.id)}
          className="absolute top-4 left-4 text-slate-300 hover:text-indigo-500 transition-colors"
        >
          {selectedStudents.includes(student.id) ? (
            <CheckSquare className="h-5 w-5 text-indigo-500" />
          ) : (
            <Square className="h-5 w-5" />
          )}
        </button>
        
        <div className="flex justify-between items-start mb-4 pl-8">
          <div>
            <h3 className="text-base font-bold text-slate-800">{student.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{student.username}</p>
          </div>
          <div className="flex flex-col items-end pr-5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-xl text-[10px] font-medium bg-gradient-to-r from-amber-100 to-orange-100 text-orange-800 border border-orange-200/50 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
              {getRankTier(student.total_points)}
            </span>
          </div>
        </div>

        <div className="space-y-2.5 mb-5 bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 text-xs font-medium">总积分</span>
            <span className="font-semibold text-slate-700">{student.total_points}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 text-xs font-medium">可用积分</span>
            <span className="font-bold text-indigo-600">{student.available_points}</span>
          </div>
        </div>

        <div className="flex space-x-2 pt-1">
          <button
            onClick={() => openPointsModal('single', student.id)}
            className="flex-1 flex justify-center items-center py-2 border border-indigo-100/50 text-xs font-medium rounded-xl text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100/80 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
          >
            <PlusCircle className="h-3.5 w-3.5 mr-1" />
            评分
          </button>
          <button
            onClick={() => openPraiseModal(student.id)}
            className="flex-1 flex justify-center items-center py-2 border border-amber-100/50 text-xs font-medium rounded-xl text-amber-600 bg-amber-50/50 hover:bg-amber-100/80 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
          >
            <Star className="h-3.5 w-3.5 mr-1" />
            表扬
          </button>
          {openAIModal && (
            <button
              onClick={() => openAIModal(student.id)}
              className="flex justify-center items-center w-8 h-8 border border-purple-100/50 text-xs font-medium rounded-xl text-purple-600 bg-purple-50/50 hover:bg-purple-100/80 transition-colors shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
              title="AI 学情诊断"
            >
              <BrainCircuit className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
