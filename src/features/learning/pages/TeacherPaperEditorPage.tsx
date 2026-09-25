import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Trash2, UploadCloud } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { papersApi, type PaperDetail } from '@/features/learning/api/papersApi';
import { usePaper } from '@/features/learning/hooks/usePapers';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { SectionCard } from '@/components/ui/section-card';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

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

/**
 * 试卷编辑器.
 *
 * Every editor cell here is unlabelled by design - the row's own heading (`第 N 题`,
 * `分区`) is what tells a sighted user which field they are in - so the controls carry
 * `aria-label`s built from that heading rather than a new visible label. The two
 * loading and three empty blocks are `Spinner` and `EmptyState`. The file picker stays
 * a *visible* `Input type="file"` (`FileInput` is hidden by design, and hiding this one
 * would remove the only place the chosen filename is shown).
 */
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
      await papersApi.uploadAsset(paperId, formData);
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      toast.success('已上传');
    } catch (e) {}
  };

  // The editor's one save action, reachable from the command palette too.
  useRegisterPageCommands([
    {
      id: 'teacher-paper-editor:save',
      label: '保存结构',
      icon: Save,
      keywords: ['试卷', '保存', '结构'],
      run: () => void handleSave(),
    },
  ]);

  if (!paperId) {
    return (
      <PageScaffold variant="form">
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">无效试卷</div>
      </PageScaffold>
    );
  }

  if (isLoading) {
    return (
      <PageScaffold variant="form" className="flex items-center justify-center gap-3 py-20 text-fg-3">
        <Spinner label="正在加载试卷" />
        正在加载试卷...
      </PageScaffold>
    );
  }

  if (!paper) {
    return (
      <PageScaffold variant="form">
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">试卷不存在或无权限</div>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="form"
      title={paper.title}
      description="试卷"
      actions={
        <Button variant="outline" onClick={() => navigate('/teacher/papers')}>
          <ArrowLeft data-icon="inline-start" />
          返回试卷库
        </Button>
      }
      footer={
        <Button onClick={handleSave}>
          <Save data-icon="inline-start" />
          保存结构
        </Button>
      }
    >

      <Card>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={handleAddSection}>
              <Plus data-icon="inline-start" />
              添加分区
            </Button>
            <Button variant="outline" onClick={handleAddItem}>
              <Plus data-icon="inline-start" />
              添加题目
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-1">
              <div className="text-sm font-bold text-fg-2">分区</div>
              {sections.length === 0 && (
                <EmptyState title="暂无分区（可选）" className="min-h-0 p-6" />
              )}
              {sections.map((s) => (
                <div key={s.order_no} className="flex items-center gap-2">
                  <Input
                    aria-label={`第 ${s.order_no} 分区标题`}
                    value={s.title}
                    onChange={(e) =>
                      setSections((prev) => prev.map((x) => (x.order_no === s.order_no ? { ...x, title: e.target.value } : x)))
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`删除第 ${s.order_no} 分区`}
                    title="删除"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    onClick={() => setSections((prev) => prev.filter((x) => x.order_no !== s.order_no))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-4 lg:col-span-2">
              <div className="text-sm font-bold text-fg-2">题目</div>
              {items.map((it) => (
                <div key={it.order_no} className="rounded-panel border border-line-1 bg-surface-3/50 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm font-bold text-fg-1">第 {it.order_no} 题</div>
                    <div className="flex flex-wrap gap-2">
                      <Select
                        aria-label={`第 ${it.order_no} 题所属分区`}
                        wrapperClassName="w-32"
                        value={it.section_order_no ?? ''}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x) => (x.order_no === it.order_no ? { ...x, section_order_no: e.target.value ? Number(e.target.value) : null } : x)),
                          )
                        }
                      >
                        <option value="">不分区</option>
                        {sections.map((s) => (
                          <option key={s.order_no} value={s.order_no}>
                            {s.title}
                          </option>
                        ))}
                      </Select>
                      <Select
                        aria-label={`第 ${it.order_no} 题类型`}
                        wrapperClassName="w-28"
                        value={it.question.type}
                        onChange={(e) =>
                          setItems((prev) => prev.map((x) => (x.order_no === it.order_no ? { ...x, question: { ...x.question, type: e.target.value } } : x)))
                        }
                      >
                        <option value="single">单选</option>
                        <option value="multi">多选</option>
                        <option value="fill">填空</option>
                        <option value="subjective">主观</option>
                      </Select>
                      <Input
                        type="number"
                        aria-label={`第 ${it.order_no} 题分值`}
                        className="w-24"
                        value={it.question.default_points}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x) =>
                              x.order_no === it.order_no ? { ...x, question: { ...x.question, default_points: Number(e.target.value) } } : x,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setItems((prev) => prev.filter((x) => x.order_no !== it.order_no))}
                      >
                        <Trash2 data-icon="inline-start" />
                        删除
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    <Textarea
                      aria-label={`第 ${it.order_no} 题题干`}
                      className="min-h-[96px]"
                      value={it.question.stem}
                      onChange={(e) =>
                        setItems((prev) => prev.map((x) => (x.order_no === it.order_no ? { ...x, question: { ...x.question, stem: e.target.value } } : x)))
                      }
                      placeholder="题干"
                    />
                    <Input
                      aria-label={`第 ${it.order_no} 题标准答案`}
                      value={it.question.answer_json}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) => (x.order_no === it.order_no ? { ...x, question: { ...x.question, answer_json: e.target.value } } : x)),
                        )
                      }
                      placeholder="标准答案（建议填 JSON 字符串或普通文本）"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div id="upload">
        <SectionCard title="上传试卷文件（PDF/图片）">
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Input
              type="file"
              aria-label="选择要上传的试卷文件"
              className="flex-1"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button onClick={handleUpload}>
              <UploadCloud data-icon="inline-start" />
              上传
            </Button>
          </div>
          {paper.paper_assets?.length ? (
            <div className="mt-4 space-y-2">
              {paper.paper_assets.map((a) => (
                <a
                  key={a.id}
                  href={a.storage_path}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-role hover:underline"
                >
                  {a.storage_path}
                </a>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无上传文件" className="mt-4 min-h-0 p-6" />
          )}
        </SectionCard>
      </div>
    </PageScaffold>
  );
}
