import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, MessageSquareQuote, UserCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Progress } from '@/components/ui/progress';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import type {
  HomeworkAnswer,
  HomeworkQuestion,
  HomeworkStudentEntry,
} from '@thinkclass/contracts/domains/homework';

import { AiQaPanel } from '../components/AiQaPanel';
import { SUBMISSION_STATUS_LABEL, formatDateTime, submissionStatusVariant } from '../components/GradeSheetTable';
import { QuestionRenderer, summariseAnswer } from '../components/QuestionRenderer';
import { useHomeworkDetail, useHomeworkSubmission, useMyHomework } from '../hooks/useHomework';

function formatConfidence(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return '未给出';
  return `${Math.round(confidence * 100)}%`;
}

/**
 * 作业结果.
 *
 * Three reads, each answering one question and none of them duplicating another:
 *
 *   - `GET /api/homework/my` says *whether there is a submission and what state it is in* - the
 *     list endpoint is the only place the student's own attempt is resolved from a homework id,
 *     because the result route is keyed by the homework;
 *   - `GET /api/homework/:id` brings the questions, so the breakdown can print the stem and the
 *     option text the student actually saw;
 *   - `GET /api/homework/submissions/:id` brings the answers with both scoring columns.
 *
 * ## Two comments, never one
 *
 * Every question renders the teacher's score and comment *and* the AI's, each labelled. The
 * whole point of `ai_comment` and `teacher_comment` being separate columns is that the student
 * (and the teacher) can see where the human disagreed with the model - a page that merged them
 * would delete that fact. `explanation` is shown as 解析 when the teacher wrote one.
 */
