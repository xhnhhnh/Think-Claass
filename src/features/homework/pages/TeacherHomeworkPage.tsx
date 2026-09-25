import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ClipboardList, FileText, Pencil, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useRegisterPageCommands } from '@/app/commands/registry';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Progress } from '@/components/ui/progress';
import { SectionCard } from '@/components/ui/section-card';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { Textarea } from '@/components/ui/textarea';
import { useStore } from '@/store/useStore';
import type {
  HomeworkListEntry,
  HomeworkQuestion,
  HomeworkQuestionPayload,
  HomeworkStatus,
} from '@thinkclass/contracts/domains/homework';

import { useClasses } from '@/hooks/queries/useClasses';
import { AiQuestionPanel } from '../components/AiQuestionPanel';
import { QuestionEditor } from '../components/QuestionEditor';
import {
  useDeleteHomeworkMutation,
  useHomeworkDetail,
  useHomeworkList,
  useHomeworkSubmissionCounts,
  usePublishHomeworkMutation,
  useUpdateHomeworkMutation,
} from '../hooks/useHomework';

const STATUS_LABEL: Record<HomeworkStatus, string> = {
  draft: '草稿',
  published: '已发布',
  closed: '已截止',
};

const STATUS_VARIANT: Record<HomeworkStatus, 'success' | 'secondary' | 'warning'> = {
  draft: 'secondary',
  published: 'success',
  closed: 'warning',
};

/** The dialog's own state: everything a publish or an edit can change. */
interface HomeworkFormState {
  class_id: number | null;
  title: string;
  description: string;
  due_at: string;
  status: HomeworkStatus;
  reward_points: number;
  questions: HomeworkQuestionPayload[];
}

function blankForm(classId: number | null): HomeworkFormState {
  return {
    class_id: classId,
    title: '',
    description: '',
    due_at: '',
    status: 'published',
    reward_points: 0,
    questions: [],
  };
}

/** `2026-03-01T23:59:00.000Z` -> `2026-03-01T23:59` in the browser's own zone, for `<input type="datetime-local">`. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The inverse: the local wall-clock the teacher picked, as the ISO string the column stores. */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toQuestionPayload(question: HomeworkQuestion): HomeworkQuestionPayload {
  return {
    id: question.id,
    type: question.type,
    stem: question.stem,
    options: question.options ?? [],
    reference: question.reference ?? {},
    explanation: question.explanation,
    points: question.points,
  };
}

/**
 * What is wrong with the form, or null when it is sendable.
 *
 * Checked here rather than only on the server because a teacher publishing twenty questions
 * should be told which one is missing its answer before the request, not after it. An empty
 * question list is *allowed*: a homework can be "photograph your paper", which is a real
 * assignment this product supports.
 */
function validateForm(form: HomeworkFormState): string | null {
  if (!form.class_id) return '请选择班级';
  if (!form.title.trim()) return '请填写作业标题';

  for (const [index, question] of form.questions.entries()) {
    if (!question.stem.trim()) return `第 ${index + 1} 题还没有题干`;
    if (question.type === 'single' || question.type === 'multiple') {
      const options = (question.options ?? []).filter((option) => option.text.trim());
      if (options.length < 2) return `第 ${index + 1} 题至少需要两个有内容的选项`;
      if ((question.reference?.choice ?? []).length === 0) return `第 ${index + 1} 题还没有设置参考答案`;
    }
    if (question.type === 'blank' && (question.reference?.accept ?? []).length === 0) {
      return `第 ${index + 1} 题还没有填写参考答案`;
    }
  }
  return null;
}

/**
 * 作业管理.
 *
 * The teacher's list, and the one dialog that publishes or edits a homework. Both the publish
 * and the edit path go through `QuestionEditor`, so a homework written in one is editable in the
 * other without a translation step - the form holds the contract's own
 * `HomeworkQuestionPayload[]`.
 *
 * ## The legacy bridge is a first-class state here
 *
 * `GET /api/homework` unions in rows read out of the deprecated `assignments` table so a
 * deployment does not lose sight of pre-migration work. Those rows carry `legacy: true`: they
 * have no questions, `PUT`/`DELETE` answer 404 and they cannot be graded. So the row renders its
 * data with a 「迁移前的旧作业（只读）」 badge and **no** edit/grade/delete controls, rather than
 * offering three buttons that fail.
 *
 * Counts come from `useHomeworkSubmissionCounts`: one query over the whole list, each request
 * being the same grade sheet the grading page reads (the backend expands the class roll itself,
 * which is why 应交 needs no roster here).
 */
