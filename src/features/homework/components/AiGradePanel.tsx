import { useState } from 'react';
import { Bot, ShieldAlert, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type {
  HomeworkAiGradeResult,
  HomeworkQuestion,
} from '@thinkclass/contracts/domains/homework';

import { useAiGradeMutation } from '../hooks/useHomework';

/** `0.82` -> `82%`; a null confidence is the provider declining, not a zero. */
function formatConfidence(confidence: number | null | undefined): string {
  if (confidence === null || confidence === undefined) return '未给出';
  return `${Math.round(confidence * 100)}%`;
}

/**
 * AI 判分面板.
 *
 * Three rules are visible in this component rather than being left to the reader:
 *
 *   1. **AI is an assist, never a grade.** Every line the model produced is drawn with the
 *      `AI 建议` badge and a dashed border, next to - never instead of - the teacher's own
 *      inputs in the grading panel.
 *   2. **`available: false` is a first-class answer.** The route returns 200 with
 *      `data.ai.available === false` when no model is configured (the default install runs the
 *      deterministic mock), so the panel prints `ai.message` in full instead of implying a
 *      model graded the paper. A silent no-op is exactly the failure the contract's
 *      `_ai_note` is written against.
 *   3. **`overwrite_teacher` defaults to off and cannot be switched on by accident.** Turning
 *      the toggle on is an explicit confirmation, and while it is on the panel says in words
 *      that AI scores will replace the teacher's.
 *
 * The call always scopes to one submission (`submission_ids: [id]`); the batch form of the
 * route exists but nothing on this page uses it, so a single 判分 click can only ever touch the
 * paper in front of the teacher.
 */
export interface AiGradePanelProps {
  homeworkId: number;
  submissionId: number;
  /** For 第 N 题 labels. Without it a line falls back to the raw question id. */
  questions?: HomeworkQuestion[];
  /** The refreshed answers, so the page's grading inputs can pick up the AI columns. */
  onGraded?: (result: HomeworkAiGradeResult) => void;
  disabled?: boolean;
  className?: string;
}

export function AiGradePanel({
  homeworkId,
  submissionId,
  questions = [],
  onGraded,
  disabled = false,
  className,
}: AiGradePanelProps) {
  const [overwriteTeacher, setOverwriteTeacher] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<HomeworkAiGradeResult | null>(null);
  const aiGrade = useAiGradeMutation();

  const questionLabel = (questionId: number): string => {
    const index = questions.findIndex((question) => question.id === questionId);
    return index >= 0 ? `第 ${index + 1} 题` : `题目 #${questionId}`;
  };

  const runGrade = async () => {
    try {
      const response = await aiGrade.mutateAsync({
        homeworkId,
        payload: { submission_ids: [submissionId], overwrite_teacher: overwriteTeacher },
      });
      setResult(response.data);
      onGraded?.(response.data);
      if (response.data.ai.available) {
        toast.success('AI 判分已完成，结果仅作为建议');
      } else {
        toast.warning('AI 未参与判分，请查看面板说明');
      }
    } catch {
      // The api layer already surfaced the failure; the panel keeps its previous result.
    }
  };

  return (
    <div
      data-slot="ai-grade-panel"
      className={cn('space-y-4 rounded-panel border border-line-1 bg-surface-2 p-4 shadow-card', className)}
    >
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-4 text-role-ink" />
        <h3 className="text-sm font-semibold text-fg-1">AI 判分</h3>
        <Badge variant="info">建议</Badge>
      </div>

      <p className="text-xs text-fg-3">
        AI 只提出建议分数与评语，不会直接成为学生看到的成绩。老师确认或修改后，以老师填写的分数为准。
      </p>

      <FormField
        inline
        label="覆盖老师已打的分数（overwrite_teacher）"
        hint="默认关闭：关闭时，老师已经打过分的小题会保留原来的分数。"
      >
        <Checkbox
          aria-label="覆盖老师已打的分数"
          checked={overwriteTeacher}
          disabled={disabled || aiGrade.isPending}
          onCheckedChange={(checked) => {
            // Turning it ON is the decision that needs consent, so it asks; turning it OFF is
            // always safe and never asks.
            if (checked === true) setConfirmOpen(true);
            else setOverwriteTeacher(false);
          }}
        />
      </FormField>

      {overwriteTeacher ? (
        <div className="flex items-start gap-2 rounded-card border border-danger/30 bg-danger-soft p-3 text-xs text-danger-ink">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          已开启覆盖：本次 AI 判分会写入所有小题，替换老师已经打过的分数。
        </div>
      ) : null}

      <Button
        type="button"
        className="w-full"
        disabled={disabled || aiGrade.isPending}
        onClick={() => void runGrade()}
      >
        {aiGrade.isPending ? <Spinner size="sm" label="正在请求 AI 判分" /> : <Bot data-icon="inline-start" aria-hidden="true" />}
        {aiGrade.isPending ? 'AI 判分中...' : '开始 AI 判分'}
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
              {result.ai.available ? 'AI 已给出建议' : 'AI 未参与判分'}
              <span className="ml-2 font-normal opacity-80">来源：{result.ai.source}</span>
            </div>
            {/* The message is rendered whatever `available` says: when the mock declined, this
                line is the only explanation the operator gets. */}
            <p className="mt-1 whitespace-pre-wrap">{result.ai.message}</p>
            <p className="mt-1 opacity-80">整体置信度：{formatConfidence(result.ai.confidence)}</p>
          </div>

          {result.submission.ai_feedback ? (
            <div className="rounded-card border border-dashed border-line-2 bg-surface-3/40 p-3">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-fg-2">
                <Badge variant="info">AI 总评</Badge>
              </div>
              <p className="whitespace-pre-wrap text-xs text-fg-2">{result.submission.ai_feedback}</p>
            </div>
          ) : null}

          <ul className="space-y-3">
            {result.answers.map((answer) => (
              <li
                key={answer.id}
                className="space-y-2 rounded-card border border-dashed border-line-2 bg-surface-3/40 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-fg-1">{questionLabel(answer.question_id)}</span>
                  <Badge variant="info">AI 建议 {answer.ai_score === null ? '未评分' : `${answer.ai_score} 分`}</Badge>
                </div>
                {answer.ai_comment ? (
                  <p className="whitespace-pre-wrap text-xs text-fg-2">{answer.ai_comment}</p>
                ) : (
                  <p className="text-xs text-fg-3">AI 没有给出评语。</p>
                )}
                <div className="flex items-center gap-2">
                  <Progress
                    value={Math.round((answer.ai_confidence ?? 0) * 100)}
                    label={`${questionLabel(answer.question_id)} 的 AI 置信度`}
                    tone={(answer.ai_confidence ?? 0) >= 0.7 ? 'info' : 'warning'}
                    className="flex-1"
                  />
                  <span className="shrink-0 text-xs text-fg-3">置信度 {formatConfidence(answer.ai_confidence)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive
        title="开启覆盖老师分数？"
        description="开启后，本次 AI 判分会写入每一道小题，包括老师已经打过分的小题，老师原来的分数会被替换。确认要开启吗？"
        confirmLabel="开启覆盖"
        cancelLabel="保持关闭"
        onConfirm={() => {
          setOverwriteTeacher(true);
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}

export default AiGradePanel;
