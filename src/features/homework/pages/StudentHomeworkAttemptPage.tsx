import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Lock, Save, Send } from 'lucide-react';
import { toast } from 'sonner';

import { useRegisterPageCommands } from '@/app/commands/registry';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Progress } from '@/components/ui/progress';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type {
  HomeworkAnswerInput,
  HomeworkAnswerValue,
  HomeworkAttemptDetail,
  HomeworkPhoto,
  HomeworkQuestion,
} from '@thinkclass/contracts/domains/homework';

import { AiQaPanel } from '../components/AiQaPanel';
import { PhotoUploader } from '../components/PhotoUploader';
import { QuestionRenderer } from '../components/QuestionRenderer';
import { useSaveAnswersMutation, useStartAttemptMutation, useSubmitAttemptMutation } from '../hooks/useHomework';

/** How long the page waits after the last keystroke before writing to the server. */
const AUTOSAVE_DELAY_MS = 1200;

/** "已保存 14:32" - the student needs to see that their work is not only on this screen. */
function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Only the answers that carry something are sent: an empty box is not an answer. */
function toAnswerInputs(
  answers: Record<number, HomeworkAnswerValue>,
  questionIds: number[],
): HomeworkAnswerInput[] {
  return questionIds
    .filter((questionId) => {
      const value = answers[questionId];
      if (!value) return false;
      return (value.text ?? '').trim().length > 0 || (value.choice ?? []).length > 0 || (value.photo_ids ?? []).length > 0;
    })
    .map((questionId) => ({ question_id: questionId, value: answers[questionId] }));
}

/**
 * 作业作答.
 *
 * The `form` variant, so 保存 and 提交 are the scaffold's sticky footer and stay reachable on a
 * phone at the bottom of a long paper - the same shape `StudentPaperAttemptPage` uses.
 *
 * ## Auto-save
 *
 * Answers are written back through `PUT /api/homework/submissions/:id/answers` 1.2s after the
 * last change, and the state line in the footer says so. The write is skipped when the payload
 * is byte-identical to the last successful one, which is what keeps a re-render (or a photo
 * upload that changed nothing else) from producing a redundant request.
 *
 * ## Locked states
 *
 * Every input is disabled unless the submission is `draft` or `returned` - the only two statuses
 * a student may edit from. `submitted` shows 已提交 and `graded` shows 已批改 with a link to the
 * result page, and both hide the 提交 button instead of offering one that the server would
 * refuse. A `legacy` homework is refused by the attempt route at all, so that path renders the
 * load failure rather than pretending there is a paper to answer.
 *
 * ## Photos
 *
 * Two scopes, both on the same route: whole-submission photos (sent as `photo_ids` on submit)
 * and per-question photos (attached to that answer's `photo_ids`), which is exactly how the
 * contract splits them. `HomeworkPhoto` has no `question_id` - a question-scoped photo is a
 * reference from the answer, so the uploader hands the created row back and the page decides.
 */
