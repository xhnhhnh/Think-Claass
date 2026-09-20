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
        isOver ? 'bg-primary/5 border-primary/30 shadow-inner' : 'bg-paper/80 backdrop-blur-xl/40 shadow-[0_4px_24px_rgba(0,0,0,0.02)] hover:bg-paper/80 backdrop-blur-xl/60'
      }`}
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-ink-1 flex items-center">
          <span className="bg-gradient-to-br from-primary to-cyan-500 p-2 rounded-card shadow-card mr-3 text-white">
            <Users className="w-4 h-4" />
          </span>
          {groupName} 
          <span className="ml-3 px-2.5 py-1 bg-paper/80 backdrop-blur-xl/60 text-ink-2 border border-white text-xs font-semibold rounded-full shadow-card">
            {count} 人
          </span>
          {average !== undefined && count > 0 && (
            <span className="ml-2 px-2.5 py-1 bg-primary/5 text-primary border border-primary/10 text-xs font-semibold rounded-full">
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
