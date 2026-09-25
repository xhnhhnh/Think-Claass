import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Progress } from '@/components/ui/progress';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type {
  HomeworkAnswer,
  HomeworkGradeEntryPayload,
  HomeworkGradePayload,
  HomeworkQuestion,
} from '@thinkclass/contracts/domains/homework';

import { AiGradePanel } from '../components/AiGradePanel';
import {
  GradeSheetTable,
  SUBMISSION_STATUS_LABEL,
  formatDateTime,
  submissionStatusVariant,
} from '../components/GradeSheetTable';
import { QuestionRenderer, summariseAnswer } from '../components/QuestionRenderer';
import { TeacherQaThread } from '../components/TeacherQaThread';
import {
  useGradeSubmissionMutation,
  useHomeworkDetail,
  useHomeworkSubmission,
  useHomeworkSubmissions,
} from '../hooks/useHomework';

/** One question's teacher inputs, as typed. Empty string means "no score yet", not zero. */
interface AnswerDraft {
  teacher_score: string;
  teacher_comment: string;
}

function formatConfidence(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return '未给出';
  return `${Math.round(confidence * 100)}%`;
}

/**
 * 批改作业.
 *
 * A `detail` page: the grade sheet and the per-question grading panel are the main column, and
 * the submission's own facts plus the AI assist live in the rail.
 *
 * ## Why the teacher's number and the AI's number are separate inputs
 *
 * `HomeworkAnswer` carries `ai_score` and `teacher_score` as different columns, and this page
 * never collapses them into one: the AI figure is printed with an `AI 建议` badge, the teacher
 * types their own, and `score` is whatever the server derives. That is the whole reason the
 * contract has three fields rather than one, and a grading screen that showed one box would
 * destroy the signal the model produced.
 *
 * ## Where the numbers come from
 *
 *   - the sheet: `GET /api/homework/:id/submissions` (names already decrypted server-side);
 *   - the paper: `GET /api/homework/submissions/:id`, which is the same `HomeworkAttemptDetail`
 *     the student's attempt page reads;
 *   - the write: `PUT /api/homework/submissions/:id` with `status: 'graded' | 'returned'`;
 *   - the pupil's questions: `GET /api/homework/:id/qa?student_id=`, read-only, in the rail below
 *     the AI panel - the route requires a teacher to name a pupil, and this is where they do.
 *
 * A row with no submission loaded yet, a legacy homework, and a class with no students are all
 * rendered states rather than blank space.
 */
