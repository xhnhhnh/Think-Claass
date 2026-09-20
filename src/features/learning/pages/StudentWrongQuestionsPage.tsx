import { useState } from 'react';
import { LoaderCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { wrongQuestionsApi } from '@/features/learning/api/wrongQuestionsApi';
import { useWrongQuestions } from '@/features/learning/hooks/useWrongQuestions';

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
      <div className="flex items-center justify-center py-20 text-ink-3">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        正在加载错题本...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-paper/80 backdrop-blur-xl p-6 rounded-panel border border-white/60 shadow-card">
        <div className="text-lg font-bold text-ink-1 mb-2">错题本</div>
        <div className="text-sm text-ink-3">系统会根据错题推荐相似题，并逐步生成你的练习计划</div>
      </div>

      {wrongs.length === 0 && <div className="py-16 text-center text-ink-3">暂无错题</div>}

      {wrongs.length > 0 && (
        <div className="space-y-4">
          {wrongs.map((w) => (
            <div key={w.id} className="bg-paper/80 backdrop-blur-xl p-6 rounded-panel border border-white/60 shadow-card">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-ink-1 truncate">{w.questions.stem}</div>
                  <div className="text-sm text-ink-3">
                    错误次数：{w.wrong_count} · 掌握度：{w.mastery_score ?? 0}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost"
                    onClick={() => handleGenerate(w.id)}
                    className="px-4 py-2 rounded-card text-sm font-medium bg-primary/5 text-primary border border-primary/10 hover:bg-primary/10 flex items-center"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    相似题
                  </Button>
                  <Button variant="ghost"
                    onClick={() => handleMarkCorrect(w.id)}
                    className="px-4 py-2 rounded-card text-sm font-medium bg-success/10 text-success border border-success/20 hover:bg-success/20 flex items-center"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    我已掌握
                  </Button>
                </div>
              </div>

              {expandedId === w.id && (
                <div className="mt-4">
                  <div className="text-sm font-bold text-ink-2 mb-2">推荐题</div>
                  {generated[w.id]?.length ? (
                    <div className="space-y-2">
                      {generated[w.id].map((q) => (
                        <div key={q.id} className="bg-paper/70 border border-white/60 rounded-panel p-4">
                          <div className="text-sm font-semibold text-ink-1">{q.stem}</div>
                          <div className="text-xs text-ink-3">题型：{q.type}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-ink-3">暂无可推荐题目</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
