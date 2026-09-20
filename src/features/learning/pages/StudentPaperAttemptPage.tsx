import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LoaderCircle, Save, Send, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { paperSubmissionsApi, type PaperSubmission } from '@/features/learning/api/paperSubmissionsApi';
import type { PaperItem } from '@/features/learning/api/papersApi';

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

  if (!paperId) return <div className="text-ink-3">无效试卷</div>;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-ink-3">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        正在初始化作答...
      </div>
    );
  }

  if (!submission) return <div className="text-ink-3">无法开始该试卷</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost"
          onClick={() => navigate('/student/papers')}
          className="px-4 py-2 rounded-card text-sm font-medium bg-muted/50 text-ink-2 border border-gray-200 hover:bg-muted/50 flex items-center"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving || submitting || !!result}
            className="px-4 py-2 rounded-card text-sm font-semibold bg-muted/50 text-ink-2 border border-gray-200 hover:bg-muted/50 disabled:opacity-50 flex items-center"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? '保存中...' : '保存'}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !!result}
            className="px-4 py-2 rounded-card text-sm font-semibold bg-gradient-to-r from-primary to-cyan-500 text-white shadow-card disabled:opacity-50 flex items-center"
          >
            <Send className="w-4 h-4 mr-2" />
            {submitting ? '提交中...' : '提交'}
          </Button>
        </div>
      </div>

      {result && (
        <div className="bg-success/10 border border-success/20 rounded-panel p-6">
          <div className="text-lg font-bold text-emerald-800 mb-2">提交成功</div>
          <div className="text-sm text-success">
            得分：{result.total_score} · 正确：{result.correct_count} · 错误：{result.wrong_count}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost"
              onClick={() => navigate('/student/wrong-questions')}
              className="px-4 py-2 rounded-card text-sm font-medium bg-paper/70 border border-success/20 text-emerald-800 hover:bg-paper"
            >
              去错题本
            </Button>
            <Button variant="ghost"
              onClick={() => navigate('/student/plan')}
              className="px-4 py-2 rounded-card text-sm font-medium bg-paper/70 border border-success/20 text-emerald-800 hover:bg-paper"
            >
              看学习计划
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {items.map((it) => (
          <div key={it.id} className="bg-paper/80 backdrop-blur-xl p-6 rounded-panel border border-white/60 shadow-card">
            <div className="text-sm font-bold text-ink-1 mb-2">第 {it.order_no} 题</div>
            <div className="text-ink-2 whitespace-pre-wrap">{it.questions?.stem ?? ''}</div>
            <textarea
              value={answers[it.id] ?? ''}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [it.id]: e.target.value }))}
              disabled={!!result}
              placeholder="请输入你的答案"
              className="mt-4 w-full px-4 py-3 rounded-card border border-border bg-paper/60 outline-none min-h-[96px] disabled:opacity-50"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
