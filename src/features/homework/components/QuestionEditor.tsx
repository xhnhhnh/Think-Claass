import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  HomeworkOption,
  HomeworkQuestionPayload,
  HomeworkQuestionType,
} from '@thinkclass/contracts/domains/homework';

/** The four types, in the order the editor offers them. */
export const QUESTION_TYPE_OPTIONS: Array<{ value: HomeworkQuestionType; label: string }> = [
  { value: 'single', label: '单选' },
  { value: 'multiple', label: '多选' },
  { value: 'blank', label: '填空' },
  { value: 'short', label: '简答' },
];

export const QUESTION_TYPE_LABEL: Record<HomeworkQuestionType, string> = {
  single: '单选',
  multiple: '多选',
  blank: '填空',
  short: '简答',
};

/** A choice question needs at least this many options before removing one is allowed. */
const MIN_OPTIONS = 2;

/**
 * A fresh option id.
 *
 * Derived from the ids already in the question so two options never collide inside one
 * question, and so the id a student's answer refers to is stable across an edit - which is the
 * whole point of the id being a string rather than the index. Not random: an editor that
 * generates a new id on every render would silently invalidate saved answers.
 */
function nextOptionId(options: HomeworkOption[]): string {
  let n = options.length + 1;
  const taken = new Set(options.map((option) => option.id));
  while (taken.has(`o${n}`)) n += 1;
  return `o${n}`;
}

/** The two options a new choice question starts with, so it is answerable immediately. */
function defaultOptions(): HomeworkOption[] {
  return [
    { id: 'o1', text: '' },
    { id: 'o2', text: '' },
  ];
}

/** A blank question, for the 添加题目 button. */
export function emptyQuestion(): HomeworkQuestionPayload {
  return { type: 'single', stem: '', options: defaultOptions(), reference: { choice: [] }, points: 5, explanation: null };
}

/** 参考答案 stored for a `blank` question, as the composer asks for it: one string. */
export function formatAcceptList(accept: string[] | undefined): string {
  return (accept ?? []).join('、');
}

