import { useState } from 'react';
import { Award, TrendingUp, GraduationCap } from 'lucide-react';

import { examsApi, type Exam } from '@/features/learning/api/examsApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Spinner } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { useRegisterPageCommands } from '@/app/commands/registry';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@/store/useStore';

/** One row of `GET /api/exams/student-exams`: the pupil's score plus the exam it belongs to. */
interface StudentExamRow {
  id: number;
  exam_id: number;
  student_id: number;
  score: number | null;
  feedback: string | null;
  exam_title: string | null;
  exam_date: string | null;
  total_score: number | null;
}

/**
 * 考试成绩 - the pupil's side of the teacher's grade sheet.
 *
 * `examsApi.listStudentExams` had no caller anywhere in the four consoles while its route was live
 * and admitted exactly one audience (`RECORD_READERS`, scoped to the caller's own child): the
 * teacher typed the marks into 成绩录入, they landed in `student_exams`, and the pupil they belonged
 * to could not read them. This page is that missing half - the same rows, read-only.
 *
 * It carries the two things a grade is worth looking at for: the score against the paper's total
 * (a bare "85" says nothing without the 100), and the teacher's comment. A row whose score has not
 * been entered yet is shown as 待录入 rather than 0 - the distinction matters to a pupil.
 */
export default function StudentExamsPage() {
  const user = useStore((state) => state.user);
  const [onlyScored, setOnlyScored] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student-exams', user?.studentId ?? null],
    queryFn: async () => {
      const result = await examsApi.listStudentExams();
      return (result.data ?? []) as unknown as StudentExamRow[];
    },
    enabled: Boolean(user?.studentId),
  });

  useRegisterPageCommands([
    {
      id: 'student-exams:all',
      label: '显示全部考试',
      icon: Award,
      keywords: ['考试', '成绩', '全部'],
      disabled: !onlyScored,
      run: () => setOnlyScored(false),
    },
    {
      id: 'student-exams:scored',
      label: '只看已出分',
      icon: TrendingUp,
      keywords: ['考试', '成绩', '已出分'],
      disabled: onlyScored,
      run: () => setOnlyScored(true),
    },
  ]);

  const rows = data ?? [];
  const scored = rows.filter((row) => row.score !== null);
  const average = scored.length
    ? Math.round((scored.reduce((total, row) => total + (row.score ?? 0), 0) / scored.length) * 10) / 10
    : null;
  const best = scored.length ? Math.max(...scored.map((row) => row.score ?? 0)) : null;
  const visible = onlyScored ? scored : rows;

  return (
    <PageScaffold
      variant="list"
      title="考试成绩"
      description="老师录入的每一次考试成绩与评语"
      toolbar={
        <div className="flex items-center gap-2">
          <Button
            variant={onlyScored ? 'ghost' : 'default'}
            size="sm"
            onClick={() => setOnlyScored(false)}
          >
            全部
          </Button>
          <Button
            variant={onlyScored ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setOnlyScored(true)}
          >
            只看已出分
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={Award} label="考试场次" tone="info" value={rows.length} />
          <StatCard icon={GraduationCap} label="已出分" tone="success" value={scored.length} />
          <StatCard
            icon={TrendingUp}
            label="平均分"
            tone="warning"
            value={average === null ? '—' : `${average}`}
          />
        </div>

        {!user?.studentId ? (
          <EmptyState
            icon={Award}
            title="等待绑定学生"
            description="当前账号还没有绑定学生，绑定后这里会显示真实的考试成绩。"
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-fg-3">
            <Spinner label="正在加载考试成绩" />
            正在加载考试成绩...
          </div>
        ) : isError ? (
          /*
            A failed read is not "no exams": this is the page a pupil checks after a test, and the
            difference between "your teacher has not entered anything" and "we could not ask" is the
            whole point of the page.
          */
          <div className="rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center">
            <p className="font-semibold text-danger">考试成绩没有加载出来</p>
            <p className="mt-1 text-sm text-fg-3">这不代表没有成绩，请重试。</p>
            <Button variant="outline" className="mt-3" onClick={() => void refetch()}>
              重新加载
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Award}
            title={rows.length === 0 ? '还没有考试成绩' : '还没有出分的考试'}
            description={
              rows.length === 0
                ? '老师录入成绩后，会出现在这里。'
                : '切换到「全部」可以看到老师已经建好、还没打分的考试。'
            }
          />
        ) : (
          <ul className="space-y-3">
            {visible.map((row) => (
              <li key={row.id}>
                <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-bold text-fg-1">
                        {row.exam_title || '未命名考试'}
                      </h3>
                      {row.exam_date ? <Badge variant="outline">{row.exam_date.slice(0, 10)}</Badge> : null}
                    </div>
                    {row.feedback ? (
                      <p className="text-sm text-fg-2">老师评语：{row.feedback}</p>
                    ) : (
                      <p className="text-sm text-fg-3">老师没有留下评语。</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {row.score === null ? (
                      <span className="text-sm text-fg-3">待录入</span>
                    ) : (
                      <>
                        <div className="text-2xl font-black text-role">
                          {row.score}
                          <span className="text-sm font-normal text-fg-3">
                            {' '}
                            / {row.total_score ?? 100}
                          </span>
                        </div>
                        <div className="text-xs text-fg-3">本次得分</div>
                      </>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {best !== null ? (
          <p className="text-center text-xs text-fg-3">最高分 {best} 分，共 {scored.length} 场已出分。</p>
        ) : null}
      </div>
    </PageScaffold>
  );
}

export type { StudentExamRow, Exam };
