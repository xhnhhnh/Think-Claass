import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { HomeworkAnswerValue, HomeworkQuestion } from '@thinkclass/contracts/domains/homework';

import { QUESTION_TYPE_LABEL } from './QuestionEditor';

/** The text of one option id, or the id itself when it no longer exists. */
export function optionText(question: HomeworkQuestion, optionId: string): string {
  return question.options.find((option) => option.id === optionId)?.text || optionId;
}

/**
 * A student's answer as one readable line, for the places that must not render a control.
 *
 * The teacher's grade sheet and the result page both need "what did they write" in a sentence,
 * and neither wants a disabled `<select>` standing in for a word. Empty answers say so, rather
 * than being an empty string that reads as a rendering bug.
 */
export function summariseAnswer(question: HomeworkQuestion, value: HomeworkAnswerValue | undefined): string {
  if (!value) return '（未作答）';

  if (question.type === 'single' || question.type === 'multiple') {
    const chosen: string[] = value.choice ?? [];
    if (chosen.length === 0) return '（未作答）';
    return chosen.map((id) => optionText(question, id)).join('、');
  }

  const text = (value.text ?? '').trim();
  return text || '（未作答）';
}

/**
 * 题目作答 / 题目展示.
 *
 * One component for both consoles: the student fills the controls in, and the teacher's grading
 * panel renders the same component `disabled` so what is being marked is the question the
 * student actually saw, options and all.
 *
 * The type decides the control, and the control is always the kit's:
 * `single` is a one-of-N `Select` (a checkbox list for a one-answer question would be a lie
 * about the interaction), `multiple` is a `Checkbox` per option, `blank` is an `Input`, and
 * `short` is a `Textarea`. Nothing here writes its own input element, and no colour is named
 * outside the tokens.
 */
export interface QuestionRendererProps {
  question: HomeworkQuestion;
  value?: HomeworkAnswerValue;
  onChange?: (value: HomeworkAnswerValue) => void;
  /** Read-only: the attempt is submitted/graded, or this is the teacher looking at it. */
  disabled?: boolean;
  /** 1-based position for the 第 N 题 label. Falls back to `question.order_no`. */
  index?: number;
  /** Rendered under the controls - the per-question photo uploader lives here. */
  footer?: ReactNode;
  className?: string;
}

export function QuestionRenderer({
  question,
  value,
  onChange,
  disabled = false,
  index,
  footer,
  className,
}: QuestionRendererProps) {
  const position = index ?? question.order_no;
  const answer: HomeworkAnswerValue = value ?? {};
  const setAnswer = (patch: Partial<HomeworkAnswerValue>) => {
    onChange?.({ ...answer, ...patch });
  };

  const chosen: string[] = answer.choice ?? [];

  return (
    <div
      data-slot="question-renderer"
      data-question-type={question.type}
      className={cn('space-y-3 rounded-panel border border-line-1 bg-surface-2 p-4 shadow-card sm:p-5', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg-1">
          第 {position} 题
          <Badge variant="secondary">{QUESTION_TYPE_LABEL[question.type]}</Badge>
          <Badge variant="outline">{question.points} 分</Badge>
        </div>
        {(answer.photo_ids ?? []).length > 0 ? (
          <Badge variant="info">已附 {(answer.photo_ids ?? []).length} 张照片</Badge>
        ) : null}
      </div>

      <p className="whitespace-pre-wrap text-sm text-fg-1 sm:text-base">{question.stem || '（题干为空）'}</p>

      {question.type === 'single' ? (
        <Select
          aria-label={`第 ${position} 题作答`}
          value={chosen[0] ?? ''}
          disabled={disabled}
          onChange={(event) => setAnswer({ choice: event.target.value ? [event.target.value] : [] })}
        >
          <option value="">请选择</option>
          {question.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.text || option.id}
            </option>
          ))}
        </Select>
      ) : null}

      {question.type === 'multiple' ? (
        <div className="space-y-2">
          {question.options.map((option) => {
            const checked = chosen.includes(option.id);
            return (
              <label
                key={option.id}
                className="flex items-center gap-2 rounded-card border border-line-1 bg-surface-3/40 px-3 py-2 text-sm text-fg-1"
              >
                <Checkbox
                  aria-label={option.text || option.id}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(next) =>
                    setAnswer({
                      choice: next === true ? [...chosen, option.id] : chosen.filter((id) => id !== option.id),
                    })
                  }
                />
                {option.text || option.id}
              </label>
            );
          })}
        </div>
      ) : null}

      {question.type === 'blank' ? (
        <Input
          aria-label={`第 ${position} 题作答`}
          value={answer.text ?? ''}
          disabled={disabled}
          placeholder="填写答案"
          onChange={(event) => setAnswer({ text: event.target.value })}
        />
      ) : null}

      {question.type === 'short' ? (
        <Textarea
          aria-label={`第 ${position} 题作答`}
          rows={4}
          value={answer.text ?? ''}
          disabled={disabled}
          placeholder="写下你的答案"
          onChange={(event) => setAnswer({ text: event.target.value })}
        />
      ) : null}

      {footer}
    </div>
  );
}

export default QuestionRenderer;
