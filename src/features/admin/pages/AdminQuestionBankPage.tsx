import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';

import { adminClient, type QuestionBankItem } from '@/features/admin/api/adminClient';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/**
 * 题库管理 - the challenge's question source.
 *
 * `plugins/challenge` draws every question from `question_bank` (`challenge.repository.ts`), and the
 * only routes that write that table are these four, gated on `requireAdmin` in `plugins/system`.
 * Nothing called them: there was no page, on any of the four consoles. So on a fresh install the
 * 挑战模式 page and the world boss had nothing to ask - 「暂无题目数据」 - and the class feature they
 * belong to could be switched on with no effect.
 *
 * The three types are the ones the student page renders (`StudentChallengePage`): SINGLE and
 * MULTIPLE answer with the option *text* the pupil tapped, JUDGE with 「正确」 or 「错误」, and
 * comparison is `isAnswerCorrect`'s normalised string/array equality. So:
 *
 *   - `options` is a JSON array of the option texts (`["4","7"]`);
 *   - `answer` is the exact option text for SINGLE, a JSON array for MULTIPLE (`["2","4"]`), and
 *     「正确」/「错误」 for JUDGE - which is why the form builds them instead of asking the operator to
 *     type JSON.
 */

type QuestionType = 'SINGLE' | 'MULTIPLE' | 'JUDGE';

const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE: '单选题',
  MULTIPLE: '多选题',
  JUDGE: '判断题',
};

interface FormState {
  id: number | null;
  title: string;
  type: QuestionType;
  /** One option per line, as typed. */
  optionLines: string;
  singleAnswer: string;
  multipleAnswers: string[];
  judgeAnswer: '正确' | '错误';
  explanation: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  type: 'SINGLE',
  optionLines: '',
  singleAnswer: '',
  multipleAnswers: [],
  judgeAnswer: '正确',
  explanation: '',
};

