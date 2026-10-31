import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Medal,
  Plus,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageScaffold } from '@/components/ui/page-scaffold';
import { Progress } from '@/components/ui/progress';
import { SectionCard } from '@/components/ui/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { examsApi } from '@/features/learning/api/examsApi';
import { useMyHomework } from '@/features/homework/hooks/useHomework';
import { getEvolutionStage, getPetDisplayImage, getPetElement } from '@/features/pet/petConfig';
import { useStudentPetData } from '@/features/pet/hooks/usePet';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

import { studentsApi } from '../api/studentsApi';
import { MotivationOverview } from '../components/MotivationOverview';

/**
 * The student's first screen.
 *
 * It used to be a greeting card, four figure tiles and two links - the four figures were the
 * only data on it, so a pupil had to leave the page to find out whether anything was due.
 * The overview now answers the three questions a student actually opens the app with:
 * "what is due", "how am I doing", and "what is my pet doing". Each section owns its own
 * loading/error state: a failed exam read must not make the homework list look empty.
 */
export default function StudentOverviewPage() {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const studentId = user?.studentId ?? null;

  const summaryQuery = useQuery({
    queryKey: ['motivation-summary', studentId],
    queryFn: () => studentsApi.getSummary(studentId!),
    enabled: !!studentId,
  });
  const homeworkQuery = useMyHomework();
  const examsQuery = useQuery({
    queryKey: ['student-exams-overview', studentId],
    queryFn: async () => (await examsApi.listStudentExams({ studentId: studentId! })).data,
    enabled: !!studentId,
  });
  const petQuery = useStudentPetData(studentId);
  const recordsQuery = useQuery({
    queryKey: ['student-records-overview', studentId],
    queryFn: () => studentsApi.getRecords({ studentId: studentId! }),
    enabled: !!studentId,
  });

  const stageCopy = {
    general: '继续向前探索',
    primary: '今天也有新发现',
    middle: '看见稳步向前的自己',
    high: '为目标积累每一步',
  } as const;
  const summary = summaryQuery.data?.summary;
  const homework = (homeworkQuery.data ?? []).filter((entry) => entry.homework.status === 'published');
  const pendingHomework = homework.filter(
    (entry) => !entry.homework.legacy && (!entry.submission || entry.submission.status === 'draft'),
  );
  const exams = ((examsQuery.data ?? []) as Array<Record<string, unknown>>).slice(0, 3);
  const pet = petQuery.data?.pet ?? null;
  const records = recordsQuery.data?.records ?? [];

  return (
    <PageScaffold variant="dashboard" title="成长总览" description="看见每一次成长、合作、竞技与参与。">
      <div className="space-y-5">
        {/* identity + balance ---------------------------------------------------- */}
        <section className="surface-hero relative overflow-hidden rounded-card border border-line-1">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar name={user?.name || user?.username || '同学'} size="lg" />
              <div className="min-w-0">
                <p className="text-caption text-fg-3">我的成长旅程</p>
                <h2 className="mt-1 truncate text-page-title text-fg-1">
                  {user?.name || user?.username || '同学'}，{stageCopy[summary?.schoolStage ?? 'general']}
                </h2>
                <p className="mt-1 text-body-sm text-fg-3">
                  {summary
                    ? `当前阶段：${summary.level} · 可用积分 ${summary.availableCredits} 分`
                    : '成长数据正在载入…'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => navigate('/student/shop')}>
                <ShoppingBag aria-hidden="true" />
                积分商城
              </Button>
              <Button onClick={() => navigate('/student/homework')}>
                <BookOpen aria-hidden="true" />
                我的作业
              </Button>
            </div>
          </div>
        </section>

        {!studentId ? (
          <Card className="px-6 py-8 text-center">
            <p className="text-section-title text-fg-1">还没有绑定学生档案</p>
            <p className="mt-1 text-body-sm text-fg-3">请联系老师完成绑定，之后这里会显示你的成长记录。</p>
          </Card>
        ) : summaryQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full rounded-card" />)}
          </div>
        ) : summaryQuery.isError ? (
          <Card className="items-center px-6 py-8 text-center">
            <p className="font-semibold text-danger">成长数据没有加载出来</p>
            <p className="mt-1 text-body-sm text-fg-3">这不代表你的记录是空的，请重试。</p>
            <Button variant="outline" className="mt-4" onClick={() => void summaryQuery.refetch()}>
              重新加载
            </Button>
          </Card>
        ) : summary ? (
          <MotivationOverview summary={summary} />
        ) : null}

        {/* today + pet ----------------------------------------------------------- */}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            <SectionCard
              title="今天要做的事"
              description="待完成的作业与最近的考试"
              actions={
                <Button variant="ghost" size="sm" onClick={() => navigate('/student/homework')}>
                  全部作业
                  <ArrowRight aria-hidden="true" />
                </Button>
              }
            >
              {homeworkQuery.isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
                </div>
              ) : homeworkQuery.isError ? (
                <div className="rounded-card bg-danger-soft px-4 py-3 text-body-sm text-danger">
                  作业没有加载出来，这不代表没有作业。
                  <Button variant="ghost" size="sm" className="ml-2 text-danger" onClick={() => void homeworkQuery.refetch()}>
                    重试
                  </Button>
                </div>
              ) : pendingHomework.length === 0 ? (
                <div className="rounded-card border border-dashed border-line-1 bg-surface-3/40 px-4 py-6 text-center">
                  <p className="text-body font-medium text-fg-2">今天的作业都完成了</p>
                  <p className="mt-1 text-body-sm text-fg-3">可以去看看精灵，或者去商城逛逛。</p>
                </div>
              ) : (
                <ul className="divide-y divide-line-2">
                  {pendingHomework.slice(0, 4).map((entry) => (
                    <li key={entry.homework.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => navigate(`/student/homework/${entry.homework.id}`)}
                        className="h-auto w-full justify-start gap-3 rounded-none px-0 py-3 text-left"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-info-soft text-info-ink">
                          <BookOpen aria-hidden="true" className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-semibold text-fg-1">{entry.homework.title}</span>
                          <span className="mt-0.5 block text-caption text-fg-3">
                            {entry.question_count} 题 · {entry.homework.reward_points} 积分
                            {entry.homework.due_at ? ` · 截止 ${formatDate(entry.homework.due_at)}` : ''}
                          </span>
                        </span>
                        <Badge variant="warning">待完成</Badge>
                        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-fg-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 border-t border-line-2 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-body-sm font-semibold text-fg-1">
                    <CalendarDays aria-hidden="true" className="size-4 text-fg-3" />
                    最近的考试
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/student/exams')}>
                    成绩单
                  </Button>
                </div>
                {examsQuery.isLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : examsQuery.isError ? (
                  <p className="text-body-sm text-fg-3">考试成绩没有加载出来。</p>
                ) : exams.length === 0 ? (
                  <p className="text-body-sm text-fg-3">暂时没有安排考试。</p>
                ) : (
                  <ul className="divide-y divide-line-2">
                    {exams.map((exam) => (
                      <li key={String(exam.id)} className="flex items-center gap-3 py-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-warning-soft text-warning-ink">
                          <TrendingUp aria-hidden="true" className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body-sm font-medium text-fg-1">
                            {String(exam.exam_title ?? exam.title ?? '考试')}
                          </span>
                          <span className="text-caption text-fg-3">
                            {exam.exam_date ? formatDate(String(exam.exam_date)) : '时间待定'}
                          </span>
                        </span>
                        <span className="shrink-0 text-body-sm font-semibold text-fg-1 tabular-nums">
                          {exam.score == null ? '待录入' : `${exam.score} / ${exam.total_score ?? '—'}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="最近的成长"
              description="课堂参与、合作和奖励的最新记录"
              actions={
                <Button variant="ghost" size="sm" onClick={() => navigate('/student/achievements')}>
                  我的成就
                  <ArrowRight aria-hidden="true" />
                </Button>
              }
            >
              {recordsQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : recordsQuery.isError ? (
                <p className="text-body-sm text-fg-3">成长记录没有加载出来。</p>
              ) : records.length === 0 ? (
                <p className="text-body-sm text-fg-3">还没有成长记录，参与课堂就会从这里开始。</p>
              ) : (
                <ul className="space-y-2">
                  {records.slice(0, 4).map((record) => (
                    <li key={record.id} className="flex items-center justify-between gap-3 rounded-card bg-surface-3/40 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-body-sm font-medium text-fg-1">{record.description || '成长记录'}</p>
                        <p className="text-caption text-fg-3">{String(record.created_at).slice(0, 10)}</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-body-sm font-semibold tabular-nums',
                          record.amount >= 0 ? 'text-success-ink' : 'text-danger',
                        )}
                      >
                        {record.amount >= 0 ? '+' : ''}{record.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader className="border-b border-line-1 pb-3">
                <CardTitle className="flex items-center justify-between gap-2">
                  我的精灵
                  <Button variant="ghost" size="icon-sm" onClick={() => navigate('/student/pet')} aria-label="打开我的精灵">
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </CardTitle>
                <CardDescription>陪你一起长大</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {petQuery.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : petQuery.isError ? (
                  <p className="text-body-sm text-fg-3">精灵状态没有加载出来。</p>
                ) : !pet ? (
                  <div className="flex flex-col items-center py-4 text-center">
                    <span className="flex size-14 items-center justify-center rounded-pill bg-role-soft text-role-ink">
                      <Sparkles aria-hidden="true" className="size-6" />
                    </span>
                    <p className="mt-3 text-body font-medium text-fg-1">还没有领养精灵</p>
                    <p className="mt-1 text-caption text-fg-3">完成课堂任务获得积分后，就可以领养一只。</p>
                    <Button size="sm" className="mt-3" onClick={() => navigate('/student/pet')}>
                      <Plus aria-hidden="true" />
                      去领养
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <img
                        src={getPetDisplayImage(pet as unknown as Record<string, unknown>)}
                        alt={`${getPetElement(pet.element_type).name}精灵`}
                        className="size-20 shrink-0 rounded-card border border-line-1 bg-surface-3 object-contain"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className={cn('size-2.5 rounded-pill', getPetElement(pet.element_type).color)}
                          />
                          <span className="text-body font-semibold text-fg-1">
                            {getPetElement(pet.element_type).name}精灵
                          </span>
                        </div>
                        <p className="mt-1 text-caption text-fg-3">
                          Lv.{pet.level} · {getEvolutionStage(pet.level)}
                        </p>
                        <p className="text-caption text-fg-3">攻击力 {pet.attack_power}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-caption text-fg-3">
                        <span>经验值</span>
                        <span className="tabular-nums">{pet.experience} / 100</span>
                      </div>
                      <Progress label="精灵经验值" value={Math.min(100, pet.experience)} />
                    </div>
                    <Button variant="outline" className="mt-4 w-full" onClick={() => navigate('/student/pet')}>
                      去看看精灵
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <SectionCard title="快捷入口" description="成长中心">
              <div className="grid gap-2">
                {[
                  { label: '我的成就', description: '看看已经点亮的徽章', icon: Medal, path: '/student/achievements' },
                  { label: '积分商城', description: '用积分换一点小奖励', icon: ShoppingBag, path: '/student/shop' },
                  { label: '我的作业', description: '待完成与已批改', icon: BookOpen, path: '/student/homework' },
                ].map((item) => (
                  <Button
                    key={item.path}
                    variant="ghost"
                    onClick={() => navigate(item.path)}
                    className="h-auto justify-start gap-3 px-2 py-2.5"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-card bg-surface-3 text-fg-2">
                      <item.icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block text-body-sm font-medium text-fg-1">{item.label}</span>
                      <span className="block text-caption text-fg-3">{item.description}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </SectionCard>
          </aside>
        </div>
      </div>
    </PageScaffold>
  );
}

/** A compact, locale-independent date for a due date or exam date. */
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