export default function StudentHomeworkAttempt() {
  const { id } = useParams();
  const homeworkId = id ? Number(id) : null;
  const navigate = useNavigate();

  const startAttempt = useStartAttemptMutation();
  const saveAnswers = useSaveAnswersMutation();
  const submitAttempt = useSubmitAttemptMutation();

  const [attempt, setAttempt] = useState<HomeworkAttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, HomeworkAnswerValue>>({});
  const [photos, setPhotos] = useState<HomeworkPhoto[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  /** The payload of the last successful write, so an identical one is skipped. */
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    if (!homeworkId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    startAttempt
      .mutateAsync(homeworkId)
      .then((response) => {
        if (cancelled) return;
        const data = response.data;
        const seeded: Record<number, HomeworkAnswerValue> = {};
        for (const answer of data.answers) seeded[answer.question_id] = answer.value ?? {};
        setAttempt(data);
        setAnswers(seeded);
        setPhotos(data.photos ?? []);
        lastSavedRef.current = JSON.stringify(toAnswerInputs(seeded, data.homework.questions.map((question) => question.id)));
      })
      .catch(() => {
        if (!cancelled) setLoadError('这份作业现在打不开。可能是老师已经删除，或者作业还没有发布。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `startAttempt` is intentionally not a dependency: a mutation object is a new identity on
    // every render, and the attempt must be started exactly once per homework id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeworkId]);

  /*
   * Annotated rather than inferred from `?? []`: a bare `[]` widens to `never[]`, and the
   * resulting union of array types makes the `.map` below depend on how TypeScript resolves two
   * method signatures instead of on the contract.
   */
  const questions: HomeworkQuestion[] = attempt?.homework.questions ?? [];
  const submission = attempt?.submission ?? null;
  const editable = submission?.status === 'draft' || submission?.status === 'returned';
  const answeredCount = questions.filter((question) => {
    const value = answers[question.id];
    if (!value) return false;
    return (value.text ?? '').trim().length > 0 || (value.choice ?? []).length > 0 || (value.photo_ids ?? []).length > 0;
  }).length;

  /** Photos already referenced by a question's answer are not whole-paper photos. */
  const submissionPhotos = useMemo(() => {
    const referenced = new Set<number>();
    for (const value of Object.values(answers)) {
      for (const photoId of value.photo_ids ?? []) referenced.add(photoId);
    }
    return photos.filter((photo) => !referenced.has(photo.id));
  }, [answers, photos]);

  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);

  const answersKey = useMemo(() => JSON.stringify(toAnswerInputs(answers, questions.map((question) => question.id))), [answers, questions]);

  const persist = async (submissionId: number, payload: HomeworkAnswerInput[], key: string) => {
    setSaveState('saving');
    try {
      await saveAnswers.mutateAsync({ submissionId, payload: { answers: payload } });
      lastSavedRef.current = key;
      setSaveState('saved');
      setSavedAt(new Date());
    } catch {
      setSaveState('error');
    }
  };

  /*
   * The debounced write.
   *
   * The closure captures the render's `answers`, which is the value `answersKey` was derived
   * from - so the request body and the key that records it are always the same snapshot.
   */
  useEffect(() => {
    if (!editable || !submission) return;
    if (answersKey === lastSavedRef.current) return;

    const timer = window.setTimeout(() => {
      void persist(submission.id, JSON.parse(answersKey) as HomeworkAnswerInput[], answersKey);
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
    // `persist` is re-created every render on purpose: it closes over the mutation, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answersKey, editable, submission]);

  const saveNow = async () => {
    if (!submission || !editable) return;
    await persist(submission.id, JSON.parse(answersKey) as HomeworkAnswerInput[], answersKey);
    toast.success('已保存');
  };

  const handleSubmit = async () => {
    if (!submission) return;
    setConfirmSubmitOpen(false);
    const payload = JSON.parse(answersKey) as HomeworkAnswerInput[];
    try {
      await saveAnswers.mutateAsync({ submissionId: submission.id, payload: { answers: payload } });
      lastSavedRef.current = answersKey;
      const response = await submitAttempt.mutateAsync({
        submissionId: submission.id,
        payload: { answers: payload, photo_ids: submissionPhotos.map((photo) => photo.id) },
      });
      setAttempt(response.data);
      toast.success('已提交，等待老师批改');
    } catch {
      // The api layer already surfaced the failure; the page stays editable so the retry is one tap.
    }
  };

  /** The latest handlers, so a palette command acts on the answers as they are now. */
  const handlers = useRef({ save: saveNow, submit: handleSubmit });
  useEffect(() => {
    handlers.current = { save: saveNow, submit: handleSubmit };
  });

  useRegisterPageCommands([
    {
      id: 'homework-attempt:save',
      label: '保存作答',
      icon: Save,
      disabled: !editable || saveAnswers.isPending,
      run: () => void handlers.current.save(),
    },
    {
      id: 'homework-attempt:submit',
      label: '提交作业',
      icon: Send,
      disabled: !editable || submitAttempt.isPending,
      run: () => void handlers.current.submit(),
    },
  ]);

  if (!homeworkId) {
    return (
      <PageScaffold variant="form">
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          无效的作业编号
        </div>
      </PageScaffold>
    );
  }

  if (loading) {
    return (
      <PageScaffold variant="form" className="flex items-center justify-center py-20">
        <div className="flex items-center justify-center gap-3 text-fg-3">
          <Spinner size="lg" label="正在准备作业" />
          正在准备作业...
        </div>
      </PageScaffold>
    );
  }

  if (!attempt || !submission) {
    return (
      <PageScaffold
        variant="form"
        actions={
          <Button variant="outline" onClick={() => navigate('/student/homework')}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            返回
          </Button>
        }
      >
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          {loadError ?? '这份作业现在打不开。'}
        </div>
      </PageScaffold>
    );
  }

  const saveLabel =
    saveState === 'saving'
      ? '正在保存...'
      : saveState === 'error'
        ? '自动保存失败，请点「保存」重试'
        : savedAt
          ? `已保存 ${formatTime(savedAt)}`
          : editable
            ? '改动会自动保存'
            : '';

  return (
    <PageScaffold
      variant="form"
      title={attempt.homework.title}
      description={attempt.homework.description ?? undefined}
      actions={
        <Button variant="outline" onClick={() => navigate('/student/homework')}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回
        </Button>
      }
      footer={
        editable ? (
          <>
            <span className="mr-auto text-xs text-fg-3">{saveLabel}</span>
            <Button
              type="button"
              variant="outline"
              disabled={saveAnswers.isPending || submitAttempt.isPending}
              onClick={() => void saveNow()}
            >
              <Save aria-hidden="true" className="size-4" />
              保存
            </Button>
            <Button
              type="button"
              disabled={submitAttempt.isPending}
              onClick={() => setConfirmSubmitOpen(true)}
            >
              <Send aria-hidden="true" className="size-4" />
              {submitAttempt.isPending ? '提交中...' : '提交'}
            </Button>
          </>
        ) : (
          <>
            <span className="mr-auto flex items-center gap-2 text-sm text-fg-2">
              <Lock aria-hidden="true" className="size-4" />
              {submission.status === 'graded' ? '已批改，不能再修改' : '已提交，等待老师批改'}
            </span>
            {submission.status === 'graded' ? (
              <Button type="button" onClick={() => navigate(`/student/homework/${homeworkId}/result`)}>
                查看结果
              </Button>
            ) : null}
          </>
        )
      }
    >
      <div className="space-y-3">
        <div
          className={
            submission.status === 'graded'
              ? 'flex flex-wrap items-center gap-3 rounded-panel border border-success/30 bg-success-soft p-4 text-sm text-success-ink'
              : submission.status === 'submitted'
                ? 'flex flex-wrap items-center gap-3 rounded-panel border border-info/30 bg-info-soft p-4 text-sm text-info-ink'
                : 'flex flex-wrap items-center gap-3 rounded-panel border border-line-1 bg-surface-2 p-4 text-sm text-fg-2'
          }
        >
          {submission.status === 'graded' ? (
            <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
          ) : null}
          <Badge variant={submission.status === 'graded' ? 'success' : submission.status === 'submitted' ? 'info' : 'secondary'}>
            {submission.status === 'graded' ? '已批改' : submission.status === 'submitted' ? '已提交' : '作答中'}
          </Badge>
          <span>共 {questions.length} 题，已作答 {answeredCount} 题</span>
          {submission.status === 'graded' ? (
            <span className="font-semibold">
              得分 {submission.score ?? '—'} / {submission.total_points}
            </span>
          ) : null}
        </div>

        <Progress
          value={questions.length === 0 ? 0 : Math.round((answeredCount / questions.length) * 100)}
          label="作答进度"
          tone={answeredCount === questions.length && questions.length > 0 ? 'success' : 'info'}
        />
      </div>

      {questions.length === 0 ? (
        <SectionCard title="这次的作业" description="以拍照提交为主">
          <p className="text-sm text-fg-2">
            这份作业没有逐题作答，把作业拍下来上传就可以了。
          </p>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <QuestionRenderer
              key={question.id}
              question={question}
              index={index + 1}
              value={answers[question.id]}
              disabled={!editable}
              onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
              footer={
                editable ? (
                  <PhotoUploader
                    submissionId={submission.id}
                    label={`第 ${index + 1} 题的照片（可选）`}
                    hint="手写过程拍下来，老师更容易看懂你的思路"
                    photos={(answers[question.id]?.photo_ids ?? [])
                      .map((photoId) => photoById.get(photoId))
                      .filter((photo): photo is HomeworkPhoto => !!photo)}
                    onUploaded={(photo) =>
                      setAnswers((prev) => {
                        const current = prev[question.id] ?? {};
                        return {
                          ...prev,
                          [question.id]: { ...current, photo_ids: [...(current.photo_ids ?? []), photo.id] },
                        };
                      })
                    }
                  />
                ) : (answers[question.id]?.photo_ids ?? []).length > 0 ? (
                  <p className="text-xs text-fg-3">这道题附了 {(answers[question.id]?.photo_ids ?? []).length} 张照片。</p>
                ) : null
              }
            />
          ))}
        </div>
      )}

      <SectionCard title="整张试卷的照片" description="拍照提交的作业直接传到这里">
        <PhotoUploader
          submissionId={submission.id}
          label="上传整张试卷照片"
          hint="支持常见图片格式，一次一张，可以传多张"
          disabled={!editable}
          photos={submissionPhotos}
          onUploaded={(photo) => setPhotos((prev) => [...prev, photo])}
        />
      </SectionCard>

      <SectionCard title="有不懂的地方可以问" description="助手会解释题意，不会直接代写答案">
        <AiQaPanel homeworkId={homeworkId} questions={questions} />
      </SectionCard>

      {!editable ? (
        <FormField label="老师评语">
          <Textarea rows={3} disabled value={submission.teacher_feedback ?? '老师还没有写评语。'} />
        </FormField>
      ) : null}

      <ConfirmDialog
        open={confirmSubmitOpen}
        onOpenChange={setConfirmSubmitOpen}
        title="确认提交作业？"
        description={`还有 ${Math.max(questions.length - answeredCount, 0)} 题没有作答。提交后需要老师退回才能修改。`}
        confirmLabel="确认提交"
        pendingLabel="提交中..."
        isPending={submitAttempt.isPending}
        onConfirm={handleSubmit}
      />
    </PageScaffold>
  );
}
