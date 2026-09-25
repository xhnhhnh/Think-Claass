import { useState } from 'react';
import { Check, Sparkles, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  HomeworkAiGenerateResult,
  HomeworkQuestionPayload,
  HomeworkQuestionType,
} from '@thinkclass/contracts/domains/homework';

import { QUESTION_TYPE_LABEL } from './QuestionEditor';
import { useGenerateQuestionsMutation } from '../hooks/useHomework';

/** How many questions one generation may ask for. The server clamps to the same ceiling. */
const MAX_COUNT = 20;

/**
 * The types 出题 can produce, and the only place the console names them.
 *
 * 简答 is absent on purpose: its answer is prose and its marking is a rubric, which is exactly what a
 * template cannot pin down, so a model's draft of one is text a teacher rewrites. The server refuses
 * it too (`plugins/homework/src/homework.templates.ts` owns the list) - this constant mirrors that
 * list, and `tests/guardrails/homework-generate-types.test.ts` fails if the two ever drift, so the
 * console cannot offer a type the route would reject.
 */
export const GENERATABLE_QUESTION_TYPES: Array<{ value: 'single' | 'multiple' | 'blank'; label: string }> = [
  { value: 'single', label: QUESTION_TYPE_LABEL.single },
  { value: 'multiple', label: QUESTION_TYPE_LABEL.multiple },
  { value: 'blank', label: QUESTION_TYPE_LABEL.blank },
];

/**
 * AI 出题.
 *
 * ## Why this is a panel inside the publish/edit dialog rather than a page
 *
 * Generation produces *candidates*, not homework. They have to land somewhere a teacher can already
 * edit, and that place exists: the dialog's question list, which owns the paper's own
 * `HomeworkQuestionPayload[]`. A separate page would need a staging area, a "send to the paper"
 * action and a second editor - three things whose only job is moving data between two screens that
 * could have been one.
 *
 * ## The three types, and the templates behind them
 *
 * 选择题 / 多选题 / 填空题 are the generatable set. Each has a built-in template on the server
 * (`plugins/homework/src/homework.templates.ts`) - a JSON skeleton plus two rules - so the prompt does
 * not have to describe a question's shape in prose on every call. That is the token saving: the old
 * four-type description cost a few hundred tokens per generation, and the per-type form costs about
 * forty because it only ever states the shape being asked for. 简答 is not offered here because it has
 * no template: its answer is prose and its marking is a rubric, which is what a template cannot pin
 * down, so a draft of one is text a teacher rewrites.
 *
 * ## The draft contract
 *
 * A candidate is inserted as a plain question with no `id`, which is exactly what `QuestionEditor`'s
 * own 添加题目 produces. From that moment it is indistinguishable from a hand-written question:
 * same fields, same validation, no "AI" marker on the row. That is deliberate - such a mark would
 * have to be either *enforced* (blocking an edit, which is absurd) or *displayed* (telling a class
 * their homework came from a model, on no evidence, after the teacher rewrote it). Provenance lives
 * where it is useful instead: `data.ai` on the response, printed here.
 *
 * ## Nothing is saved by this panel
 *
 * The route persists nothing and this panel invalidates nothing. An abandoned generation leaves no
 * rows, and one the teacher accepts is written by the dialog's ordinary 发布/保存 - so the AI still
 * cannot introduce a question the manual path would have refused.
 */