export default function TeacherHomeworkGrade() {
  const { id } = useParams();
  const homeworkId = id ? Number(id) : null;
  const navigate = useNavigate();

  const detail = useHomeworkDetail(homeworkId);
  const sheet = useHomeworkSubmissions(homeworkId);
  const gradeSubmission = useGradeSubmissionMutation();

  const [selectedSubmissionId, setSelectedSubmissionId] = useState<number | null>(null);
  const submission = useHomeworkSubmission(selectedSubmissionId);

  const [drafts, setDrafts] = useState<Record<number, AnswerDraft>>({});
  const [feedback, setFeedback] = useState('');

  const isLegacy = detail.data?.legacy === true;

  /*
   * Re-seed the inputs only when the server's data actually changed.
   *
   * The key is built from the fields the server owns (`teacher_score`, `ai_score`) plus the
   * submission id, so a background refetch with identical data cannot overwrite what the teacher
   * is halfway through typing - while an AI run (which changes `ai_score`) and a submission
   * switch both do re-seed.
   */
  const seedKey = useMemo(() => {
    const data = submission.data;
    if (!data) return '';
    const answers = data.answers
      .map((answer) => `${answer.id}/${answer.teacher_score ?? ''}/${answer.ai_score ?? ''}`)
      .join(',');
    return `${data.submission.id}|${answers}`;
  }, [submission.data]);

  /** Which submission the drafts in state belong to, so a switch starts from a clean slate. */
  const seededSubmissionRef = useRef<number | null>(null);

  /*
   * The merge is what keeps an AI run from destroying unsaved work.
   *
   * Nothing the teacher types leaves the browser until 保存并公布, so a re-seed triggered by
   * 「开始 AI 判分」 would otherwise wipe every box they had filled in - and with
   * `overwrite_teacher` off, the server has no teacher scores to restore them from. A non-empty
   * local value therefore wins; an untouched one is taken from the server. When the submission
   * itself changes the local values belong to a different paper and are dropped.
   */
  useEffect(() => {
    const data = submission.data;
    if (!data) return;
    const sameSubmission = seededSubmissionRef.current === data.submission.id;
    seededSubmissionRef.current = data.submission.id;

    setDrafts((prev) => {
      const base = sameSubmission ? prev : {};
      const next: Record<number, AnswerDraft> = {};
      for (const answer of data.answers) {
        const existing = base[answer.question_id];
        next[answer.question_id] = {
          teacher_score: existing?.teacher_score?.trim()
            ? existing.teacher_score
            : answer.teacher_score === null
              ? ''
              : String(answer.teacher_score),
          teacher_comment: existing?.teacher_comment?.trim() ? existing.teacher_comment : (answer.teacher_comment ?? ''),
        };
      }
      return next;
    });

    setFeedback((prev) => (sameSubmission && prev.trim() ? prev : (data.submission.teacher_feedback ?? '')));
  }, [seedKey]);

  const answersByQuestion = useMemo(() => {
    const map = new Map<number, HomeworkAnswer>();
    const rows: HomeworkAnswer[] = submission.data?.answers ?? [];
    for (const answer of rows) map.set(answer.question_id, answer);
    return map;
  }, [submission.data]);

  const answerRows: HomeworkAnswer[] = submission.data?.answers ?? [];
  const answeredCount = answerRows.filter((answer) => {
    const value = answer.value ?? {};
    return (value.text ?? '').trim().length > 0 || (value.choice ?? []).length > 0 || (value.photo_ids ?? []).length > 0;
  }).length;

  const questions: HomeworkQuestion[] = detail.data?.questions ?? [];

  const setDraft = (questionId: number, patch: Partial<AnswerDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [questionId]: { teacher_score: '', teacher_comment: '', ...prev[questionId], ...patch },
    }));
  };

  /** The teacher's typed figures, as the write payload wants them. */
  const buildAnswerPayload = (): HomeworkGradeEntryPayload[] => {
    const entries: HomeworkGradeEntryPayload[] = [];
    for (const [questionId, draft] of Object.entries(drafts)) {
      const answer = answersByQuestion.get(Number(questionId));
      if (!answer) continue;
      const trimmed = draft.teacher_score.trim();
      const score = trimmed === '' ? null : Number(trimmed);
      if (score !== null && Number.isNaN(score)) {
        throw new Error('分数必须是数字');
      }
      entries.push({
        answer_id: answer.id,
        teacher_score: score,
        teacher_comment: draft.teacher_comment.trim() || null,
      });
    }
    return entries;
  };

  const save = async (status: 'graded' | 'returned') => {
    if (!selectedSubmissionId) return;
    let answers: HomeworkGradeEntryPayload[];
    try {
      answers = buildAnswerPayload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '分数格式不正确');
      return;
    }

    const payload: HomeworkGradePayload = {
      teacher_feedback: feedback.trim() || null,
      status,
      answers,
    };

    try {
      await gradeSubmission.mutateAsync({ submissionId: selectedSubmissionId, payload });
      toast.success(status === 'graded' ? '批改完成，成绩已公布' : '已退回给学生修改');
    } catch {
      // The api layer already surfaced the failure; the inputs keep their values.
    }
  };

  if (!homeworkId) {
    return (
      <PageScaffold variant="detail">
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          无效的作业编号
        </div>
      </PageScaffold>
    );
  }

  if (detail.isLoading) {
    return (
      <PageScaffold variant="detail" className="flex items-center justify-center gap-3 py-20 text-fg-3">
        <Spinner label="正在加载作业" />
        正在加载作业...
      </PageScaffold>
    );
  }

  if (!detail.data) {
    return (
      <PageScaffold variant="detail">
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          作业不存在，或当前账号没有权限查看。
        </div>
      </PageScaffold>
    );
  }

  const submissionData = submission.data;
  const selectedRow = (sheet.data ?? []).find((row) => row.submission.id === selectedSubmissionId);

  return (
    <PageScaffold
      variant="detail"
      title={detail.data.title}
      description={`共 ${questions.length} 题 · 总分 ${detail.data.total_points}`}
      actions={
        <Button variant="outline" onClick={() => navigate('/teacher/homework')}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回
        </Button>
      }
      rail={
        selectedSubmissionId ? (
          <>
            <SectionCard title="本次提交">
              {submission.isLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-fg-3">
                  <Spinner size="sm" label="正在加载提交" />
                  正在加载提交...
                </div>
              ) : submissionData ? (
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-fg-3">学生</dt>
                    <dd className="font-medium text-fg-1">{selectedRow?.student_name ?? `学生 #${submissionData.submission.student_id}`}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-fg-3">状态</dt>
                    <dd>
                      <Badge variant={submissionStatusVariant(submissionData.submission.status)}>
                        {SUBMISSION_STATUS_LABEL[submissionData.submission.status]}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-fg-3">提交时间</dt>
                    <dd className="text-fg-2">{formatDateTime(submissionData.submission.submitted_at)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-fg-3">作答进度</dt>
                    <dd className="text-fg-2">
                      {answeredCount} / {questions.length}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-fg-3">当前得分</dt>
                    <dd className="text-lg font-bold text-fg-1">
                      {submissionData.submission.score ?? '—'}
                      <span className="text-sm font-normal text-fg-3"> / {submissionData.submission.total_points}</span>
                    </dd>
                    <Progress
                      value={
                        submissionData.submission.score === null || submissionData.submission.total_points === 0
                          ? 0
                          : Math.round((submissionData.submission.score / submissionData.submission.total_points) * 100)
                      }
                      label="当前得分占比"
                      tone="success"
                    />
                  </div>
                  {submissionData.submission.graded_by ? (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-fg-3">评分来源</dt>
                      <dd className="text-fg-2">{submissionData.submission.graded_by}</dd>
                    </div>
                  ) : null}
                  {(submissionData.photos ?? []).length > 0 ? (
                    <div className="space-y-1">
                      <dt className="text-fg-3">整卷照片</dt>
                      <dd className="space-y-1">
                        {submissionData.photos.map((photo) => (
                          <div key={photo.id} className="truncate rounded-card bg-surface-3/40 px-2 py-1 text-xs text-fg-2">
                            {photo.storage_path}
                          </div>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-fg-3">这条提交读不出来，可以换一个学生试试。</p>
              )}
            </SectionCard>

            <AiGradePanel
              homeworkId={homeworkId}
              submissionId={selectedSubmissionId}
              questions={questions}
              disabled={isLegacy}
              onGraded={() => void submission.refetch()}
            />

            {/*
              The pupil's own questions, read-only. Placed after the AI panel rather than before it
              because the panel is about *this* paper's marks and the thread is context for them; a
              thread with no messages renders its own empty state, so a pupil who never asked does
              not cost a reader a section they have to interpret.

              Keyed off the submission's `student_id`, not off the grade-sheet row: a row with
              `id: 0` is the synthetic "has not started" entry, and the thread is per *pupil*, so a
              student who never submitted but did ask a question still has one worth reading.
            */}
            <TeacherQaThread homeworkId={homeworkId} studentId={submissionData?.submission.student_id ?? null} />
          </>
        ) : null
      }
    >
      {isLegacy ? (
        <div className="rounded-panel border border-warning/30 bg-warning-soft p-4 text-sm text-warning-ink">
          这份作业来自迁移前的旧数据（没有题目），只能查看提交，不能批改。请等待数据迁移完成。
        </div>
      ) : null}

      <SectionCard title="成绩单" description="点击某一行开始批改">
        {sheet.isLoading ? (
          <div className="flex items-center justify-center gap-3 py-10 text-fg-3">
            <Spinner label="正在加载成绩单" />
            正在加载成绩单...
          </div>
        ) : (
          <GradeSheetTable
            rows={sheet.data ?? []}
            isLoading={false}
            readOnly={isLegacy}
            selectedSubmissionId={selectedSubmissionId}
            onSelect={(row) => setSelectedSubmissionId(row.submission.id)}
          />
        )}
      </SectionCard>

      {!selectedSubmissionId ? (
        <EmptyState
          icon={CheckCircle2}
          title="还没有选择要批改的提交"
          description="在上面的成绩单里点一名学生，这里会显示他的每一道题。"
        />
      ) : submission.isLoading ? (
        <div className="flex items-center justify-center gap-3 py-10 text-fg-3">
          <Spinner label="正在加载作答" />
          正在加载作答...
        </div>
      ) : !submissionData ? (
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-10 text-center text-fg-3">
          这名学生的作答读不出来，请换一名学生或稍后重试。
        </div>
      ) : (
        <SectionCard
          title="逐题批改"
          description="AI 的分数只是建议，老师填写的分数才是学生看到的成绩"
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                disabled={gradeSubmission.isPending || isLegacy}
                onClick={() => void save('returned')}
              >
                <RotateCcw data-icon="inline-start" aria-hidden="true" />
                退回修改
              </Button>
              <Button
                type="button"
                disabled={gradeSubmission.isPending || isLegacy}
                onClick={() => void save('graded')}
              >
                {gradeSubmission.isPending ? (
                  <Spinner size="sm" label="正在保存" />
                ) : (
                  <Save data-icon="inline-start" aria-hidden="true" />
                )}
                保存并公布
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {questions.length === 0 ? (
              <p className="rounded-card border border-dashed border-line-1 bg-surface-2 px-4 py-6 text-center text-sm text-fg-3">
                这份作业以拍照提交为主，没有逐题作答。可以直接写总评分语。
              </p>
            ) : (
              questions.map((question, index) => {
                const answer = answersByQuestion.get(question.id);
                const draft = drafts[question.id] ?? { teacher_score: '', teacher_comment: '' };

                return (
                  <div key={question.id} className="space-y-3">
                    <QuestionRenderer
                      question={question}
                      index={index + 1}
                      value={answer?.value}
                      disabled
                    />

                    <div className="space-y-3 rounded-card border border-line-1 bg-surface-3/40 p-4">
                      <div className="text-xs text-fg-2">
                        学生答案：<span className="text-fg-1">{summariseAnswer(question, answer?.value)}</span>
                      </div>

                      {answer && (answer.ai_score !== null || answer.ai_comment || answer.ai_confidence !== null) ? (
                        <div className="space-y-1 rounded-card border border-dashed border-line-2 bg-surface-2 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="info">AI 建议</Badge>
                            <span className="text-xs font-semibold text-fg-1">
                              {answer.ai_score === null ? '未评分' : `${answer.ai_score} 分`}
                            </span>
                            <span className="text-xs text-fg-3">
                              置信度 {formatConfidence(answer.ai_confidence)}
                              {answer.ai_source ? ` · 来源 ${answer.ai_source}` : ''}
                            </span>
                          </div>
                          {answer.ai_comment ? (
                            <p className="whitespace-pre-wrap text-xs text-fg-2">{answer.ai_comment}</p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                        <FormField label="老师打分" hint={`满分 ${question.points}`}>
                          <Input
                            type="number"
                            min={0}
                            max={question.points}
                            step={1}
                            value={draft.teacher_score}
                            disabled={isLegacy}
                            aria-label={`第 ${index + 1} 题老师打分`}
                            onChange={(event) =>
                              setDraft(question.id, { teacher_score: event.target.value })
                            }
                          />
                        </FormField>
                        <FormField label="老师评语">
                          <Textarea
                            rows={2}
                            value={draft.teacher_comment}
                            disabled={isLegacy}
                            aria-label={`第 ${index + 1} 题老师评语`}
                            placeholder="这道题的批注"
                            onChange={(event) =>
                              setDraft(question.id, { teacher_comment: event.target.value })
                            }
                          />
                        </FormField>
                      </div>

                      <div className="text-xs text-fg-3">
                        当前生效分数：{answer?.score ?? '未评分'}
                        {answer?.is_correct === 1 ? ' · 判定正确' : answer?.is_correct === 0 ? ' · 判定错误' : ''}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <FormField label="总评分语" hint="学生会在这份作业的结果页看到">
              <Textarea
                rows={3}
                value={feedback}
                disabled={isLegacy}
                placeholder="写给这名学生的话"
                onChange={(event) => setFeedback(event.target.value)}
              />
            </FormField>
          </div>
        </SectionCard>
      )}
    </PageScaffold>
  );
}
