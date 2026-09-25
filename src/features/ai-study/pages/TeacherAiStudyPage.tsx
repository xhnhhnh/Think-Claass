import { useMemo, useState } from 'react';
import { AlertTriangle, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { SectionCard } from '@/components/ui/section-card';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

import { useClasses } from '@/features/classroom/hooks/useClasses';
import { useAssignAiStudySetsMutation, useAiStudyClassInsight } from '@/features/ai-study/hooks/useAiStudy';

/** How many questions a dispatched set holds by default. The server clamps to 1..10. */
const DEFAULT_SET_SIZE = 5;

/**
 * AI 智学看板 - the teacher's half.
 *
 * What it answers, in the order a teacher asks it: which knowledge points is this class collectively
 * missing, and who should practise what. The board is arithmetic over the same signals the engine
 * scores with (`learning.public.getStudentSignals`), not a model's summary - so the numbers a teacher
 * acts on are the numbers the practice sets are built from, and the `ai` block says so explicitly.
 *
 * Two things the page is careful to state rather than hide:
 *
 *   - a class larger than the analysis cap reports `students_considered` against `students_total`, so
 *     a partial board reads as partial;
 *   - a student who already has an open set is offered 查看 instead of a checkbox, because dispatching
 *     a second set would either replace the one they are halfway through or fail - and failing
 *     silently at the end of a batch is the version of this that wastes a teacher's time.
 */
export default function TeacherAiStudyPage() {
  const { data: classes = [] } = useClasses();
  const [classId, setClassId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [size, setSize] = useState(DEFAULT_SET_SIZE);
  const [hint, setHint] = useState('');
  const [confirming, setConfirming] = useState(false);

  const activeClassId = classId ?? classes[0]?.id ?? null;
  const { data: insight, isLoading, error } = useAiStudyClassInsight(activeClassId);
  const assign = useAssignAiStudySetsMutation();

  /** Students the board can dispatch to: no open set already. */
  const assignable = useMemo(
    () => (insight?.suggestions ?? []).filter((suggestion) => suggestion.open_set_id === null),
    [insight],
  );

  const toggle = (studentId: number) => {
    setSelected((prev) =>
      prev.includes(studentId) ? prev.filter((entry) => entry !== studentId) : [...prev, studentId],
    );
  };

  const runAssign = async () => {
    if (!activeClassId || selected.length === 0) return;
    try {
      const response = await assign.mutateAsync({
        classId: activeClassId,
        studentIds: selected,
        size,
        hint: hint.trim() || null,
      });
      const { created, failed } = response.data;
      if (created.length > 0) toast.success(`已为 ${created.length} 名学生生成智学练单`);
      // Per-student failures are printed rather than swallowed: a batch of thirty where two students
      // already had a set is a success with two notes, not an error.
      if (failed.length > 0) toast.warning(`有 ${failed.length} 名学生未派发，原因见列表`);
      setSelected([]);
      setConfirming(false);
    } catch {
      // The api layer toasted it; the selection stays so the teacher can retry.
    }
  };

  if (classes.length === 0) {
    return (
      <PageScaffold variant="list" title="AI 智学看板">
        <EmptyState icon={Sparkles} title="还没有班级" description="先创建一个班级并添加学生，才能看到智学看板。" />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      variant="list"
      title="AI 智学看板"
      description="按班级汇总薄弱知识点，并为学生生成或派发智学练单"
      actions={
        <Button
          onClick={() => setConfirming(true)}
          disabled={selected.length === 0 || assign.isPending}
        >
          <Send data-icon="inline-start" aria-hidden="true" />
          {assign.isPending ? '正在派发...' : `派发智学练单（${selected.length}）`}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="班级">
            <Select
              aria-label="选择班级"
              value={activeClassId ?? ''}
              onChange={(event) => {
                setClassId(Number(event.target.value));
                setSelected([]);
              }}
            >
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="每人题量" hint="1 到 10 题，默认 5 题">
            <Input
              type="number"
              min={1}
              max={10}
              value={size}
              onChange={(event) => setSize(Math.min(Math.max(Number(event.target.value) || 1, 1), 10))}
            />
          </FormField>
          <FormField label="补充要求" hint="可选，模型会参考这句话写理由">
            <Input
              value={hint}
              maxLength={200}
              placeholder="例如：本周重点复习分数加减法"
              onChange={(event) => setHint(event.target.value)}
            />
          </FormField>
        </div>

        {insight ? (
          <div
            className={
              insight.ai.available
                ? 'rounded-card border border-info/30 bg-info-soft p-3 text-xs text-info-ink'
                : 'rounded-card border border-warning/30 bg-warning-soft p-3 text-xs text-warning-ink'
            }
          >
            <div className="flex items-center gap-2 font-semibold">
              {insight.ai.available ? (
                <Sparkles aria-hidden="true" className="size-3.5" />
              ) : (
                <AlertTriangle aria-hidden="true" className="size-3.5" />
              )}
              {insight.ai.available ? '模型已参与' : '本地规则汇总'}
              <span className="font-normal opacity-80">来源：{insight.ai.source}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{insight.ai.message}</p>
            {insight.students_considered < insight.students_total ? (
              <p className="mt-1">
                本班共 {insight.students_total} 人，本次分析了前 {insight.students_considered} 人。
              </p>
            ) : null}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 rounded-panel border border-line-1 bg-surface-2 py-16 text-fg-3">
            <Spinner label="正在汇总班级智学" />
            正在汇总班级智学...
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center text-danger">
            班级智学看板加载失败，请稍后重试
          </div>
        ) : null}

        {insight ? (
          <>
            <SectionCard title="集体薄弱知识点" description="按错题量与知识点重要度排序，取前 5 项">
              {insight.weak_nodes.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="本班暂无错题记录"
                  description="学生在试卷或智学练习中答错后，这里会汇总出集体薄弱的知识点。"
                />
              ) : (
                <ul className="space-y-2">
                  {insight.weak_nodes.map((node) => (
                    <li
                      key={node.node_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line-1 bg-surface-2 p-3"
                    >
                      <span className="font-semibold text-fg-1">{node.name}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="warning">错 {node.wrong_count} 次</Badge>
                        <Badge variant="info">{node.student_count} 人涉及</Badge>
                        {node.importance === null ? null : (
                          <Badge variant="secondary">重要度 {node.importance}</Badge>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="学生建议"
              description="勾选学生后可一键派发智学练单，每人一份"
              actions={
                assignable.length > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelected(
                        selected.length === assignable.length ? [] : assignable.map((entry) => entry.student_id),
                      )
                    }
                  >
                    {selected.length === assignable.length ? '取消全选' : `全选可派发（${assignable.length}）`}
                  </Button>
                ) : null
              }
            >
              {insight.suggestions.length === 0 ? (
                <EmptyState icon={Sparkles} title="本班还没有学生" description="先在班级与学生管理里添加学生。" />
              ) : (
                <ul className="space-y-2">
                  {insight.suggestions.map((suggestion) => (
                    <li
                      key={suggestion.student_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line-1 bg-surface-2 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Checkbox
                          checked={selected.includes(suggestion.student_id)}
                          disabled={suggestion.open_set_id !== null}
                          aria-label={`选择 ${suggestion.name}`}
                          onCheckedChange={() => toggle(suggestion.student_id)}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-fg-1">{suggestion.name}</div>
                          <div className="truncate text-xs text-fg-3">{suggestion.reason}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">错题 {suggestion.wrong_count}</Badge>
                        {suggestion.open_set_id !== null ? <Badge variant="info">已有进行中练单</Badge> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="派发智学练单"
        description={`将为选中的 ${selected.length} 名学生各生成一份智学练单，每人 ${size} 题。已有进行中练单的学生会被跳过。`}
        confirmLabel="确认派发"
        pendingLabel="正在派发..."
        isPending={assign.isPending}
        onConfirm={() => void runAssign()}
      />
    </PageScaffold>
  );
}
