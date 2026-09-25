import { useState } from 'react';
import { HelpCircle, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { HomeworkQaMessage, HomeworkQuestion } from '@thinkclass/contracts/domains/homework';

import { useAskQaMutation, useHomeworkQa } from '../hooks/useHomework';

/**
 * AI 问答面板.
 *
 * The thread is stored server-side on the homework row (`p_homework_qa_messages`), so a student
 * who leaves the attempt page and comes back finds the conversation - which is why this reads
 * `GET /api/homework/:id/qa` rather than keeping messages in local state.
 *
 * The same `HomeworkAiOutcome` rule as the grading panel applies: when the assistant half is
 * unavailable the answer is still a 200, and `ai.message` is printed instead of an invented
 * reply. The thread itself always renders: the student's own questions are real records even
 * when no model answered them.
 *
 * `composer={false}` is the result page's read-only view of the same thread.
 */
export interface AiQaPanelProps {
  homeworkId: number;
  /** Offered as anchors: 「关于第 3 题」. */
  questions?: HomeworkQuestion[];
  composer?: boolean;
  disabled?: boolean;
  className?: string;
}

export function AiQaPanel({
  homeworkId,
  questions = [],
  composer = true,
  disabled = false,
  className,
}: AiQaPanelProps) {
  const [draft, setDraft] = useState('');
  const [questionId, setQuestionId] = useState<number | null>(null);
  const qa = useHomeworkQa(homeworkId);
  const ask = useAskQaMutation();

  /*
   * Annotated rather than inferred from `?? []`: a bare `[]` widens to `never[]`, and the
   * resulting union of array types would make the `.map` below depend on how TypeScript resolves
   * two method signatures instead of on the contract.
   *
   * `outcome` is nullable because `GET /api/homework/:id/qa` answers `{ messages, ai: null }` -
   * a thread with no AI half yet - while `POST` always carries one.
   */
  const messages: HomeworkQaMessage[] = qa.data?.messages ?? [];
  const outcome = qa.data?.ai ?? null;

  const handleAsk = async () => {
    const content = draft.trim();
    if (!content) {
      toast.error('请先写下你的问题');
      return;
    }
    try {
      await ask.mutateAsync({
        homeworkId,
        payload: questionId === null ? { content } : { content, question_id: questionId },
      });
      setDraft('');
    } catch {
      // The api layer already surfaced the failure; the draft is kept so the student can retry.
    }
  };

  return (
    <div
      data-slot="ai-qa-panel"
      className={cn('space-y-4 rounded-panel border border-line-1 bg-surface-2 p-4 shadow-card', className)}
    >
      <div className="flex items-center gap-2">
        <HelpCircle aria-hidden="true" className="size-4 text-role-ink" />
        <h3 className="text-sm font-semibold text-fg-1">AI 问答</h3>
      </div>

      {qa.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-fg-3">
          <Spinner size="sm" label="正在加载问答" />
          正在加载问答...
        </div>
      ) : qa.isError ? (
        <div className="space-y-2 rounded-card border border-danger/30 bg-danger-soft p-3 text-xs text-danger-ink">
          <p>问答记录加载失败，可以重试或稍后再看。</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void qa.refetch()}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            重试
          </Button>
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="还没有提问"
          description="看不懂题目时，可以问一句，助手会把思路讲清楚。"
        />
      ) : (
        <ul className="space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn('flex', message.role === 'student' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] space-y-1 rounded-panel px-3 py-2 text-sm',
                  message.role === 'student'
                    ? 'bg-role-soft text-role-ink'
                    : 'bg-surface-3 text-fg-1',
                )}
              >
                <div className="flex items-center gap-2 text-xs opacity-80">
                  {message.role === 'student' ? '我' : '助手'}
                  {message.ai_source ? <Badge variant="secondary">{message.ai_source}</Badge> : null}
                </div>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {outcome && !outcome.available ? (
        <div className="rounded-card border border-warning/30 bg-warning-soft p-3 text-xs text-warning-ink">
          <div className="font-semibold">助手未接入模型</div>
          <p className="mt-1 whitespace-pre-wrap">{outcome.message}</p>
        </div>
      ) : null}

      {composer ? (
        <div className="space-y-3 border-t border-line-1 pt-4">
          {questions.length > 0 ? (
            <FormField label="提问针对" hint="可以只问某一道题">
              <Select
                value={questionId ?? ''}
                disabled={disabled || ask.isPending}
                onChange={(event) => setQuestionId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">整份作业</option>
                {questions.map((question, index) => (
                  <option key={question.id} value={question.id}>
                    第 {index + 1} 题
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          <FormField label="我想问">
            <Textarea
              rows={2}
              value={draft}
              disabled={disabled || ask.isPending}
              placeholder="例如：这道题为什么要用这个公式？"
              onChange={(event) => setDraft(event.target.value)}
            />
          </FormField>

          <Button
            type="button"
            disabled={disabled || ask.isPending || !draft.trim()}
            onClick={() => void handleAsk()}
          >
            {ask.isPending ? <Spinner size="sm" label="正在提问" /> : <Send data-icon="inline-start" aria-hidden="true" />}
            {ask.isPending ? '提问中...' : '提问'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default AiQaPanel;
