import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  Award,
  BarChart3,
  BookOpen,
  CheckCircle,
  Clock,
  FileText,
  Heart,
  LoaderCircle,
  Star,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { StatCard } from '@/components/ui/stat-card';
import { useStudentReport } from '@/hooks/queries/useAnalytics';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

/** Shown where the API has no figure yet; a `0` would read as a real result. */
const NOT_RECORDED = '—';

/**
 * How an assignment status is named here.
 *
 * The status column is free text on the wire, so an unrecognised value is printed as-is
 * (below) instead of being folded into one of these three.
 */
const ASSIGNMENT_STATUS: Record<string, { label: string; variant: 'warning' | 'info' | 'success'; icon: LucideIcon }> = {
  pending: { label: '待完成', variant: 'warning', icon: AlertCircle },
  submitted: { label: '老师查看中', variant: 'info', icon: FileText },
  graded: { label: '已批改', variant: 'success', icon: CheckCircle },
};

/**
 * 学习采撷.
 *
 * Everything on this page used to be a literal: four assignments with invented due dates, three
 * exams with invented class averages, and the three header tiles computed from them. It now
 * reads the child's real report (`useStudentReport`, the same endpoint 成长足迹 uses), and
 * fields the report does not carry - a per-assignment subject, a per-exam class average - are
 * gone rather than guessed. A figure that has no rows behind it renders `—`, and an empty list
 * renders `EmptyState`, so nothing here can be mistaken for data that does not exist.
 *
 * The layout is unchanged: `StatCard` tiles over one `Card` whose segmented control switches
 * the two lists.
 */
