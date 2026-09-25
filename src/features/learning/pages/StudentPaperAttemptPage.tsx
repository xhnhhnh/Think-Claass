import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { toast } from 'sonner';

import { useRegisterPageCommands } from '@/app/commands/registry';
import { Button } from '@/components/ui/button';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

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

  const [submission, setSubmission] = useState<PaperSubmission | null>(null);
  const [items, setItems] = useState<PaperItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ total_score: number; correct_count: number; wrong_count: number } | null>(null);

  const answerPayload = useMemo(
    () =>
      Object.entries(answers).map(([paperItemId, value]) => ({
        paper_item_id: Number(paperItemId),
        answer_json: value ?? '',
      })),
    [answers],
  );

  useEffect(() => {
    if (!paperId) return;
    let cancelled = false;
    setLoading(true);
    paperSubmissionsApi
      .start(paperId)
      .then((data) => {
        if (cancelled) return;
        setSubmission(data.data.submission);
        setItems(data.data.items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paperId]);

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
    setSubmitting(true);
    try {
      if (answerPayload.length) {
        await paperSubmissionsApi.saveAnswers(submission.id, answerPayload);
      }
      const data = await paperSubmissionsApi.submit(submission.id);
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
  const handlers = useRef({ save: handleSave, submit: handleSubmit });
  useEffect(() => {
    handlers.current = { save: handleSave, submit: handleSubmit };
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
      <PageScaffold variant="form">
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          无法开始该试卷
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
          <Button onClick={handleSubmit} disabled={submitting || !!result}>
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
    </PageScaffold>
  );
}
