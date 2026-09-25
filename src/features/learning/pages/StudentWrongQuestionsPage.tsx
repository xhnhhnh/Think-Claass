import { useState } from 'react';
import { CheckCircle2, FileText, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';

import { wrongQuestionsApi } from '@/features/learning/api/wrongQuestionsApi';
import { useWrongQuestions } from '@/features/learning/hooks/useWrongQuestions';

/**
 * 错题本.
 *
 * A `list` page: the intro card that repeated the page title is gone - the shell's
 * context bar prints it - and its one line of copy moved into the scaffold's
 * description slot. The two mutations, the query invalidation and the expansion
 * state are untouched; the surfaces and the two buttons are on the tokens.
 */
export default function StudentWrongQuestions() {
  const queryClient = useQueryClient();
  const { data: wrongs = [], isLoading } = useWrongQuestions();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [generated, setGenerated] = useState<Record<number, any[]>>({});

  const handleGenerate = async (id: number) => {
    try {
      const data = await wrongQuestionsApi.generate(id);
      setGenerated((prev) => ({ ...prev, [id]: data.data }));
      setExpandedId(id);
    } catch (e) {}
  };

  const handleMarkCorrect = async (id: number) => {
    try {
      await wrongQuestionsApi.attempt(id, { is_correct: 1, practice_source: 'manual' });
      await queryClient.invalidateQueries({ queryKey: ['wrong-questions', 'my'] });
      toast.success('已记录一次正确');
    } catch (e) {}
  };

  if (isLoading) {
    return (
      <PageScaffold variant="list" className="flex items-center justify-center py-20">
        <div className="flex items-center justify-center gap-3 text-fg-3">
          <Spinner size="lg" label="正在加载错题本" />
          正在加载错题本...
        </div>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="list"
      title="错题本"
      description="系统会根据错题推荐相似题，并逐步生成你的练习计划"
    >
      {wrongs.length === 0 ? (
        <EmptyState icon={FileText} title="暂无错题" />
      ) : (
        <div className="space-y-4">
          {wrongs.map((w) => (
            <div
              key={w.id}
              className="rounded-panel border border-line-1 bg-surface-2 p-6 shadow-card transition-colors hover:border-role/30"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-bold text-fg-1">{w.questions.stem}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="warning">错误次数：{w.wrong_count}</Badge>
                    <Badge variant="info">掌握度：{w.mastery_score ?? 0}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:shrink-0">
                  <Button variant="outline" onClick={() => handleGenerate(w.id)}>
                    <Sparkles aria-hidden="true" className="size-4" />
                    相似题
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleMarkCorrect(w.id)}
                    className="border-success/30 text-success-ink hover:bg-success-soft hover:text-success-ink"
                  >
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                    我已掌握
                  </Button>
                </div>
              </div>

              {expandedId === w.id && (
                <div className="mt-4 rounded-card border border-line-2 bg-surface-3/50 p-4">
                  <div className="mb-2 text-sm font-bold text-fg-2">推荐题</div>
                  {generated[w.id]?.length ? (
                    <div className="space-y-2">
                      {generated[w.id].map((q) => (
                        <div
                          key={q.id}
                          className="rounded-card border border-line-1 bg-surface-2 p-4"
                        >
                          <div className="text-sm font-semibold text-fg-1">{q.stem}</div>
                          <div className="mt-1 text-xs text-fg-3">题型：{q.type}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-fg-3">暂无可推荐题目</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageScaffold>
  );
}
