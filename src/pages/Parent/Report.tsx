import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Calendar, Heart, LoaderCircle, PieChart, Star, TrendingDown, TrendingUp } from 'lucide-react';

import {
  DataList,
  DataPanel,
  EmptyData,
  KeyValueRows,
  MetricGrid,
  type MetricCardItem,
} from '@/features/classroom/components/analytics/DataInsight';
import { useStudentReport } from '@/hooks/queries/useAnalytics';
import { useSettings } from '@/hooks/queries/useSettings';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

const pointUnit = '朵';

function ReportNotice({
  icon: Icon,
  iconClassName,
  title,
  description,
}: {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex h-80 max-w-5xl flex-col items-center justify-center rounded-[2rem] border border-amber-100/50 bg-white p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-amber-50">
        <Icon className={cn('size-10', iconClassName)} />
      </div>
      <h2 className="mb-3 text-2xl font-bold text-stone-800">{title}</h2>
      <p className="max-w-md text-stone-500">{description}</p>
    </div>
  );
}

function formatRecordTime(createdAt: string) {
  return new Date(createdAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAssignmentStatusText(status: string) {
  return status === 'submitted' ? '已提交' : '待完成';
}

export default function ParentReport() {
  const user = useStore(state => state.user);
  const { data: settings } = useSettings();
  const { data: report, isLoading, error } = useStudentReport(user?.studentId ?? null);

  if (!user?.studentId) {
    return (
      <ReportNotice
        icon={Heart}
        iconClassName="text-coral-400"
        title="等待宝贝加入"
        description="您的账号尚未绑定宝贝信息，请联系老师获取邀请码进行绑定，开启温馨的家校之旅。"
      />
    );
  }

  if (settings?.enable_parent_report === '0') {
    return (
      <ReportNotice
        icon={AlertCircle}
        iconClassName="text-amber-500"
        title="报告功能暂未开放"
        description="管理员当前关闭了家长报告功能，请稍后再查看。"
      />
    );
  }

  const summary = report?.summary;
  const records = report?.records ?? [];
  const recentExams = report?.recent_exams ?? [];
  const assignments = report?.assignments ?? [];
  const praises = report?.praises ?? [];
  const leaves = report?.leaves ?? [];
  const metrics: MetricCardItem[] = [
    { label: '本周收获', value: `+${summary?.weekly_earned ?? 0}`, unit: pointUnit, icon: TrendingUp, tone: 'green' },
    { label: '本周兑换', value: `-${summary?.weekly_spent ?? 0}`, unit: pointUnit, icon: TrendingDown, tone: 'coral' },
    { label: '累计获得', value: summary?.total_earned ?? 0, unit: pointUnit, icon: Star, tone: 'indigo' },
    { label: '累计使用', value: summary?.total_spent ?? 0, unit: pointUnit, icon: Calendar, tone: 'amber' },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="mb-0 flex items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-stone-800">成长足迹</h1>
          <p className="mt-2 text-stone-500">
            {report?.student.name ? `${report.student.name} 的真实成长报告` : '记录宝贝每一次闪光的瞬间'}
          </p>
        </div>
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500 shadow-inner">
          <PieChart className="size-7" />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center rounded-[2rem] bg-white p-16 text-stone-500 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <LoaderCircle className="mr-3 size-5 animate-spin" />
          正在生成成长报告...
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-[2rem] border border-red-100 bg-red-50 px-8 py-16 text-center text-red-600 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          成长报告加载失败，请稍后重试。
        </div>
      )}

      {!isLoading && !error && report && (
        <>
          <MetricGrid items={metrics} surface="paper" className="lg:grid-cols-4 xl:grid-cols-4" />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <DataPanel title="学习概况" surface="paper">
              <KeyValueRows
                rows={[
                  { label: '平均考试分', value: summary?.average_exam_score ?? 0, valueClassName: 'text-indigo-600' },
                  { label: '作业完成率', value: `${summary?.assignment_completion_rate ?? 0}%`, valueClassName: 'text-emerald-600' },
                  { label: '出勤率', value: `${summary?.attendance_rate ?? 0}%`, valueClassName: 'text-orange-600' },
                  { label: '获得表扬', value: `${summary?.praise_count ?? 0} 次`, valueClassName: 'text-pink-500' },
                ]}
              />
            </DataPanel>

            <DataPanel title="近期考试" surface="paper" isEmpty={recentExams.length === 0} emptyText="暂无考试记录">
              <DataList
                items={recentExams}
                getKey={(exam) => `${exam.title}-${exam.exam_date}`}
                renderItem={(exam) => (
                  <div className="rounded-2xl border border-amber-50 bg-white/80 p-4">
                    <div className="font-bold text-stone-800">{exam.title}</div>
                    <div className="mt-1 text-sm text-stone-500">{exam.exam_date || '未设置考试日期'}</div>
                    <div className="mt-2 text-lg font-bold text-indigo-600">
                      {exam.score}/{exam.total_score}
                    </div>
                  </div>
                )}
              />
            </DataPanel>

            <DataPanel title="作业与出勤" surface="paper">
              <div className="rounded-2xl border border-amber-50 bg-white/80 p-4">
                <div className="text-sm text-stone-500">出勤明细</div>
                <div className="mt-2 text-stone-700">
                  到课 {report.attendance.present_count} 次 · 迟到 {report.attendance.late_count} 次 · 缺勤 {report.attendance.absent_count} 次
                </div>
              </div>
              {assignments.length === 0 ? <EmptyData text="暂无作业记录" /> : null}
              <DataList
                items={assignments.slice(0, 2)}
                getKey={(assignment) => `${assignment.title}-${assignment.due_date}`}
                renderItem={(assignment) => (
                  <div className="rounded-2xl border border-amber-50 bg-white/80 p-4">
                    <div className="font-bold text-stone-800">{assignment.title}</div>
                    <div className="mt-1 text-sm text-stone-500">状态：{getAssignmentStatusText(assignment.status)}</div>
                  </div>
                )}
              />
            </DataPanel>
          </div>

          <DataPanel title="红花手账" icon={Heart} iconClassName="text-coral-400" surface="paper" isEmpty={records.length === 0} emptyText="还没有新的记录哦，期待宝贝的第一个闪光时刻">
            <DataList
              items={records}
              getKey={(record) => record.id}
              renderItem={(record) => {
                const isPositive = record.amount > 0;

                return (
                  <div className="flex items-center justify-between rounded-2xl border border-amber-50 bg-white/80 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
                    <div className="flex min-w-0 items-center">
                      <div className={cn('mr-5 flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-inner', isPositive ? 'bg-green-50 text-green-500' : 'bg-coral-50 text-coral-500')}>
                        {isPositive ? <TrendingUp className="size-6" /> : <TrendingDown className="size-6" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold text-stone-800">{record.description ?? '红花变动'}</p>
                        <p className="mt-1.5 text-xs font-medium tracking-wider text-stone-400">{formatRecordTime(record.created_at)}</p>
                      </div>
                    </div>
                    <div className={cn('flex shrink-0 items-center text-2xl font-bold', isPositive ? 'text-green-500' : 'text-coral-500')}>
                      {isPositive ? '+' : ''}{record.amount}
                      <span className="ml-1.5 text-sm font-medium opacity-80">{pointUnit}</span>
                    </div>
                  </div>
                );
              }}
            />
          </DataPanel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DataPanel title="教师表扬与评语" surface="paper" isEmpty={praises.length === 0} emptyText="最近还没有新的表扬记录">
              <DataList
                items={praises}
                getKey={(praise) => `${praise.title}-${praise.created_at}`}
                renderItem={(praise) => (
                  <div className="rounded-2xl border border-amber-50 bg-white/80 p-5">
                    <div className="font-bold text-stone-800">{praise.title}</div>
                    <div className="mt-2 text-stone-600">{praise.message}</div>
                    <div className="mt-3 text-xs text-stone-400">{new Date(praise.created_at).toLocaleString()}</div>
                  </div>
                )}
              />
            </DataPanel>

            <DataPanel title="请假与出勤提醒" surface="paper" isEmpty={leaves.length === 0} emptyText="最近没有请假记录">
              <DataList
                items={leaves}
                getKey={(leave) => `${leave.reason}-${leave.created_at}`}
                renderItem={(leave) => (
                  <div className="rounded-2xl border border-amber-50 bg-white/80 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-bold text-stone-800">{leave.reason}</div>
                      <div className="text-sm font-bold text-amber-600">{leave.status}</div>
                    </div>
                    <div className="mt-2 text-sm text-stone-500">
                      {leave.start_date} 至 {leave.end_date}
                    </div>
                    {leave.review_comment ? <div className="mt-3 text-stone-600">{leave.review_comment}</div> : null}
                  </div>
                )}
              />
            </DataPanel>
          </div>
        </>
      )}
    </div>
  );
}