export default function StudentHomeworkResult() {
  const { id } = useParams();
  const homeworkId = id ? Number(id) : null;
  const navigate = useNavigate();

  const mine = useMyHomework();
  const detail = useHomeworkDetail(homeworkId);

  /*
   * Annotated rather than inferred from `?? []`: a bare `[]` widens to `never[]`, and a union of
   * array types would make the `.find` / `.map` / `for…of` below depend on how TypeScript
   * resolves two method signatures instead of on the contract.
   */
  const entry = useMemo(() => {
    const rows: HomeworkStudentEntry[] = mine.data ?? [];
    return rows.find((item) => item.homework.id === homeworkId) ?? null;
  }, [mine.data, homeworkId]);
  const submissionId = entry?.submission?.id ?? null;
  const submission = useHomeworkSubmission(submissionId);

  const questions: HomeworkQuestion[] = detail.data?.questions ?? [];
  const submissionData = submission.data;
  const answersByQuestion = useMemo(() => {
    const map = new Map<number, HomeworkAnswer>();
    const rows: HomeworkAnswer[] = submissionData?.answers ?? [];
    for (const answer of rows) map.set(answer.question_id, answer);
    return map;
  }, [submissionData]);

  if (!homeworkId) {
    return (
      <PageScaffold variant="detail">
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          无效的作业编号
        </div>
      </PageScaffold>
    );
  }

  if (mine.isLoading || detail.isLoading) {
    return (
      <PageScaffold variant="detail" className="flex items-center justify-center gap-3 py-20 text-fg-3">
        <Spinner label="正在加载结果" />
        正在加载结果...
      </PageScaffold>
    );
  }

  if (!entry || !detail.data) {
    return (
      <PageScaffold
        variant="detail"
        actions={
          <Button variant="outline" onClick={() => navigate('/student/homework')}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            返回
          </Button>
        }
      >
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          找不到这份作业，或者它已经被老师删除。
        </div>
      </PageScaffold>
    );
  }

  const row = entry.submission;
  const graded = row?.status === 'graded';
  const percent =
    row?.score === null || row?.score === undefined || !row.total_points
      ? 0
      : Math.round((row.score / row.total_points) * 100);

  return (
    <PageScaffold
      variant="detail"
      title={`${detail.data.title} · 结果`}
      description={detail.data.description ?? undefined}
      actions={
        <Button variant="outline" onClick={() => navigate('/student/homework')}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回
        </Button>
      }
      rail={
        <>
          {row ? (
            <SectionCard title="这次提交">
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-3">状态</dt>
                  <dd>
                    <Badge variant={submissionStatusVariant(row.status)}>{SUBMISSION_STATUS_LABEL[row.status]}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-3">提交时间</dt>
                  <dd className="text-fg-2">{formatDateTime(row.submitted_at)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-3">得分</dt>
                  <dd className="font-semibold text-fg-1">
                    {row.score ?? '—'}
                    <span className="font-normal text-fg-3"> / {row.total_points}</span>
                  </dd>
                </div>
                {row.graded_by ? (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-fg-3">评分来源</dt>
                    <dd className="text-fg-2">{row.graded_by}</dd>
                  </div>
                ) : null}
              </dl>
            </SectionCard>
          ) : null}

          <AiQaPanel homeworkId={homeworkId} questions={questions} composer={false} />
        </>
      }
    >
      {!row ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="还没有提交记录"
          description="先完成这份作业，提交之后这里会显示得分和老师的评语。"
          action={
            <Button onClick={() => navigate(`/student/homework/${homeworkId}`)}>去作答</Button>
          }
        />
      ) : (
        <>
          <div
            className={
              graded
                ? 'space-y-4 rounded-panel border border-success/30 bg-success-soft p-6'
                : 'space-y-4 rounded-panel border border-info/30 bg-info-soft p-6'
            }
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className={graded ? 'text-xs font-semibold text-success-ink' : 'text-xs font-semibold text-info-ink'}>
                  {graded ? '最终得分' : '等待批改'}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={graded ? 'text-4xl font-black text-success-ink' : 'text-4xl font-black text-info-ink'}>
                    {row.score ?? '—'}
                  </span>
                  <span className={graded ? 'text-lg font-bold text-success-ink' : 'text-lg font-bold text-info-ink'}>
                    / {row.total_points}
                  </span>
                </div>
              </div>
              <Badge variant={submissionStatusVariant(row.status)}>{SUBMISSION_STATUS_LABEL[row.status]}</Badge>
            </div>
            <Progress
              value={percent}
              label="得分占比"
              tone={graded ? 'success' : 'info'}
            />
          </div>

          {row.teacher_feedback ? (
            <SectionCard title="老师评语">
              <div className="flex items-start gap-3">
                <UserCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                <p className="whitespace-pre-wrap text-sm text-fg-1">{row.teacher_feedback}</p>
              </div>
            </SectionCard>
          ) : null}

          {row.ai_feedback ? (
            <SectionCard title="AI 总评" description="模型给出的参考意见，不是最终成绩">
              <div className="space-y-2 rounded-card border border-dashed border-line-2 bg-surface-3/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">AI 建议</Badge>
                  <span className="text-xs text-fg-3">整体置信度 {formatConfidence(row.ai_confidence)}</span>
                </div>
                <div className="flex items-start gap-3">
                  <Bot aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
                  <p className="whitespace-pre-wrap text-sm text-fg-2">{row.ai_feedback}</p>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="逐题结果" description="老师的批注和 AI 的建议分开显示">
            {submission.isLoading ? (
              <div className="flex items-center justify-center gap-3 py-10 text-fg-3">
                <Spinner label="正在加载作答" />
                正在加载作答...
              </div>
            ) : questions.length === 0 ? (
              <p className="rounded-card border border-dashed border-line-1 bg-surface-2 px-4 py-6 text-center text-sm text-fg-3">
                这份作业以拍照提交为主，没有逐题结果，请看上面的总评分语。
              </p>
            ) : (
              <div className="space-y-5">
                {questions.map((question, index) => {
                  const answer = answersByQuestion.get(question.id);
                  return (
                    <div key={question.id} className="space-y-3">
                      <QuestionRenderer
                        question={question}
                        index={index + 1}
                        value={answer?.value}
                        disabled
                      />

                      <div className="space-y-3 rounded-card border border-line-1 bg-surface-3/40 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-fg-2">
                            我的答案：<span className="text-fg-1">{summariseAnswer(question, answer?.value)}</span>
                          </span>
                          <span className="text-xs font-semibold text-fg-1">
                            {answer?.score === null || answer?.score === undefined
                              ? '未评分'
                              : `${answer.score} / ${question.points} 分`}
                          </span>
                        </div>

                        <div className="rounded-card border border-line-1 bg-surface-2 p-3">
                          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-fg-2">
                            <UserCheck aria-hidden="true" className="size-3.5 text-success" />
                            老师批注
                          </div>
                          <p className="whitespace-pre-wrap text-xs text-fg-2">
                            {answer?.teacher_comment ?? '老师没有写这道题的批注。'}
                          </p>
                        </div>

                        {answer && (answer.ai_score !== null || answer.ai_comment) ? (
                          <div className="rounded-card border border-dashed border-line-2 bg-surface-2 p-3">
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-fg-2">
                              <Badge variant="info">AI 建议</Badge>
                              <span className="font-normal text-fg-3">
                                {answer.ai_score === null ? '未评分' : `${answer.ai_score} 分`} · 置信度{' '}
                                {formatConfidence(answer.ai_confidence)}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap text-xs text-fg-2">
                              {answer.ai_comment ?? 'AI 没有给出评语。'}
                            </p>
                          </div>
                        ) : null}

                        {question.explanation ? (
                          <div className="rounded-card border border-line-1 bg-surface-2 p-3">
                            <div className="mb-1 text-xs font-semibold text-fg-2">解析</div>
                            <p className="whitespace-pre-wrap text-xs text-fg-2">{question.explanation}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </PageScaffold>
  );
}
