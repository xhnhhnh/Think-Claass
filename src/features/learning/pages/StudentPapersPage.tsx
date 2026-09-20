import { useNavigate } from 'react-router-dom';
import { FileText, LoaderCircle, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { usePapers } from '@/hooks/queries/usePapers';

export default function StudentPapers() {
  const navigate = useNavigate();
  const { data: papers = [], isLoading } = usePapers();

  return (
    <div className="space-y-6">
      <div className="bg-paper/80 backdrop-blur-xl p-6 rounded-panel border border-white/60 shadow-card">
        <div className="flex items-center mb-4">
          <FileText className="w-5 h-5 mr-2 text-primary" />
          <h2 className="text-lg font-bold text-ink-1">试卷练习</h2>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-ink-3">
            <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
            正在加载试卷...
          </div>
        )}

        {!isLoading && papers.length === 0 && <div className="py-16 text-center text-ink-3">暂无可练习试卷</div>}

        {!isLoading && papers.length > 0 && (
          <div className="space-y-3">
            {papers.map((p) => (
              <div key={p.id} className="bg-paper/70 border border-white/60 rounded-panel p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-ink-1 truncate">{p.title}</div>
                  <div className="text-sm text-ink-3">{p.subjects?.name ? `学科：${p.subjects.name}` : '未设置学科'}</div>
                </div>
                <Button variant="ghost"
                  onClick={() => navigate(`/student/papers/${p.id}`)}
                  className="px-4 py-2 rounded-card bg-primary/5 text-primary border border-primary/10 hover:bg-primary/10 font-semibold flex items-center justify-center"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  开始练习
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