export default function TeacherHomework() {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const { data: classes = [] } = useClasses();
  const { data: entries = [], isLoading } = useHomeworkList();

  const homeworkIds = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const { data: counts = {} } = useHomeworkSubmissionCounts(homeworkIds);

  const publishHomework = usePublishHomeworkMutation();
  const updateHomework = useUpdateHomeworkMutation();
  const deleteHomework = useDeleteHomeworkMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HomeworkFormState>(() => blankForm(null));
  const [pendingDelete, setPendingDelete] = useState<HomeworkListEntry | null>(null);

  const editingDetail = useHomeworkDetail(editingId);
  /** The row the form was seeded from, so a background refetch cannot overwrite live edits. */
  const seededFrom = useRef<number | null>(null);

  const defaultClassId = user?.class_id ?? classes[0]?.id ?? null;

  useEffect(() => {
    if (!dialogOpen || editingId === null) return;
    const detail = editingDetail.data;
    if (!detail || seededFrom.current === editingId) return;
    seededFrom.current = editingId;
    setForm({
      class_id: detail.class_id,
      title: detail.title,
      description: detail.description ?? '',
      due_at: isoToLocalInput(detail.due_at),
      status: detail.status,
      reward_points: detail.reward_points,
      questions: detail.questions.map(toQuestionPayload),
    });
  }, [dialogOpen, editingId, editingDetail.data]);

  const openCreate = () => {
    seededFrom.current = null;
    setEditingId(null);
    setForm(blankForm(defaultClassId));
    setDialogOpen(true);
  };

  const openEdit = (entry: HomeworkListEntry) => {
    if (entry.legacy) {
      toast.info('迁移前的旧作业是只读的');
      return;
    }
    seededFrom.current = null;
    setForm(blankForm(entry.class_id));
    setEditingId(entry.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const problem = validateForm(form);
    if (problem) {
      toast.error(problem);
      return;
    }

    const description = form.description.trim() || null;
    const dueAt = localInputToIso(form.due_at);

    try {
      if (editingId === null) {
        await publishHomework.mutateAsync({
          class_id: form.class_id as number,
          title: form.title.trim(),
          description,
          due_at: dueAt,
          status: form.status,
          reward_points: form.reward_points,
          questions: form.questions,
        });
        toast.success('作业已发布');
      } else {
        await updateHomework.mutateAsync({
          id: editingId,
          payload: {
            title: form.title.trim(),
            description,
            due_at: dueAt,
            status: form.status,
            reward_points: form.reward_points,
            questions: form.questions,
          },
        });
        toast.success('作业已更新');
      }
      setDialogOpen(false);
      setEditingId(null);
    } catch {
      // The api layer already surfaced the failure; the dialog stays open with the draft intact.
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteHomework.mutateAsync(pendingDelete.id);
      toast.success('作业已删除');
      setPendingDelete(null);
    } catch {
      // Already reported by the api layer.
    }
  };

  useRegisterPageCommands([
    {
      id: 'teacher-homework:create',
      label: '发布作业',
      icon: PlusCircle,
      keywords: ['作业', '发布', '新建'],
      run: () => openCreate(),
    },
  ]);

  const saving = publishHomework.isPending || updateHomework.isPending;
  const legacyCount = entries.filter((entry) => entry.legacy).length;

  return (
    <PageScaffold
      variant="list"
      title="作业管理"
      description="发布作业、查看提交进度、进入批改"
      actions={
        <Button onClick={openCreate}>
          <PlusCircle data-icon="inline-start" aria-hidden="true" />
          发布作业
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={FileText} label="作业总数" value={entries.length} />
        <StatCard
          icon={ClipboardList}
          label="待批改"
          tone="warning"
          value={entries.reduce((sum, entry) => {
            const row = counts[entry.id];
            return sum + (row ? Math.max(row.submitted - row.graded, 0) : 0);
          }, 0)}
        />
        <StatCard icon={CalendarClock} label="迁移前旧作业" tone="info" value={legacyCount} hint="只读，等待数据迁移" />
      </div>

      <SectionCard title="我的作业" description="按发布时间排列">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-10 text-fg-3">
            <Spinner label="正在加载作业" />
            正在加载作业...
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="还没有作业"
            description="发布第一份作业，学生就能在「我的作业」里看到。"
            action={
              <Button onClick={openCreate}>
                <PlusCircle data-icon="inline-start" aria-hidden="true" />
                发布作业
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => {
              const row = counts[entry.id];
              const percent = row && row.total > 0 ? Math.round((row.submitted / row.total) * 100) : 0;

              return (
                <li
                  key={entry.id}
                  className="flex flex-col gap-3 rounded-card border border-line-1 bg-surface-2 p-4 shadow-card lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold text-fg-1">{entry.title}</span>
                      <Badge variant={STATUS_VARIANT[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
                      {entry.legacy ? <Badge variant="outline">迁移前的旧作业（只读）</Badge> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">
                      <span>截止：{entry.due_at ? isoToLocalInput(entry.due_at).replace('T', ' ') : '不限'}</span>
                      <span>题目：{entry.question_count} 题</span>
                      <span>总分：{entry.total_points}</span>
                      <span>班级 #{entry.class_id}</span>
                    </div>
                    {entry.legacy ? (
                      <p className="text-xs text-fg-3">这条记录来自旧的作业表，没有题目，不能编辑或批改。</p>
                    ) : (
                      <div className="max-w-sm space-y-1">
                        <div className="flex items-center justify-between text-xs text-fg-2">
                          <span>
                            已提交 {row?.submitted ?? 0} / 应交 {row?.total ?? 0}
                          </span>
                          <span>{percent}%</span>
                        </div>
                        <Progress
                          value={percent}
                          label={`${entry.title} 的提交进度`}
                          tone={percent >= 100 ? 'success' : percent > 0 ? 'info' : 'warning'}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:shrink-0">
                    {entry.legacy ? (
                      <span className="text-xs text-fg-3">只读</span>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/teacher/homework/${entry.id}/grade`)}
                        >
                          <ClipboardList data-icon="inline-start" aria-hidden="true" />
                          去批改
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(entry)}>
                          <Pencil data-icon="inline-start" aria-hidden="true" />
                          编辑
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`删除${entry.title}`}
                          className="text-danger hover:bg-danger-soft hover:text-danger-ink"
                          onClick={() => setPendingDelete(entry)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingId === null ? '发布作业' : '编辑作业'}</DialogTitle>
            <DialogDescription>
              可以只布置拍照提交，也可以逐题设置答案与分值。学生提交后，老师在这里批改。
            </DialogDescription>
          </DialogHeader>

          {editingId !== null && editingDetail.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-3">
              <Spinner size="sm" label="正在加载作业" />
              正在加载作业...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="作业标题" required>
                  <Input
                    value={form.title}
                    placeholder="例如：第三章 分数运算练习"
                    onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </FormField>
                <FormField label="班级" required>
                  <Select
                    value={form.class_id ?? ''}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, class_id: event.target.value ? Number(event.target.value) : null }))
                    }
                  >
                    <option value="">请选择班级</option>
                    {classes.length > 0 ? (
                      classes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))
                    ) : defaultClassId ? (
                      <option value={defaultClassId}>班级 #{defaultClassId}</option>
                    ) : null}
                  </Select>
                </FormField>
                <FormField label="截止时间" hint="留空表示不限时间">
                  <Input
                    type="datetime-local"
                    value={form.due_at}
                    onChange={(event) => setForm((prev) => ({ ...prev, due_at: event.target.value }))}
                  />
                </FormField>
                <FormField label="状态" hint="草稿对学生不可见">
                  <Select
                    value={form.status}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, status: event.target.value as HomeworkStatus }))
                    }
                  >
                    <option value="published">已发布</option>
                    <option value="draft">草稿</option>
                    <option value="closed">已截止</option>
                  </Select>
                </FormField>
              </div>

              <FormField label="作业说明">
                <Textarea
                  rows={3}
                  value={form.description}
                  placeholder="写清楚要求，例如「拍照上传整张试卷」"
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </FormField>

              <FormField label="奖励积分" hint="完成作业后发给学生的积分">
                <Input
                  type="number"
                  min={0}
                  value={form.reward_points}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, reward_points: Number(event.target.value) || 0 }))
                  }
                />
              </FormField>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-fg-1">题目</h3>
                <AiQuestionPanel
                  questions={form.questions}
                  contextTitle={form.title}
                  onInsert={(added) =>
                    // Appended, not prepended: a generation is usually run once on an empty paper, and
                    // when it is run again the teacher is adding to what is already there.
                    setForm((prev) => ({ ...prev, questions: [...prev.questions, ...added] }))
                  }
                />
                <QuestionEditor
                  questions={form.questions}
                  onChange={(questions) => setForm((prev) => ({ ...prev, questions }))}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Spinner size="sm" label="正在保存" /> : null}
              {editingId === null ? '确认发布' : '保存修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        destructive
        title="删除这份作业？"
        description={`「${pendingDelete?.title ?? ''}」以及它的题目、提交和批改记录都会被删除，无法恢复。`}
        confirmLabel="删除"
        pendingLabel="删除中..."
        isPending={deleteHomework.isPending}
        onConfirm={handleDelete}
      />
    </PageScaffold>
  );
}
