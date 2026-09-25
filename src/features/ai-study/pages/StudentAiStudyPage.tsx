import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BrainCircuit, ListChecks, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { useRegisterPageCommands } from '@/app/commands/registry';

import type { AiStudySetItem } from '@/features/ai-study/api/aiStudyApi';
import { useGenerateAiStudySetMutation, useMyAiStudySet } from '@/features/ai-study/hooks/useAiStudy';

/** What a question type is called on screen. Unknown types fall back to the raw value. */
const TYPE_LABEL: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  blank: '填空题',
  short: '简答题',
};

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

/**
 * The provenance strip every AI-bearing panel on this page prints.
 *
 * `available: false` is rendered with the server's own `message` verbatim rather than a nicer
 * paraphrase: that line names the console field an operator has to fill in, and rewriting it would
 * make the one actionable sentence in the feature unactionable. This is the same rule
 * `AiQuestionPanel` and `AiGradePanel` follow.
 */
function AiProvenance({ ai }: { ai: { available: boolean; source: string; message: string } }) {
  return (
    <div
      className={
        ai.available
          ? 'rounded-card border border-info/30 bg-info-soft p-3 text-xs text-info-ink'
          : 'rounded-card border border-warning/30 bg-warning-soft p-3 text-xs text-warning-ink'
      }
    >
      <div className="flex items-center gap-2 font-semibold">
        {ai.available ? (
          <Sparkles aria-hidden="true" className="size-3.5" />
        ) : (
          <AlertTriangle aria-hidden="true" className="size-3.5" />
        )}
        {ai.available ? '模型已参与排序' : '本次由本地规则智选'}
        <span className="font-normal opacity-80">来源：{ai.source}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap">{ai.message}</p>
    </div>
  );
}

/** One question as a preview line. The full question is rendered on the attempt page. */
function ItemRow({ item }: { item: AiStudySetItem }) {
  return (
    <li
      data-slot="ai-study-item"
      className="space-y-2 rounded-card border border-line-1 bg-surface-2 p-4 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-fg-3">第 {item.order_no} 题</span>
        <Badge variant="secondary">{typeLabel(item.question.type)}</Badge>
        <span className="text-xs text-fg-3">{item.question.points} 分</span>
        {item.ai_ranked ? <Badge variant="info">模型重排</Badge> : null}
      </div>
      <p className="whitespace-pre-wrap font-semibold text-fg-1">{item.question.stem}</p>
      {/* The reason is the feature's whole visible value: it is what turns "five questions" into
          "five questions for a stated reason", and it is generated from the winning factor rather
          than written freehand - see ai-study.engine.ts. */}
      <p className="text-sm text-fg-2">
        <span className="font-semibold text-role-ink">为什么选它：</span>
        {item.reason}
      </p>
    </li>
  );
}

/**
 * AI 智学 - the student's practice set.
 *
 * A `dashboard` page. Three states, and each one says something the others do not:
 *
 *   - a set exists: the questions, each with the reason it was chosen, and one button into the
 *     answering screen;
 *   - no set: 生成今日智学, plus the reason there is nothing yet (an empty question bank is the usual
 *     one, and it names where questions come from rather than blaming the student);
 *   - loading: a `Spinner` with the same label the text prints.
 */
export default function StudentAiStudyPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useMyAiStudySet();
  const generate = useGenerateAiStudySetMutation();

  const set = data?.set ?? null;
  const ai = data?.ai;

  const run = async () => {
    try {
      const response = await generate.mutateAsync({});
      const result = response.data;
      if (result.set) toast.success('已生成今日智学');
      // A refusal is not an error: the server answered 200 with a reason, and the panel below
      // prints it. Only the transport layer's own failures raise, and `src/lib/api.ts` has already
      // toasted those.
    } catch {
      // Kept as an empty catch on purpose - see above.
    }
  };

  useRegisterPageCommands([
    {
      id: 'ai-study:generate',
      label: '生成今日智学',
      icon: Sparkles,
      disabled: generate.isPending,
      run: () => void run(),
    },
  ]);

  if (isLoading) {
    return (
      <PageScaffold variant="dashboard" className="flex items-center justify-center py-20">
        <div className="flex items-center justify-center gap-3 text-fg-3">
          <Spinner size="lg" label="正在加载智学练单" />
          正在加载智学练单...
        </div>
      </PageScaffold>
    );
  }

  if (error) {
    return (
      <PageScaffold variant="dashboard" title="AI 智学">
        <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center text-danger">
          智学练单加载失败，请稍后重试
        </div>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="dashboard"
      title="AI 智学"
      description="按你的错题、知识点薄弱项和近期表现，为你挑出今天该练的几道题"
      actions={
        <Button onClick={() => void run()} disabled={generate.isPending}>
          <Sparkles data-icon="inline-start" aria-hidden="true" />
          {generate.isPending ? '正在生成...' : set ? '查看进行中的练单' : '生成今日智学'}
        </Button>
      }
    >
      <div className="space-y-4">
        {ai ? <AiProvenance ai={ai} /> : null}

        {set ? (
          <SectionCard
            title={`今日智学 · 共 ${set.items.length} 题`}
            description={
              set.source === 'assigned' ? '这是老师为你派发的智学练单' : '这是为你生成的智学练单'
            }
            actions={
              <Button onClick={() => navigate(`/student/ai-study/${set.id}`)}>
                <ListChecks data-icon="inline-start" aria-hidden="true" />
                开始练习
              </Button>
            }
          >
            {set.items.length === 0 ? (
              <EmptyState
                icon={BrainCircuit}
                title="这份练单还没有题目"
                description="请稍后重新生成，或联系老师检查题库中的题目。"
              />
            ) : (
              <ul className="space-y-3">
                {set.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </SectionCard>
        ) : (
          <EmptyState
            icon={BrainCircuit}
            title="还没有进行中的智学练单"
            description="点击右上角「生成今日智学」，系统会按你的错题与薄弱知识点挑出几道题。"
          />
        )}
      </div>
    </PageScaffold>
  );
}
