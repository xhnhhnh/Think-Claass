import { useEffect, useState } from 'react';

import { useClasses } from '@/hooks/queries/useClasses';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
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
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" label="正在加载班级" className="text-primary" />
      </div>
    );
  }

  if (classes.length === 0) {
    return <EmptyState title="请先在主控台创建班级" />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col space-y-3 pb-2">
        <div className="flex items-center space-x-2 overflow-x-auto scrollbar-hide">
          <span className="text-sm font-bold text-ink-3 mr-2 flex-shrink-0">班级:</span>
          {classes.map((cls) => (
            <Button variant="ghost"
              key={cls.id}
              onClick={() => setClassId(cls.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                classId === cls.id
                  ? 'bg-gradient-to-r from-primary to-cyan-500 text-white shadow-card'
                  : 'bg-paper/80 backdrop-blur-xl text-ink-2 border border-border hover:bg-muted/60'
              }`}
            >
              {cls.name} · ID {cls.id} · 邀请码 {cls.invite_code}
            </Button>
          ))}
        </div>
      </div>

      <ClassFeaturePanel classId={classId} />
    </div>
  );
}
