import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Send, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRegisterPageCommands } from '@/app/commands/registry';

import type { AiStudySetItem, AiStudySubmitResult } from '@/features/ai-study/api/aiStudyApi';
import {
  useMyAiStudySet,
  useSaveAiStudyAnswersMutation,
  useSubmitAiStudySetMutation,
} from '@/features/ai-study/hooks/useAiStudy';

/**
 * Answering one 智学练单.
 *
 * ## Why the set is read from `/my/sets/current` rather than by id
 *
 * A student has at most one open practice set - the partial unique index in the migration is what
 * makes that a fact rather than an assumption - so "the current set" *is* the by-id read for the
 * student, and a second read route would be a second way to answer the same question. The id in the
 * path is still checked against it: navigating back to a set that has since been submitted or
 * replaced shows "该练单已结束" rather than someone else's questions.
 *
 * ## What the student sees, and what they never see
 *
 * The question, its options and the reason it was chosen. Never the reference answer - the API does
 * not carry one (see the contracts' header) and the result screen reports the owner's verdict rather
 * than the key it was computed from. A subjective question is marked 待人工判断 instead of being
 * scored, because nothing in this system can mark prose and a guessed mark is worse than none.
 *
 * ## Choice answers are serialised as JSON
 *
 * A single-choice answer is sent as `"b"` (a JSON string, quotes included) and a multi-choice one as
 * `["b","d"]`, which is how the question bank stores its own keys - the owner's comparison parses
 * both sides, so this is the spelling that matches rather than a free-text rendering of it.
 */
