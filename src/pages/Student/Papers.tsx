import { useNavigate } from 'react-router-dom';
import { FileText, LoaderCircle, PlayCircle } from 'lucide-react';

import { usePapers } from '@/hooks/queries/usePapers';

export default function StudentPapers() {
  const navigate = useNavigate();
  const { data: papers = [], isLoading } = usePapers();

  return (
    <div className="space-y-6">
      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="flex items-center mb-4">
          <FileText className="w-5 h-5 mr-2 text-indigo-500" />
          <h2 className="text-lg font-bold text-slate-800">试卷练习</h2>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
            正在加载试卷...
          </div>
        )}

        {!isLoading && papers.length === 0 && <div className="py-16 text-center text-slate-500">暂无可练习试卷</div>}

        {!isLoading && papers.length > 0 && (
          <div className="space-y-3">
            {papers.map((p) => (
              <div key={p.id} className="bg-white/70 border border-white/60 rounded-3xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 truncate">{p.title}</div>
                  <div className="text-sm text-slate-500">{p.subjects?.name ? `学科：${p.subjects.name}` : '未设置学科'}</div>
                </div>
                <button
                  onClick={() => navigate(`/student/papers/${p.id}`)}
                  className="px-4 py-2 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 font-semibold flex items-center justify-center"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  开始练习
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