function optionList(optionLines: string): string[] {
  return optionLines
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** The stored `options`/`answer` for a form, or a sentence naming what is missing. */
function toPayload(form: FormState): { options: string | null; answer: string } | string {
  if (!form.title.trim()) return '请填写题干';

  if (form.type === 'JUDGE') {
    return { options: null, answer: form.judgeAnswer };
  }

  const options = optionList(form.optionLines);
  if (options.length < 2) return '单选/多选题至少需要两个选项（每行一个）';

  if (form.type === 'SINGLE') {
    if (!form.singleAnswer) return '请选择参考答案';
    if (!options.includes(form.singleAnswer)) return '参考答案必须是给出的选项之一';
    return { options: JSON.stringify(options), answer: form.singleAnswer };
  }

  const selected = form.multipleAnswers.filter((option) => options.includes(option));
  if (selected.length === 0) return '请至少勾选一个正确答案';
  return { options: JSON.stringify(options), answer: JSON.stringify(selected) };
}

/** A stored row, back into the form's shape. */
function toForm(item: QuestionBankItem): FormState {
  let options: string[] = [];
  try {
    const parsed = item.options ? JSON.parse(item.options) : [];
    options = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    options = [];
  }

  const type = (['SINGLE', 'MULTIPLE', 'JUDGE'] as QuestionType[]).includes(item.type as QuestionType)
    ? (item.type as QuestionType)
    : 'SINGLE';

  let answer: unknown = item.answer;
  try {
    answer = item.answer ? JSON.parse(item.answer) : item.answer;
  } catch {
    answer = item.answer;
  }

  return {
    id: item.id,
    title: item.title,
    type,
    optionLines: options.join('\n'),
    singleAnswer: type === 'SINGLE' && typeof answer === 'string' ? answer : '',
    multipleAnswers: type === 'MULTIPLE' && Array.isArray(answer) ? answer.map(String) : [],
    judgeAnswer: answer === '错误' ? '错误' : '正确',
    explanation: item.explanation ?? '',
  };
}

/** What one row's answer looks like on screen. */
function answerText(item: QuestionBankItem): string {
  if (item.type === 'JUDGE') return item.answer;
  try {
    const parsed = JSON.parse(item.answer);
    return Array.isArray(parsed) ? parsed.join('、') : String(parsed);
  } catch {
    return item.answer;
  }
}

export default function AdminQuestionBankPage() {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] = useState<QuestionBankItem | null>(null);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      setQuestions(await adminClient.getQuestionBank());
      setLoadError(false);
    } catch {
      // A failed read is not "the bank is empty": saying so would make an outage look like content
      // that was never created, and the operator's next move would be to re-enter everything.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchQuestions();
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (item: QuestionBankItem) => {
    setForm(toForm(item));
    setShowForm(true);
  };

  const handleSubmit = async () => {
    const payload = toPayload(form);
    if (typeof payload === 'string') {
      toast.error(payload);
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        type: form.type,
        options: payload.options,
        answer: payload.answer,
        explanation: form.explanation.trim() || null,
      };
      if (form.id === null) {
        await adminClient.createQuestionBankItem(body);
        toast.success('题目已加入题库');
      } else {
        await adminClient.updateQuestionBankItem(form.id, body);
        toast.success('题目已更新');
      }
      setShowForm(false);
      await fetchQuestions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    try {
      await adminClient.deleteQuestionBankItem(target.id);
      toast.success('题目已删除');
      await fetchQuestions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败，请重试');
    }
  };

  useRegisterPageCommands([
    {
      id: 'admin-question-bank:create',
      label: '新增题目',
      icon: Plus,
      keywords: ['题库', '题目', '挑战'],
      run: () => openCreate(),
    },
  ]);

  const columns = useMemo<Array<DataTableColumn<QuestionBankItem>>>(
    () => [
      {
        key: 'title',
        header: '题干',
        render: (row) => <span className="font-medium text-fg-1">{row.title}</span>,
      },
      {
        key: 'type',
        header: '类型',
        render: (row) => <Badge variant="secondary">{TYPE_LABEL[row.type as QuestionType] ?? row.type}</Badge>,
      },
      { key: 'answer', header: '参考答案', render: (row) => <span className="text-fg-2">{answerText(row)}</span> },
      {
        key: 'explanation',
        header: '解析',
        render: (row) => <span className="text-fg-3">{row.explanation || '—'}</span>,
      },
      {
        key: 'actions',
        header: '操作',
        align: 'right',
        render: (row) => (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="icon-sm" aria-label={`编辑 ${row.title}`} onClick={() => openEdit(row)}>
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`删除 ${row.title}`}
              className="text-danger hover:bg-danger/10 hover:text-danger"
              onClick={() => setPendingDelete(row)}
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const options = optionList(form.optionLines);

  return (
    <PageScaffold
      variant="list"
      title="题库管理"
      description="挑战模式与世界BOSS的题目来自这里；没有题目时学生页会显示「暂无题目」。"
      actions={
        <Button onClick={openCreate}>
          <Plus data-icon="inline-start" />
          新增题目
        </Button>
      }
    >
      {loadError ? (
        <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center">
          <p className="font-semibold text-danger">题库加载失败</p>
          <p className="mt-1 text-sm text-fg-3">这不代表题库为空，请重试后再判断。</p>
          <Button variant="outline" className="mt-3" onClick={() => void fetchQuestions()}>
            重新加载
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={questions}
          getRowKey={(row) => row.id}
          isLoading={loading}
          empty={
            <EmptyState
              icon={BookOpen}
              title="题库还是空的"
              description="没有题目时，学生打开挑战模式会看到「暂无题目数据」。点右上角「新增题目」开始。"
            />
          }
        />
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id === null ? '新增题目' : '编辑题目'}</DialogTitle>
            <DialogDescription>题干、选项和参考答案都会直接出现在学生的挑战页上。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="题干" required>
              <Textarea
                rows={2}
                className="resize-none"
                aria-label="题干"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="例如：下面哪一个是偶数？"
              />
            </FormField>

            <FormField label="题型">
              <Select
                aria-label="题型"
                value={form.type}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value as QuestionType, singleAnswer: '', multipleAnswers: [] })
                }
              >
                <option value="SINGLE">单选题</option>
                <option value="MULTIPLE">多选题</option>
                <option value="JUDGE">判断题</option>
              </Select>
            </FormField>

            {form.type === 'JUDGE' ? (
              <FormField label="参考答案">
                <Select
                  aria-label="参考答案"
                  value={form.judgeAnswer}
                  onChange={(event) => setForm({ ...form, judgeAnswer: event.target.value as '正确' | '错误' })}
                >
                  <option value="正确">正确</option>
                  <option value="错误">错误</option>
                </Select>
              </FormField>
            ) : (
              <>
                <FormField label="选项" hint="每行一个，按学生看到的顺序排列（不需要写 A/B/C）。">
                  <Textarea
                    rows={4}
                    className="resize-none"
                    aria-label="选项"
                    value={form.optionLines}
                    onChange={(event) =>
                      setForm({ ...form, optionLines: event.target.value, singleAnswer: '', multipleAnswers: [] })
                    }
                    placeholder={'4\n7\n8\n9'}
                  />
                </FormField>

                {form.type === 'SINGLE' ? (
                  <FormField label="参考答案">
                    <Select
                      aria-label="参考答案"
                      value={form.singleAnswer}
                      onChange={(event) => setForm({ ...form, singleAnswer: event.target.value })}
                    >
                      <option value="">请选择</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                ) : (
                  <FormField label="参考答案" hint="勾选所有正确选项；学生选中的集合要与之完全一致。">
                    <div className="mt-1 space-y-2">
                      {options.length === 0 ? (
                        <p className="text-sm text-fg-3">先填写选项。</p>
                      ) : (
                        options.map((option) => (
                          <div key={option} className="flex items-center gap-2 text-sm text-fg-2">
                            <Checkbox
                              id={`answer-${option}`}
                              aria-label={option}
                              checked={form.multipleAnswers.includes(option)}
                              onCheckedChange={(checked) =>
                                setForm({
                                  ...form,
                                  multipleAnswers: checked
                                    ? [...form.multipleAnswers, option]
                                    : form.multipleAnswers.filter((entry) => entry !== option),
                                })
                              }
                            />
                            <label htmlFor={`answer-${option}`}>{option}</label>
                          </div>
                        ))
                      )}
                    </div>
                  </FormField>
                )}
              </>
            )}

            <FormField label="解析" hint="可选，答完之后展示。">
              <Textarea
                rows={2}
                className="resize-none"
                aria-label="解析"
                value={form.explanation}
                onChange={(event) => setForm({ ...form, explanation: event.target.value })}
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? '保存中...' : form.id === null ? '加入题库' : '保存修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`删除「${pendingDelete?.title ?? ''}」？`}
        description="学生将不再抽到这道题；已经产生的答题记录不受影响。"
        confirmLabel="删除"
        destructive
        onConfirm={() => void handleDelete()}
      />
    </PageScaffold>
  );
}