export default function StudentAiStudyAttemptPage() {
  const { id } = useParams();
  const setId = id ? Number(id) : null;
  const navigate = useNavigate();

  const { data, isLoading } = useMyAiStudySet();
  const saveAnswers = useSaveAiStudyAnswersMutation();
  const submitSet = useSubmitAiStudySetMutation();

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<AiStudySubmitResult | null>(null);

  const set = data?.set ?? null;
  const isCurrentSet = !!set && set.id === setId;

  /** Seed the local answer map from what the server has saved, once, when the set arrives. */
  useEffect(() => {
    if (!isCurrentSet || !set) return;
    const seeded: Record<number, string> = {};
    for (const item of set.items) {
      if (item.answer?.value) seeded[item.id] = item.answer.value;
    }
    setAnswers(seeded);
    // Keyed on the set id only: re-seeding on every refetch would discard what the student is
    // typing between two invalidations.
  }, [isCurrentSet, set?.id]);

  const payload = useMemo(
    () =>
      Object.entries(answers)
        .filter(([, value]) => value.trim() !== '')
        .map(([itemId, value]) => ({ item_id: Number(itemId), value })),
    [answers],
  );

  const handleSave = async () => {
    if (!set) return;
    try {
      await saveAnswers.mutateAsync({ setId: set.id, answers: payload });
      toast.success('已保存作答');
    } catch {
      // `src/lib/api.ts` has already toasted the failure; the answers stay on screen.
    }
  };

  const handleSubmit = async () => {
    if (!set) return;
    try {
      const response = await submitSet.mutateAsync(set.id);
      setResult(response.data);
      toast.success('已提交，掌握度已更新');
    } catch {
      // Same: the submit either lands or the student can press again.
    }
  };

  // The latest handlers, so a command run from the palette acts on the answers as they are now
  // rather than on the render that registered it - the pattern `StudentPaperAttemptPage` uses.
  const handlers = useRef({ save: handleSave, submit: handleSubmit });
  useEffect(() => {
    handlers.current = { save: handleSave, submit: handleSubmit };
  });

  useRegisterPageCommands([
    {
      id: 'ai-study-attempt:save',
      label: '保存作答',
      icon: Save,
      disabled: saveAnswers.isPending || submitSet.isPending || !!result,
      run: () => void handlers.current.save(),
    },
    {
      id: 'ai-study-attempt:submit',
      label: '交卷',
      icon: Send,
      disabled: submitSet.isPending || !!result,
      run: () => void handlers.current.submit(),
    },
  ]);

  if (!setId) {
    return (
      <PageScaffold variant="form">
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          无效练单
        </div>
      </PageScaffold>
    );
  }

  if (isLoading) {
    return (
      <PageScaffold variant="form" className="flex items-center justify-center py-20">
        <div className="flex items-center justify-center gap-3 text-fg-3">
          <Spinner size="lg" label="正在加载练单" />
          正在加载练单...
        </div>
      </PageScaffold>
    );
  }

  if (!isCurrentSet || !set) {
    return (
      <PageScaffold
        variant="form"
        actions={
          <Button variant="outline" onClick={() => navigate('/student/ai-study')}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            返回 AI 智学
          </Button>
        }
      >
        <div className="rounded-panel border border-dashed border-line-1 bg-surface-2 py-16 text-center text-fg-3">
          该练单已结束或已被新的练单替代
        </div>
      </PageScaffold>
    );
  }

  const answeredCount = payload.length;

  return (
    <PageScaffold
      variant="form"
      title="智学练习"
      description={`共 ${set.items.length} 题，已作答 ${answeredCount} 题`}
      actions={
        <Button variant="outline" onClick={() => navigate('/student/ai-study')}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回
        </Button>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => void handleSave()} disabled={saveAnswers.isPending || !!result}>
            <Save aria-hidden="true" className="size-4" />
            {saveAnswers.isPending ? '保存中...' : '保存'}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitSet.isPending || !!result}>
            <Send aria-hidden="true" className="size-4" />
            {submitSet.isPending ? '提交中...' : '交卷'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {result ? (
          <SectionCard title="本次结果">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="success">答对 {result.correct} 题</Badge>
              {result.pending > 0 ? <Badge variant="warning">待人工判断 {result.pending} 题</Badge> : null}
              <span className="text-sm text-fg-3">共 {result.total} 题，错题的掌握度已回写到错题本。</span>
            </div>
          </SectionCard>
        ) : null}

        {set.items.map((item) => (
          <SectionCard
            key={item.id}
            title={`第 ${item.order_no} 题 · ${item.question.points} 分`}
            description={item.reason}
          >
            <div className="space-y-3">
              <p className="whitespace-pre-wrap font-semibold text-fg-1">{item.question.stem}</p>

              {item.question.options.length > 0 ? (
                <ul className="space-y-2">
                  {item.question.options.map((option) => {
                    const chosen = parseChoice(answers[item.id]).includes(option.id);
                    return (
                      <li key={option.id}>
                        <Button
                          type="button"
                          variant={chosen ? 'default' : 'outline'}
                          className="w-full justify-start"
                          aria-pressed={chosen}
                          disabled={!!result}
                          onClick={() => {
                            setAnswers((prev) => ({
                              ...prev,
                              [item.id]: serialiseChoice(item, option.id, prev[item.id]),
                            }));
                          }}
                        >
                          {option.id}. {option.text}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Textarea
                  rows={3}
                  value={answers[item.id] ?? ''}
                  disabled={!!result}
                  aria-label={`第 ${item.order_no} 题作答`}
                  placeholder="写下你的答案"
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [item.id]: event.target.value }))}
                />
              )}

              {result ? (
                <div className="text-sm text-fg-2">
                  {result.items.find((entry) => entry.item_id === item.id)?.is_correct === true ? (
                    <span className="flex items-center gap-1 text-success-ink">
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                      答对了
                    </span>
                  ) : result.items.find((entry) => entry.item_id === item.id)?.is_correct === false ? (
                    <span className="text-danger">答错了，已记入错题本</span>
                  ) : (
                    <span className="text-fg-3">待人工判断，未改动掌握度</span>
                  )}
                </div>
              ) : null}
            </div>
          </SectionCard>
        ))}
      </div>
    </PageScaffold>
  );
}

/**
 * The chosen option ids, read back out of a stored answer.
 *
 * Tolerant of the three spellings a stored answer can have - `"b"`, `["b","d"]`, and a bare `b` from
 * an answer written before this page existed - because the alternative is a page that silently shows
 * nothing selected for an answer the server did save. An unparseable value is treated as one raw id
 * rather than dropped, since dropping it would hide the student's own work from them.
 */
function parseChoice(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
    if (typeof parsed === 'string') return [parsed];
    return [];
  } catch {
    return [raw];
  }
}

/**
 * The stored spelling of a choice answer.
 *
 * Single choice replaces the previous pick; multi choice toggles one option in the set and keeps the
 * ids sorted, so the serialised answer does not depend on the order the student clicked. JSON, not a
 * joined string, because that is what the question owner's comparison parses - see the file header.
 */
function serialiseChoice(item: AiStudySetItem, optionId: string, previous: string | undefined): string {
  if (item.question.type !== 'multiple') return JSON.stringify(optionId);

  const current = parseChoice(previous);
  const next = current.includes(optionId)
    ? current.filter((entry) => entry !== optionId)
    : [...current, optionId];
  return JSON.stringify(next.sort());
}