export default function ParentAssignments() {
  const user = useStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<'assignments' | 'exams'>('assignments');
  const studentId = user?.studentId ?? null;
  const { data: report, isLoading, error } = useStudentReport(studentId);

  if (!user?.studentId) {
    return (
      <EmptyState
        icon={Heart}
        className="mx-auto max-w-xl"
        title="等待宝贝加入"
        description="您的账号还没有绑定宝贝信息，绑定后这里会显示真实的学习记录与成绩。"
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-panel bg-paper p-16 text-ink-3 shadow-raised">
        <LoaderCircle className="mr-3 size-5 animate-spin" />
        正在获取学习记录...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-panel border border-red-100 bg-red-50 px-8 py-16 text-center text-red-600 shadow-raised">
        学习记录加载失败，请稍后重试。
      </div>
    );
  }

  const assignments = report?.assignments ?? [];
  const exams = report?.recent_exams ?? [];

  const pendingCount = assignments.filter((assignment) => assignment.status === 'pending').length;
  const averageScore = exams.length > 0
    ? Math.round(exams.reduce((acc, exam) => acc + exam.score, 0) / exams.length)
    : null;
  const completionRate = assignments.length > 0
    ? Math.round(
        (assignments.filter((assignment) => assignment.status !== 'pending').length / assignments.length) * 100,
      )
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          label="待完成学习"
          value={
            <>
              {pendingCount}
              <span className="ml-1 text-sm font-medium text-ink-3">项</span>
            </>
          }
          icon={Clock}
          tone="warning"
          hint="陪伴宝贝一起完成吧"
        />
        <StatCard
          label="平均成绩"
          value={
            averageScore === null ? (
              NOT_RECORDED
            ) : (
              <>
                {averageScore}
                <span className="ml-1 text-sm font-medium text-ink-3">分</span>
              </>
            )
          }
          icon={BarChart3}
          tone="success"
          hint={averageScore === null ? '还没有出分的考试' : '按已出分考试计算'}
        />
        <StatCard
          label="学习完成率"
          value={
            completionRate === null ? (
              NOT_RECORDED
            ) : (
              <>
                {completionRate}
                <span className="ml-1 text-sm font-medium text-ink-3">%</span>
              </>
            )
          }
          icon={CheckCircle}
          tone="info"
          hint={
            completionRate === null ? (
              '还没有作业记录'
            ) : (
              <Progress
                value={completionRate}
                label={`学习完成率 ${completionRate}%`}
                tone="info"
                className="mt-2"
              />
            )
          }
        />
      </div>

      <Card className="gap-0 py-0">
        {/*
          The two raw buttons were an underline tab strip. A two-way switch is the kit's
          segmented control instead - `Button` owns its own border and radius, so an
          underline would have to be fought through them - and it is also where
          `aria-pressed` comes from.
        */}
        <div className="border-b border-border p-4">
          <div className="flex w-fit rounded-lg border border-border bg-muted/50 p-1">
            <Button
              type="button"
              variant={activeTab === 'assignments' ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={activeTab === 'assignments'}
              onClick={() => setActiveTab('assignments')}
            >
              <BookOpen data-icon="inline-start" />
              学习记录
            </Button>
            <Button
              type="button"
              variant={activeTab === 'exams' ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={activeTab === 'exams'}
              onClick={() => setActiveTab('exams')}
            >
              <Award data-icon="inline-start" />
              闪光成绩
            </Button>
          </div>
        </div>

        <CardContent className="p-5">
          {activeTab === 'assignments' ? (
            assignments.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                className="border-0 bg-transparent"
                title="还没有学习记录"
                description="老师布置作业之后会显示在这里"
              />
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment, index) => {
                  const status = ASSIGNMENT_STATUS[assignment.status];
                  const StatusIcon = status?.icon;

                  return (
                    <div
                      key={`${assignment.title}-${index}`}
                      className="flex flex-col justify-between gap-4 rounded-panel border border-border bg-muted/50 p-5 md:flex-row md:items-center"
                    >
                      <div className="min-w-0">
                        <h3 className="text-base font-bold tracking-wide text-ink-1">{assignment.title}</h3>
                        <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-3">
                          <Clock aria-hidden="true" className="size-4" />
                          截止: {assignment.due_date ?? '老师未设置截止日期'}
                        </div>
                        {assignment.teacher_feedback ? (
                          <p className="mt-2 text-sm leading-relaxed text-ink-2">
                            老师评语：{assignment.teacher_feedback}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between gap-3 md:w-48 md:justify-end">
                        {assignment.score != null ? (
                          <div className="text-right">
                            <span className="block text-xs font-bold uppercase tracking-widest text-ink-3">
                              得分
                            </span>
                            <span className="text-2xl font-bold text-success">{assignment.score}</span>
                          </div>
                        ) : null}
                        {status && StatusIcon ? (
                          <Badge variant={status.variant}>
                            <StatusIcon data-icon="inline-start" />
                            {status.label}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{assignment.status}</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : exams.length === 0 ? (
            <EmptyState
              icon={Award}
              className="border-0 bg-transparent"
              title="还没有考试成绩"
              description="老师录入成绩之后会显示在这里"
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {exams.map((exam, index) => {
                const scoreRate = exam.total_score > 0 ? exam.score / exam.total_score : null;

                return (
                  <div key={`${exam.title}-${index}`} className="rounded-panel border border-border bg-muted/50 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-sm font-medium tracking-wider text-ink-3">
                        {exam.exam_date ?? '未记录考试日期'}
                      </span>
                      {scoreRate !== null && scoreRate >= 0.9 ? (
                        <Badge variant="warning">
                          <Star data-icon="inline-start" className="fill-current" />
                          太棒啦
                        </Badge>
                      ) : null}
                    </div>

                    <h3 className="mt-4 text-lg font-bold tracking-wide text-ink-1">{exam.title}</h3>
                    {exam.feedback ? (
                      <p className="mt-2 text-sm leading-relaxed text-ink-2">老师评语：{exam.feedback}</p>
                    ) : null}

                    <div className="mt-5 flex items-end justify-between rounded-panel border border-border bg-paper p-5">
                      <div>
                        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-ink-3">
                          卷面总分
                        </span>
                        <span className="text-xl font-bold text-ink-2">{exam.total_score}</span>
                      </div>
                      <div className="text-right">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-ink-3">
                          宝贝得分
                        </span>
                        <div className="flex items-baseline justify-end">
                          <span
                            className={cn(
                              'text-3xl font-bold tracking-tight',
                              scoreRate !== null && scoreRate >= 0.6 ? 'text-success' : 'text-warning',
                            )}
                          >
                            {exam.score}
                          </span>
                          <span className="ml-1.5 text-sm font-medium text-ink-3">/ {exam.total_score}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
