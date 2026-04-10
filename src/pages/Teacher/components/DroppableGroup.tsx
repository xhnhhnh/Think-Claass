import { useDroppable } from '@dnd-kit/core';
import { Users } from 'lucide-react';

export function DroppableGroup({ groupId, groupName, count, average, children }: any) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-${groupId}`,
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`p-6 rounded-3xl border border-white/50 backdrop-blur-md transition-all duration-300 ${
        isOver ? 'bg-indigo-50/60 border-indigo-300/50 shadow-inner' : 'bg-white/80 backdrop-blur-xl/40 shadow-[0_4px_24px_rgba(0,0,0,0.02)] hover:bg-white/80 backdrop-blur-xl/60'
      }`}
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-800 flex items-center">
          <span className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-2 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] mr-3 text-white">
            <Users className="w-4 h-4" />
          </span>
          {groupName} 
          <span className="ml-3 px-2.5 py-1 bg-white/80 backdrop-blur-xl/60 text-slate-600 border border-white text-xs font-semibold rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            {count} 人
          </span>
          {average !== undefined && count > 0 && (
            <span className="ml-2 px-2.5 py-1 bg-indigo-50/80 text-indigo-600 border border-indigo-100/50 text-xs font-semibold rounded-full">
              均分: {average}
            </span>
          )}
        </h3>
      </div>
      
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 min-h-[120px]">
        {children}
      </div>
    </div>
  );
}