/** `、`, `,` and `，` all separate accepted answers; empty entries are dropped. */
export function parseAcceptList(text: string): string[] {
  return text
    .split(/[、,，]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * 题目编辑器.
 *
 * A controlled, array-shaped editor: the page owns the question array and this renders it, so
 * the publish dialog and the edit dialog share one component and one state shape (the contract's
 * own `HomeworkQuestionPayload[]`). Nothing is mirrored locally - a local copy of the list is
 * what makes an editor lose an edit when the user moves a question and then saves.
 *
 * The controls are the kit's throughout: `Select` for the type, `Input`/`Textarea` for the text,
 * `Checkbox` for the correct answers of a multi-select, `Button` for every action.
 */
export interface QuestionEditorProps {
  questions: HomeworkQuestionPayload[];
  onChange: (questions: HomeworkQuestionPayload[]) => void;
  /** A `legacy: true` homework is read-only: the backend 404s a write to it. */
  disabled?: boolean;
  className?: string;
}

export function QuestionEditor({ questions, onChange, disabled = false, className }: QuestionEditorProps) {
  const replace = (index: number, patch: Partial<HomeworkQuestionPayload>) => {
    onChange(questions.map((question, i) => (i === index ? { ...question, ...patch } : question)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(questions.filter((_question, i) => i !== index));
  };

  /**
   * Switching type keeps only the answers that type reads.
   *
   * A `single` question's `accept` list is meaningless and a `short` question's `choice` list is
   * worse than meaningless - the grader would find options that no longer exist. The stem,
   * points and explanation survive, which is what a teacher expects when they change their mind
   * about the format midway through writing.
   */
  const changeType = (index: number, type: HomeworkQuestionType) => {
    const question = questions[index];
    if (type === 'single' || type === 'multiple') {
      const options = question.options?.length ? question.options : defaultOptions();
      const choice = (question.reference?.choice ?? []).filter((id) => options.some((option) => option.id === id));
      replace(index, {
        type,
        options,
        reference: { choice: type === 'single' ? choice.slice(0, 1) : choice },
      });
      return;
    }
    if (type === 'blank') {
      replace(index, { type, options: [], reference: { accept: question.reference?.accept ?? [] } });
      return;
    }
    replace(index, { type, options: [], reference: { text: question.reference?.text ?? '' } });
  };

  const setOptionText = (index: number, optionId: string, text: string) => {
    const question = questions[index];
    replace(index, {
      options: (question.options ?? []).map((option) => (option.id === optionId ? { ...option, text } : option)),
    });
  };

  const addOption = (index: number) => {
    const question = questions[index];
    const options: HomeworkOption[] = question.options ?? [];
    replace(index, { options: [...options, { id: nextOptionId(options), text: '' }] });
  };

  const removeOption = (index: number, optionId: string) => {
    const question = questions[index];
    const options = (question.options ?? []).filter((option) => option.id !== optionId);
    replace(index, {
      options,
      reference: { ...question.reference, choice: (question.reference?.choice ?? []).filter((id) => id !== optionId) },
    });
  };

  const toggleChoice = (index: number, optionId: string, checked: boolean) => {
    const question = questions[index];
    const current: string[] = question.reference?.choice ?? [];
    const choice =
      question.type === 'single'
        ? checked
          ? [optionId]
          : []
        : checked
          ? [...current.filter((id) => id !== optionId), optionId]
          : current.filter((id) => id !== optionId);
    replace(index, { reference: { ...question.reference, choice } });
  };

  return (
    <div data-slot="question-editor" className={cn('space-y-4', className)}>
      {questions.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-1 bg-surface-2 px-4 py-6 text-center text-sm text-fg-3">
          还没有题目。可以直接布置一份以拍照提交为主的作业，也可以先添加题目。
        </p>
      ) : null}

      {questions.map((question, index) => {
        const isChoice = question.type === 'single' || question.type === 'multiple';
        const options: HomeworkOption[] = question.options ?? [];
        const choice: string[] = question.reference?.choice ?? [];

        return (
          <div
            key={`question-${index}`}
            data-slot="question-editor-row"
            className="space-y-3 rounded-card border border-line-1 bg-surface-3/40 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-fg-1">
                <GripVertical aria-hidden="true" className="size-4 text-fg-3" />
                第 {index + 1} 题
                <Badge variant="secondary">{QUESTION_TYPE_LABEL[question.type]}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`上移第 ${index + 1} 题`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`下移第 ${index + 1} 题`}
                  disabled={disabled || index === questions.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除第 ${index + 1} 题`}
                  className="text-danger hover:bg-danger-soft hover:text-danger-ink"
                  disabled={disabled}
                  onClick={() => remove(index)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <FormField label="题型">
                <Select
                  value={question.type}
                  disabled={disabled}
                  onChange={(event) => changeType(index, event.target.value as HomeworkQuestionType)}
                >
                  {QUESTION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="分值">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={question.points}
                  disabled={disabled}
                  onChange={(event) => replace(index, { points: Number(event.target.value) || 0 })}
                />
              </FormField>
            </div>

            <FormField label="题干" required>
              <Textarea
                rows={2}
                value={question.stem}
                disabled={disabled}
                placeholder="输入题目内容"
                onChange={(event) => replace(index, { stem: event.target.value })}
              />
            </FormField>

            {isChoice ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-fg-2">选项（勾选的为参考答案）</div>
                {options.map((option) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <Checkbox
                      aria-label={`把选项 ${option.id} 设为参考答案`}
                      checked={choice.includes(option.id)}
                      disabled={disabled}
                      onCheckedChange={(checked) => toggleChoice(index, option.id, checked === true)}
                    />
                    <Input
                      value={option.text}
                      disabled={disabled}
                      placeholder={`选项 ${option.id}`}
                      aria-label={`选项 ${option.id} 内容`}
                      onChange={(event) => setOptionText(index, option.id, event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除选项 ${option.id}`}
                      disabled={disabled || options.length <= MIN_OPTIONS}
                      onClick={() => removeOption(index, option.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => addOption(index)}>
                  <Plus data-icon="inline-start" />
                  添加选项
                </Button>
              </div>
            ) : null}

            {question.type === 'blank' ? (
              <FormField label="参考答案" hint="多个可接受的写法用「、」或「,」分隔">
                <Input
                  value={formatAcceptList(question.reference?.accept)}
                  disabled={disabled}
                  placeholder="例如：光合作用、光合"
                  onChange={(event) =>
                    replace(index, { reference: { accept: parseAcceptList(event.target.value) } })
                  }
                />
              </FormField>
            ) : null}

            {question.type === 'short' ? (
              <FormField label="参考答案 / 评分要点" hint="简答题由老师或 AI 对照这段要点评分">
                <Textarea
                  rows={3}
                  value={question.reference?.text ?? ''}
                  disabled={disabled}
                  placeholder="写出答案要点，用分号分隔每条要点"
                  onChange={(event) => replace(index, { reference: { text: event.target.value } })}
                />
              </FormField>
            ) : null}

            <FormField label="解析" hint="提交后可以展示给学生">
              <Textarea
                rows={2}
                value={question.explanation ?? ''}
                disabled={disabled}
                placeholder="可选"
                onChange={(event) => replace(index, { explanation: event.target.value || null })}
              />
            </FormField>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange([...questions, emptyQuestion()])}
      >
        <Plus data-icon="inline-start" />
        添加题目
      </Button>
    </div>
  );
}

export default QuestionEditor;
