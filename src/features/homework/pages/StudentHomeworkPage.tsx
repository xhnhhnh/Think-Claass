import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ClipboardList, FileText, Hourglass } from 'lucide-react';

import { useRegisterPageCommands } from '@/app/commands/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import type { HomeworkStudentEntry } from '@thinkclass/contracts/domains/homework';

import { formatDateTime } from '../components/GradeSheetTable';
import { useMyHomework } from '../hooks/useHomework';

/** The three words the student's list uses, whatever the four-value status column says. */
type StudentHomeworkState = 'todo' | 'pending' | 'graded';

const STATE_LABEL: Record<StudentHomeworkState, string> = {
  todo: '待完成',
  pending: '待批改',
  graded: '已批改',
};

const STATE_VARIANT: Record<StudentHomeworkState, 'warning' | 'info' | 'success'> = {
  todo: 'warning',
  pending: 'info',
  graded: 'success',
};

/**
 * `returned` is "give it back to fix": for the student it is work to do again, not a grade, so
 * it collapses into 待完成 - with the badge below still saying 已退回, because "why is this
 * unfinished" is the question the student will ask.
 */
function studentState(entry: HomeworkStudentEntry): StudentHomeworkState {
  const status = entry.submission?.status;
  if (status === 'graded') return 'graded';
  if (status === 'submitted') return 'pending';
  return 'todo';
}

/**
 * 我的作业.
 *
 * A `list` page over `GET /api/homework/my`, which answers the homework *and* the student's own
 * attempt for each one (`HomeworkStudentEntry`) - so the status badge, the score and the
 * destination link all come from one request, with no second fetch per card.
 *
 * A `legacy: true` row is a bridged record from the deprecated assignments table. It has no
 * questions and the new routes cannot attempt or re-read it, so the card shows what the bridge
 * knows and offers no button, rather than a link that would 404.
 */
export default function StudentHomework() {
  const navigate = useNavigate();
  const { data: entries = [], isLoading } = useMyHomework();
  const [filter, setFilter] = useState<'all' | StudentHomeworkState>('all');

  const rows = useMemo(
    () => entries.map((entry) => ({ entry, state: studentState(entry) })),
    [entries],
  );

  const visible = rows.filter((row) => filter === 'all' || row.state === filter);
  const todoCount = rows.filter((row) => row.state === 'todo').length;
  const pendingCount = rows.filter((row) => row.state === 'pending').length;
  const gradedCount = rows.filter((row) => row.state === 'graded').length;

  useRegisterPageCommands([
    {
      id: 'student-homework:todo',
      label: '只看待完成',
      icon: FileText,
      keywords: ['作业', '待完成'],
      disabled: filter === 'todo',
      run: () => setFilter('todo'),
    },
    {
      id: 'student-homework:graded',
      label: '只看已批改',
      icon: CheckCircle2,
      keywords: ['作业', '已批改', '成绩'],
      disabled: filter === 'graded',
      run: () => setFilter('graded'),
    },
  ]);

  return (
    <PageScaffold
      variant="list"
      title="我的作业"
      description="完成作业、查看批改结果"
      toolbar={
        <Segmented<'all' | StudentHomeworkState>
          label="作业筛选"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部', trailing: rows.length },
            { value: 'todo', label: '待完成', trailing: todoCount },
            { value: 'pending', label: '待批改', trailing: pendingCount },
            { value: 'graded', label: '已批改', trailing: gradedCount },
          ]}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={ClipboardList} label="待完成" tone="warning" value={todoCount} />
        <StatCard icon={Hourglass} label="待批改" tone="info" value={pendingCount} />
        <StatCard icon={CheckCircle2} label="已批改" tone="success" value={gradedCount} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-fg-3">
          <Spinner label="正在加载作业" />
          正在加载作业...
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={rows.length === 0 ? '暂时没有作业' : '这个筛选下没有作业'}
          description={rows.length === 0 ? '老师发布作业后，会出现在这里。' : '切换到「全部」看看其他作业。'}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map(({ entry, state }) => {
            const { homework, submission } = entry;
            const isLegacy = homework.legacy === true;
            const returned = submission?.status === 'returned';

            return (
              <li
                key={homework.id}
                className="flex flex-col gap-4 rounded-panel border border-line-1 bg-surface-2 p-5 shadow-card md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-bold text-fg-1">{homework.title}</h3>
                    <Badge variant={STATE_VARIANT[state]}>{STATE_LABEL[state]}</Badge>
                    {returned ? <Badge variant="warning">已退回，请修改后重新提交</Badge> : null}
                    {isLegacy ? <Badge variant="outline">迁移前的旧作业（只读）</Badge> : null}
                  </div>

                  {homework.description ? (
                    <p className="line-clamp-2 text-sm text-fg-2">{homework.description}</p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-3">
                    <span className="inline-flex items-center gap-1">
                      <AlertCircle aria-hidden="true" className="size-3.5 text-warning" />
                      截止：{homework.due_at ? formatDateTime(homework.due_at) : '不限'}
                    </span>
                    <span>题目：{entry.question_count} 题</span>
                    <span>总分：{homework.total_points}</span>
                  </div>

                  {isLegacy ? (
                    <p className="text-xs text-fg-3">这份作业来自旧系统，只能查看，不能在这里作答。</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-3 md:shrink-0">
                  {state === 'graded' ? (
                    <div className="rounded-card border border-success/30 bg-success-soft px-4 py-2 text-center">
                      <span className="block text-xs font-semibold text-success-ink">得分</span>
                      <span className="text-2xl font-black text-success-ink">
                        {submission?.score ?? '—'}
                      </span>
                      <span className="text-xs text-success-ink"> / {homework.total_points}</span>
                    </div>
                  ) : null}

                  {isLegacy ? (
                    <span className="text-xs text-fg-3">只读</span>
                  ) : state === 'graded' ? (
                    <Button variant="outline" onClick={() => navigate(`/student/homework/${homework.id}/result`)}>
                      查看结果
                    </Button>
                  ) : state === 'pending' ? (
                    <Button variant="secondary" onClick={() => navigate(`/student/homework/${homework.id}`)}>
                      查看提交
                    </Button>
                  ) : (
                    <Button onClick={() => navigate(`/student/homework/${homework.id}`)}>
                      {returned ? '重新作答' : '去作答'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageScaffold>
  );
}
