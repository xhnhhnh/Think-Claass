import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, LoaderCircle, Plus, UploadCloud } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { papersApi } from '@/api/papers';
import { knowledgeApi } from '@/api/knowledge';
import { useClasses } from '@/hooks/queries/useClasses';
import { usePapers } from '@/hooks/queries/usePapers';
import { useSubjects } from '@/hooks/queries/useKnowledge';

export default function TeacherPapers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: classes = [] } = useClasses();
  const { data: subjects = [] } = useSubjects();
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const { data: papers = [], isLoading } = usePapers(selectedClassId ?? undefined);

  const [createState, setCreateState] = useState({
    title: '',
    class_id: null as number | null,
    subject_id: null as number | null,
    total_points: 100,
  });

  const classOptions = useMemo(() => classes, [classes]);

  const handleCreatePaper = async () => {
    if (!createState.title.trim()) {
      toast.error('请输入试卷名称');
      return;
    }
    try {
      const created = await papersApi.create({
        title: createState.title.trim(),
        class_id: createState.class_id,
        subject_id: createState.subject_id,
        total_points: createState.total_points,
      });
      toast.success('已创建试卷');
      setCreateState((prev) => ({ ...prev, title: '' }));
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      navigate(`/teacher/papers/${created.data.id}/edit`);
    } catch (e) {}
  };

  const handleCreateSubject = async () => {
    const name = prompt('请输入学科名称（如：数学）');
    if (!name) return;
    try {
      await knowledgeApi.createSubject({ name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: ['knowledge-subjects'] });
      toast.success('已新增学科');
    } catch (e) {}
  };

  const handlePublish = async (paperId: number) => {
    try {
      await papersApi.update(paperId, { status: 'published' });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('已发布');
    } catch (e) {}
  };

  const handleUnpublish = async (paperId: number) => {
    try {
      await papersApi.update(paperId, { status: 'draft' });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('已取消发布');
    } catch (e) {}
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-indigo-500" />
            试卷库
          </h2>
          <button
            onClick={handleCreateSubject}
            className="px-4 py-2 rounded-2xl text-sm font-medium bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50"
          >
            管理学科
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2">
            <div className="text-sm font-medium text-slate-500 mb-2">新建试卷</div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={createState.title}
                onChange={(e) => setCreateState((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="试卷名称"
                className="flex-1 px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button
                onClick={handleCreatePaper}
                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center justify-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                创建
              </button>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-500 mb-2">班级筛选</div>
            <select
              value={selectedClassId ?? ''}
              onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
            >
              <option value="">全部班级</option>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-500 mb-2">新建默认学科</div>
            <select
              value={createState.subject_id ?? ''}
              onChange={(e) => setCreateState((prev) => ({ ...prev, subject_id: e.target.value ? Number(e.target.value) : null }))}
              className="w-full px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
            >
              <option value="">不设置</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
              正在加载试卷...
            </div>
          )}

          {!isLoading && papers.length === 0 && <div className="py-10 text-center text-slate-500">暂无试卷</div>}

          {!isLoading && papers.length > 0 && (
            <div className="space-y-3">
              {papers.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white/70 border border-white/60 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 truncate">{p.title}</div>
                    <div className="text-sm text-slate-500">
                      状态：{p.status} {p.subjects?.name ? `· 学科：${p.subjects.name}` : ''} {p.class_id ? `· 班级ID：${p.class_id}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => navigate(`/teacher/papers/${p.id}/edit`)}
                      className="px-4 py-2 rounded-2xl text-sm font-medium bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50"
                    >
                      编辑
                    </button>
                    {p.status === 'published' ? (
                      <button
                        onClick={() => handleUnpublish(p.id)}
                        className="px-4 py-2 rounded-2xl text-sm font-medium bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                      >
                        取消发布
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePublish(p.id)}
                        className="px-4 py-2 rounded-2xl text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100"
                      >
                        发布
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/teacher/papers/${p.id}/edit#upload`)}
                      className="px-4 py-2 rounded-2xl text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 flex items-center"
                    >
                      <UploadCloud className="w-4 h-4 mr-2" />
                      上传试卷
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

