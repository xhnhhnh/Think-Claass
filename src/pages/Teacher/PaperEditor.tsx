import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoaderCircle, Save, Plus, ArrowLeft, UploadCloud, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { papersApi, type PaperDetail } from '@/api/papers';
import { apiPost } from '@/lib/api';
import { usePaper } from '@/hooks/queries/usePapers';

type EditorSection = { title: string; order_no: number };
type EditorItem = {
  order_no: number;
  section_order_no: number | null;
  question: {
    stem: string;
    type: string;
    answer_json: string;
    default_points: number;
    is_subjective: number;
  };
};

export default function TeacherPaperEditor() {
  const { id } = useParams();
  const paperId = id ? Number(id) : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: paper, isLoading } = usePaper(paperId);

  const [sections, setSections] = useState<EditorSection[]>([]);
  const [items, setItems] = useState<EditorItem[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const nextSectionOrder = useMemo(() => (sections.length ? Math.max(...sections.map((s) => s.order_no)) + 1 : 1), [sections]);
  const nextItemOrder = useMemo(() => (items.length ? Math.max(...items.map((it) => it.order_no)) + 1 : 1), [items]);

  useEffect(() => {
    if (!paper) return;
    const mappedSections: EditorSection[] = paper.paper_sections.map((s) => ({ title: s.title, order_no: s.order_no }));
    const mappedItems: EditorItem[] = paper.paper_items.map((it) => ({
      order_no: it.order_no,
      section_order_no: (() => {
        const section = paper.paper_sections.find((s) => s.id === it.section_id);
        return section ? section.order_no : null;
      })(),
      question: {
        stem: it.questions?.stem ?? '',
        type: it.questions?.type ?? 'single',
        answer_json: it.questions?.answer_json ?? '',
        default_points: it.questions?.default_points ?? it.points_override ?? 0,
        is_subjective: it.questions?.is_subjective ?? 0,
      },
    }));
    setSections(mappedSections);
    setItems(mappedItems);
  }, [paper]);

  const handleSave = async () => {
    if (!paperId) return;
    if (!items.length) {
      toast.error('请至少添加 1 道题目');
      return;
    }
    try {
      const payload = {
        sections,
        items: items.map((it) => ({
          order_no: it.order_no,
          section_order_no: it.section_order_no,
          points_override: it.question.default_points,
          question: {
            stem: it.question.stem,
            type: it.question.type,
            answer_json: it.question.answer_json,
            default_points: it.question.default_points,
            is_subjective: it.question.type === 'subjective' ? 1 : 0,
          },
        })),
        rubric_points: [],
      };
      const saved = await papersApi.saveStructure(paperId, payload);
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('已保存');
      return saved.data as PaperDetail;
    } catch (e) {}
  };

  const handleAddSection = () => {
    setSections((prev) => [...prev, { title: `第${nextSectionOrder}部分`, order_no: nextSectionOrder }]);
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        order_no: nextItemOrder,
        section_order_no: sections.length ? sections[0].order_no : null,
        question: { stem: '', type: 'single', answer_json: '', default_points: 5, is_subjective: 0 },
      },
    ]);
  };

  const handleUpload = async () => {
    if (!paperId) return;
    if (!file) {
      toast.error('请选择文件');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiPost(`/api/papers/${paperId}/assets`, formData);
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      toast.success('已上传');
    } catch (e) {}
  };

  if (!paperId) return <div className="text-slate-500">无效试卷</div>;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        正在加载试卷...
      </div>
    );
  }

  if (!paper) return <div className="text-slate-500">试卷不存在或无权限</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/teacher/papers')}
          className="px-4 py-2 rounded-2xl text-sm font-medium bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50 flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回试卷库
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-500 text-white font-semibold shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center"
        >
          <Save className="w-4 h-4 mr-2" />
          保存结构
        </button>
      </div>

      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">试卷</div>
            <div className="text-xl font-bold text-slate-800 truncate">{paper.title}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddSection}
              className="px-4 py-2 rounded-2xl text-sm font-medium bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加分区
            </button>
            <button
              onClick={handleAddItem}
              className="px-4 py-2 rounded-2xl text-sm font-medium bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加题目
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3">
            <div className="text-sm font-bold text-slate-700">分区</div>
            {sections.length === 0 && <div className="text-sm text-slate-500">暂无分区（可选）</div>}
            {sections.map((s) => (
              <div key={s.order_no} className="flex items-center gap-2">
                <input
                  value={s.title}
                  onChange={(e) =>
                    setSections((prev) => prev.map((x) => (x.order_no === s.order_no ? { ...x, title: e.target.value } : x)))
                  }
                  className="flex-1 px-3 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
                />
                <button
                  onClick={() => setSections((prev) => prev.filter((x) => x.order_no !== s.order_no))}
                  className="p-2 rounded-2xl border border-slate-200 bg-white/60 text-slate-500 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="text-sm font-bold text-slate-700">题目</div>
            {items.map((it) => (
              <div key={it.order_no} className="bg-white/70 border border-white/60 rounded-3xl p-5">
                <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                  <div className="text-sm font-bold text-slate-800">第 {it.order_no} 题</div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={it.section_order_no ?? ''}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) => (x.order_no === it.order_no ? { ...x, section_order_no: e.target.value ? Number(e.target.value) : null } : x)),
                        )
                      }
                      className="px-3 py-2 rounded-2xl border border-slate-200 bg-white/60 text-sm"
                    >
                      <option value="">不分区</option>
                      {sections.map((s) => (
                        <option key={s.order_no} value={s.order_no}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                    <select
                      value={it.question.type}
                      onChange={(e) =>
                        setItems((prev) => prev.map((x) => (x.order_no === it.order_no ? { ...x, question: { ...x.question, type: e.target.value } } : x)))
                      }
                      className="px-3 py-2 rounded-2xl border border-slate-200 bg-white/60 text-sm"
                    >
                      <option value="single">单选</option>
                      <option value="multi">多选</option>
                      <option value="fill">填空</option>
                      <option value="subjective">主观</option>
                    </select>
                    <input
                      type="number"
                      value={it.question.default_points}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.order_no === it.order_no ? { ...x, question: { ...x.question, default_points: Number(e.target.value) } } : x,
                          ),
                        )
                      }
                      className="w-24 px-3 py-2 rounded-2xl border border-slate-200 bg-white/60 text-sm"
                    />
                    <button
                      onClick={() => setItems((prev) => prev.filter((x) => x.order_no !== it.order_no))}
                      className="px-3 py-2 rounded-2xl text-sm font-medium bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 flex items-center"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      删除
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  <textarea
                    value={it.question.stem}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x) => (x.order_no === it.order_no ? { ...x, question: { ...x.question, stem: e.target.value } } : x)))
                    }
                    placeholder="题干"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/60 outline-none min-h-[96px]"
                  />
                  <input
                    value={it.question.answer_json}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((x) => (x.order_no === it.order_no ? { ...x, question: { ...x.question, answer_json: e.target.value } } : x)),
                      )
                    }
                    placeholder="标准答案（建议填 JSON 字符串或普通文本）"
                    className="w-full px-4 py-2 rounded-2xl border border-slate-200 bg-white/60 outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div id="upload" className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <div className="text-lg font-bold text-slate-800 mb-4 flex items-center">
          <UploadCloud className="w-5 h-5 mr-2 text-indigo-500" />
          上传试卷文件（PDF/图片）
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="flex-1" />
          <button
            onClick={handleUpload}
            className="px-4 py-2 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 font-semibold flex items-center"
          >
            <UploadCloud className="w-4 h-4 mr-2" />
            上传
          </button>
        </div>
        {paper.paper_assets?.length ? (
          <div className="mt-4 space-y-2">
            {paper.paper_assets.map((a) => (
              <a
                key={a.id}
                href={a.storage_path}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-indigo-700 hover:underline"
              >
                {a.storage_path}
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-500">暂无上传文件</div>
        )}
      </div>
    </div>
  );
}
