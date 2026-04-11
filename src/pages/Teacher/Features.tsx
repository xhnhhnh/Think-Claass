import { useEffect, useState } from 'react';

import { useClasses } from '@/hooks/queries/useClasses';
import ClassFeaturePanel from './components/ClassFeaturePanel';

export default function TeacherFeatures() {
  const { data: classes = [], isLoading } = useClasses();
  const [classId, setClassId] = useState<number | null>(null);

  useEffect(() => {
    if (!classId && classes.length > 0) {
      setClassId(classes[0].id);
    }
  }, [classId, classes]);

  if (isLoading) {
    return <div className="text-center py-12 text-slate-500">加载中...</div>;
  }

  if (classes.length === 0) {
    return <div className="text-center py-12 text-slate-500">请先在主控台创建班级</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col space-y-3 pb-2">
        <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
          <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">班级:</span>
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setClassId(cls.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                classId === cls.id
                  ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                  : 'bg-white/80 backdrop-blur-xl text-slate-600 border border-gray-200 hover:bg-slate-50/50'
              }`}
            >
              {cls.name}
            </button>
          ))}
        </div>
      </div>

      <ClassFeaturePanel classId={classId} />
    </div>
  );
}
