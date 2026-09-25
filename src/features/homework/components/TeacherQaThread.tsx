import { HelpCircle, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { HomeworkQaMessage } from '@thinkclass/contracts/domains/homework';

import { useTeacherHomeworkQa } from '../hooks/useHomework';

/**
 * A pupil's AI question thread, as their teacher reads it.
 *
 * ## Why this exists at all, and why it is read-only
 *
 * `GET /api/homework/:id/qa` has always accepted `student_id` for staff - the service *requires* it
 * from a teacher, because a thread belongs to one pupil and there is no meaningful "all threads".
 * Nothing on the instructor side called it with one, so the whole assistant half of the feature was
 * invisible to the person best placed to act on it: "where did this pupil get stuck?" is exactly
 * what a grading screen should answer, and a thread where the student asked 「为什么用这个公式？」
 * before writing a wrong answer is that answer.
 *
 * It writes nothing. A teacher who wants to reply has the 评语 fields, which the pupil *sees* as
 * feedback - an assistant message a teacher typed would be indistinguishable from a model's in the
 * same thread, which is the one thing this table's `role` / `ai_source` pair exists to keep honest.
 *
 * ## The `ai_source` badge is provenance, not decoration
 *
 * A mock reply and a real model's reply are different facts about how much the answer is worth, so
 * the badge prints `ai_source` verbatim rather than labelling every non-student line 「助手」.
 *
 * ## Which question a turn was about is not shown, on purpose
 *
 * `POST /api/homework/:id/qa` takes a `question_id` when the student anchors their question to one
 * item, but `p_homework_qa_messages` stores only `(assignment_id, student_id, role, content,
 * ai_source)` - the anchor is prompt context, not a persisted column. Printing a per-turn 「第 3 题」
 * label would therefore be a guess dressed as data, so this panel shows the thread as it is stored.
 */
export interface TeacherQaThreadProps {
  homeworkId: number;
  /** Whose thread. `null` before a row is selected, which keeps the query disabled. */
  studentId: number | null;
  className?: string;
}

export function TeacherQaThread({ homeworkId, studentId, className }: TeacherQaThreadProps) {
  const qa = useTeacherHomeworkQa(homeworkId, studentId);

  /*
   * Annotated rather than inferred from `?? []`: a bare `[]` widens to `never[]`, and the resulting
   * union of array types would make the `.map` below depend on how TypeScript resolves the
   * contract's array type instead of on the contract.
   */
  const messages: HomeworkQaMessage[] = qa.data?.messages ?? [];

  return (
    <SectionCard title="学生提问记录" description="只读：学生与助手关于这份作业的对话" className={className}>
      {qa.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-fg-3">
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
          className="border-0 bg-transparent py-6"
          title="这名学生没有提问"
          description="学生用「AI 问答」提问后，对话会出现在这里。"
        />
      ) : (
        <ul className="space-y-3">
          {messages.map((message) => (
            <li key={message.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
                <span className={cn('font-semibold', message.role === 'student' ? 'text-role-ink' : 'text-info-ink')}>
                  {message.role === 'student' ? '学生' : '助手'}
                </span>
                {message.ai_source ? <Badge variant="secondary">{message.ai_source}</Badge> : null}
              </div>
              <p
                className={cn(
                  'whitespace-pre-wrap rounded-card px-3 py-2 text-xs',
                  message.role === 'student'
                    ? 'bg-role-soft text-role-ink'
                    : 'border border-dashed border-line-2 bg-surface-3/40 text-fg-2',
                )}
              >
                {message.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export default TeacherQaThread;
