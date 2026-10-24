import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { toast } from 'sonner';

import { useRegisterPageCommands } from '@/app/commands/registry';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api';

import { paperSubmissionsApi, type PaperSubmission } from '@/features/learning/api/paperSubmissionsApi';
import type { PaperItem } from '@/features/learning/api/papersApi';

/**
 * 试卷作答.
 *
 * The `form` variant, so `保存` and `提交` are the scaffold's sticky footer and are
 * always reachable on a phone instead of sitting in a row at the top of a long
 * paper. `返回` is the page's secondary action and rides in the context bar.
 *
 * Both actions are registered as palette commands as well. They run through a ref
 * holding the latest handlers rather than through the render's closure, because the
 * payload is read from `answers`: the registry re-registers on a structural key
 * (`id` + `disabled`), so a captured closure would submit the answers as they were
 * when the command was registered. The start call, the save call, the submit call,
 * the labels and the disabled conditions are unchanged.
 */
export default function StudentPaperAttempt() {
  const { id } = useParams();
  const paperId = id ? Number(id) : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [submission, setSubmission] = useState<PaperSubmission | null>(null);
  const [items, setItems] = useState<PaperItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [result, setResult] = useState<{ total_score: number; correct_count: number; wrong_count: number } | null>(null);

  const answerPayload = useMemo(
    () =>
      Object.entries(answers).map(([paperItemId, value]) => ({
        paper_item_id: Number(paperItemId),
        answer_json: value ?? '',
      })),
    [answers],
  );

  /**
   * Start or resume the attempt.
   *
   * `start` now answers the open submission (same id) and the answers already saved on it, so a
   * student who leaves and comes back sees their own work instead of a blank sheet. A failure is
   * kept apart from "this paper cannot be opened": the message stays on screen with a retry rather
   * than leaving the student on a dead page.
   */
  useEffect(() => {
    if (!paperId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    paperSubmissionsApi
      .start(paperId)
      .then((data) => {
        if (cancelled) return;
        setSubmission(data.data.submission);
        setItems(data.data.items);
        const seeded: Record<number, string> = {};
        for (const saved of data.data.answers ?? []) {
          if (typeof saved.answer_json === 'string' && saved.answer_json !== '') {
            seeded[saved.paper_item_id] = saved.answer_json;
          }
        }
        setAnswers(seeded);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(error, '试卷没有加载出来，请重试。'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paperId, reloadNonce]);

  const handleSave = async () => {
    if (!submission) return;
    if (!answerPayload.length) {
      toast.error('请先作答');
      return;
    }
    setSaving(true);
    try {
      await paperSubmissionsApi.saveAnswers(submission.id, answerPayload);
      toast.success('已保存');
    } catch (e) {
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!submission) return;
    setConfirmSubmitOpen(false);
    setSubmitting(true);
    try {
      if (answerPayload.length) {
        await paperSubmissionsApi.saveAnswers(submission.id, answerPayload);
      }
      const data = await paperSubmissionsApi.submit(submission.id);
      /**
       * Submitting a paper writes into two other pages.
       *
       * `learning.submitPaper` bumps the wrong-question book and appends study-plan items server
       * side, and this page navigates straight to those two screens on the result card. Without
       * these invalidations they render their five-minute-stale copies - i.e. the pupil arrives at
       * 「错题本」 and does not find the mistake they just made.
       */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wrong-questions', 'my'] }),
        queryClient.invalidateQueries({ queryKey: ['study-plan', 'my'] }),
      ]);
      setResult({
        total_score: data.data.total_score,
        correct_count: data.data.correct_count,
        wrong_count: data.data.wrong_count,
      });
      toast.success('已提交');
    } catch (e) {
    } finally {
      setSubmitting(false);
    }
  };

  // The latest handlers, so a command run from the palette acts on the answers as
  // they are now rather than on the render that registered it.
  const requestSubmit = () => setConfirmSubmitOpen(true);
  const handlers = useRef({ save: handleSave, submit: requestSubmit });
  useEffect(() => {
    handlers.current = { save: handleSave, submit: requestSubmit };
  });

  useRegisterPageCommands([
    {
      id: 'paper-attempt:save',
      label: '保存作答',
      icon: Save,
      disabled: saving || submitting || !!result,
      run: () => void handlers.current.save(),
    },
    {
      id: 'paper-attempt:submit',
      label: '提交试卷',
      icon: Send,
      disabled: submitting || !!result,
      run: () => void handlers.current.submit(),
    },
  ]);

  if (!paperId) {
    return (
      <PageScaffold variant="form">
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          无效试卷
        </div>
      </PageScaffold>
    );
  }

  if (loading) {
    return (
      <PageScaffold variant="form" className="flex items-center justify-center py-20">
        <div className="flex items-center justify-center gap-3 text-fg-3">
          <Spinner size="lg" label="正在初始化作答" />
          正在初始化作答...
        </div>
      </PageScaffold>
    );
  }

  if (!submission) {
    return (
      <PageScaffold
        variant="form"
        actions={
          <Button variant="outline" onClick={() => navigate('/student/papers')}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            返回
          </Button>
        }
      >
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          <p className="font-semibold text-danger">{loadError ?? '无法开始该试卷'}</p>
          <p className="mt-1 text-sm text-fg-3">这不代表试卷被删除了，也有可能是刚才没请求成功。请重试。</p>
          <Button variant="outline" className="mt-3" onClick={() => setReloadNonce((nonce) => nonce + 1)}>
            重新加载
          </Button>
        </div>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="form"
      actions={
        <Button variant="outline" onClick={() => navigate('/student/papers')}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回
        </Button>
      }
      footer={
        <>
          <Button variant="outline" onClick={handleSave} disabled={saving || submitting || !!result}>
            <Save aria-hidden="true" className="size-4" />
            {saving ? '保存中...' : '保存'}
          </Button>
          <Button onClick={requestSubmit} disabled={submitting || !!result}>
            <Send aria-hidden="true" className="size-4" />
            {submitting ? '提交中...' : '提交'}
          </Button>
        </>
      }
    >
      {result && (
        <div className="rounded-panel border border-success/30 bg-success-soft p-6">
          <div className="mb-2 text-lg font-bold text-success-ink">提交成功</div>
          <div className="text-sm text-success-ink">
            得分：{result.total_score} · 正确：{result.correct_count} · 错误：{result.wrong_count}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/student/wrong-questions')}
              className="border-success/30 bg-surface-2 text-success-ink hover:text-success-ink"
            >
              去错题本
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/student/plan')}
              className="border-success/30 bg-surface-2 text-success-ink hover:text-success-ink"
            >
              看学习计划
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {items.map((it) => (
          <div key={it.id} className="rounded-panel border border-line-1 bg-surface-2 p-6 shadow-card">
            <div className="mb-2 text-sm font-bold text-fg-1">第 {it.order_no} 题</div>
            <div className="whitespace-pre-wrap text-fg-2">{it.questions?.stem ?? ''}</div>
            <Textarea
              value={answers[it.id] ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [it.id]: e.target.value }))}
              disabled={!!result}
              placeholder="请输入你的答案"
              className="mt-4 min-h-[96px]"
            />
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmSubmitOpen}
        onOpenChange={setConfirmSubmitOpen}
        title="确认提交试卷？"
        description="提交后不能再修改答案，老师会按这次提交批改。"
        confirmLabel="确认提交"
        pendingLabel="提交中..."
        isPending={submitting}
        onConfirm={handleSubmit}
      />
    </PageScaffold>
  );
}