export interface AiQuestionPanelProps {
  /** The paper's current questions, so a second run does not repeat the first. */
  questions: HomeworkQuestionPayload[];
  /** Called with the candidates the teacher accepted, in the order the paper should take them. */
  onInsert: (questions: HomeworkQuestionPayload[]) => void;
  /** The title already typed in the dialog, sent as context when there is one. */
  contextTitle?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * One line describing a candidate's reference answer.
 *
 * The dialog is small and a candidate is long, so the list shows enough to judge whether the item is
 * worth inserting; the full fields appear once it is in the editor. An empty result is printed by
 * the caller as 「（缺失，插入后请补上）」 rather than hidden - a candidate with no answer is exactly
 * the one a teacher must not insert without looking.
 */
function summarise(question: HomeworkQuestionPayload): string {
  if (question.type === 'blank') return (question.reference?.accept ?? []).join(' / ');
  if (question.type === 'short') return question.reference?.text ?? '';
  const ids = question.reference?.choice ?? [];
  return ids.map((id) => question.options?.find((option) => option.id === id)?.text ?? id).join('、');
}

export function AiQuestionPanel({
  questions,
  onInsert,
  contextTitle = '',
  disabled = false,
  className,
}: AiQuestionPanelProps) {
  const generate = useGenerateQuestionsMutation();

  const [topic, setTopic] = useState('');
  const [type, setType] = useState<'' | HomeworkQuestionType>('');
  const [count, setCount] = useState(5);
  const [grade, setGrade] = useState('');
  const [hint, setHint] = useState('');
  const [result, setResult] = useState<HomeworkAiGenerateResult | null>(null);
  /** Candidates the teacher has taken, by index in `result.questions`. */
  const [taken, setTaken] = useState<Set<number>>(new Set());

  const candidates = result?.questions ?? [];
  const remaining = candidates.length - taken.size;

  const run = async () => {
    if (!topic.trim()) {
      toast.error('请先填写出题主题');
      return;
    }
    try {
      const response = await generate.mutateAsync({
        topic: topic.trim(),
        ...(type ? { type } : {}),
        count,
        grade: grade.trim() || null,
        hint: hint.trim() || null,
        context_title: contextTitle.trim() || null,
        // Stems only: a duplicate is recognised by what it asks, and sending the paper's reference
        // answers back to the model would be sending its answer key out for no gain.
        avoid: questions.map((question) => question.stem).filter(Boolean),
      });
      const data: HomeworkAiGenerateResult = response.data;
      setResult(data);
      setTaken(new Set());
      if (data.ai.available) toast.success('已生成候选题，请核对后插入');
      else toast.warning('AI 未参与出题，请查看面板说明');
    } catch {
      // The api layer already surfaced the failure; the form keeps what the teacher typed.
    }
  };

  const takeOne = (index: number) => {
    const question = candidates[index];
    if (!question) return;
    onInsert([question]);
    setTaken((prev) => new Set(prev).add(index));
  };

  const takeAll = () => {
    const pending = candidates.filter((_question, index) => !taken.has(index));
    if (pending.length === 0) return;
    onInsert(pending);
    setTaken(new Set(candidates.map((_question, index) => index)));
  };

  return (
    <div
      data-slot="ai-question-panel"
      className={cn('space-y-4 rounded-panel border border-line-1 bg-surface-2 p-4 shadow-card', className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Wand2 aria-hidden="true" className="size-4 text-role-ink" />
        <h4 className="text-sm font-semibold text-fg-1">AI 出题</h4>
        <Badge variant="info">候选题</Badge>
      </div>

      <p className="text-xs text-fg-3">
        生成的题目会作为候选题列在下面。逐题核对后再插入到作业里；没有插入的不会保存，插入后的题目和自己写的完全一样，可以随意修改。
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="出题主题" required hint="写清楚知识点，例如「小学五年级 分数的加减法」">
          <Input
            value={topic}
            // Mirrors the server's own cap (AI_TOPIC_MAX_LENGTH): a longer prompt is not a better
            // prompt, and letting the field grow until the request 400s would waste the teacher's
            // typing rather than stopping it.
            maxLength={500}
            disabled={disabled || generate.isPending}
            placeholder="例如：小学五年级 分数的加减法"
            onChange={(event) => setTopic(event.target.value)}
          />
        </FormField>

        <FormField label="题型" hint="选择题 / 多选题 / 填空题各有配套模板；不选则三种混用">
          <Select
            value={type}
            disabled={disabled || generate.isPending}
            onChange={(event) => setType(event.target.value as '' | HomeworkQuestionType)}
          >
            <option value="">混合题型</option>
            {GENERATABLE_QUESTION_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="数量">
          <Input
            type="number"
            min={1}
            max={MAX_COUNT}
            value={count}
            disabled={disabled || generate.isPending}
            onChange={(event) => setCount(Math.min(Math.max(Number(event.target.value) || 1, 1), MAX_COUNT))}
          />
        </FormField>

        <FormField label="年级或难度" hint="可选，作为出题背景">
          <Input
            value={grade}
            disabled={disabled || generate.isPending}
            placeholder="例如：五年级 / 基础题"
            onChange={(event) => setGrade(event.target.value)}
          />
        </FormField>
      </div>

      <FormField label="额外要求" hint="可选，例如「每题 5 分」「贴近课本第三章」">
        <Textarea
          rows={2}
          value={hint}
          disabled={disabled || generate.isPending}
          onChange={(event) => setHint(event.target.value)}
        />
      </FormField>

      <Button type="button" disabled={disabled || generate.isPending || !topic.trim()} onClick={() => void run()}>
        {generate.isPending ? (
          <Spinner size="sm" label="正在出题" />
        ) : (
          <Sparkles data-icon="inline-start" aria-hidden="true" />
        )}
        {generate.isPending ? '正在出题...' : '生成候选题'}
      </Button>

      {result ? (
        <div className="space-y-3">
          <div
            className={cn(
              'rounded-card border p-3 text-xs',
              result.ai.available
                ? 'border-info/30 bg-info-soft text-info-ink'
                : 'border-warning/30 bg-warning-soft text-warning-ink',
            )}
          >
            <div className="font-semibold">
              {result.ai.available ? '已生成候选题' : 'AI 未参与出题'}
              <span className="ml-2 font-normal opacity-80">来源：{result.ai.source}</span>
            </div>
            {/* The message is rendered whatever `available` says: when the mock declined, this line
                is the only place the operator is told which console field to fill in. */}
            <p className="mt-1 whitespace-pre-wrap">{result.ai.message}</p>
            {result.skipped > 0 ? (
              <p className="mt-1 opacity-80">另有 {result.skipped} 道不合格的候选题已丢弃。</p>
            ) : null}
          </div>

          {candidates.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || remaining === 0}
                  onClick={takeAll}
                >
                  <Check data-icon="inline-start" aria-hidden="true" />
                  全部插入（{remaining}）
                </Button>
                <span className="text-xs text-fg-3">插入后请核对参考答案与分值再发布</span>
              </div>

              <ul className="space-y-2">
                {candidates.map((question, index) => (
                  <li
                    key={`candidate-${index}`}
                    className={cn(
                      'space-y-1 rounded-card border p-3 text-xs',
                      taken.has(index)
                        ? 'border-success/30 bg-success-soft'
                        : 'border-dashed border-line-2 bg-surface-3/40',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold text-fg-1">
                        候选 {index + 1}
                        <Badge variant="secondary">{QUESTION_TYPE_LABEL[question.type]}</Badge>
                        <span className="font-normal text-fg-3">{question.points} 分</span>
                      </span>
                      {taken.has(index) ? (
                        <span className="flex items-center gap-1 text-success-ink">
                          <Check aria-hidden="true" className="size-3.5" />
                          已插入
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={disabled}
                          onClick={() => takeOne(index)}
                        >
                          插入
                        </Button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-fg-1">{question.stem}</p>
                    {question.options && question.options.length > 0 ? (
                      <p className="text-fg-2">
                        {question.options.map((option) => `${option.id}. ${option.text}`).join('　')}
                      </p>
                    ) : null}
                    <p className="text-fg-2">
                      参考答案：
                      <span className="text-fg-1">{summarise(question) || '（缺失，插入后请补上）'}</span>
                    </p>
                    {question.explanation ? <p className="text-fg-3">解析：{question.explanation}</p> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default AiQuestionPanel;
