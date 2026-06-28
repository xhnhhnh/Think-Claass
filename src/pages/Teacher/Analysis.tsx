import { useEffect, useState } from 'react';
import { BarChart2, ClipboardCheck, LoaderCircle, Medal, TrendingUp, UserCheck, Users } from 'lucide-react';

import {
  DataList,
  DataPanel,
  HorizontalBarList,
  MetricGrid,
  type MetricCardItem,
} from '@/features/classroom/components/analytics/DataInsight';
import { useClassOverview } from '@/hooks/queries/useAnalytics';
import { useClasses } from '@/hooks/queries/useClasses';
import { useSettings } from '@/hooks/queries/useSettings';
import { cn } from '@/lib/utils';

export default function TeacherAnalysis() {
  const { data: settings } = useSettings();
  const { data: classes = [], isLoading: isClassesLoading } = useClasses();
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const { data: overview, isLoading, error } = useClassOverview(selectedClassId);

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  if (settings?.enable_teacher_analytics === '0') {
    return <div className="p-8 text-center text-slate-500">管理员暂未开放教师分析功能。</div>;
  }

  if (isClassesLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
        正在加载班级数据...
      </div>
    );
  }

  if (!classes.length) {
    return <div className="p-8 text-center text-slate-500">暂无班级数据，请先创建班级。</div>;
  }

  const metrics: MetricCardItem[] = overview
    ? [
        { label: '班级总人数', value: `${overview.summary.total_students} 人`, icon: Users, tone: 'blue' },
        { label: '平均积分', value: `${overview.summary.average_points} 分`, icon: TrendingUp, tone: 'indigo' },
        { label: '考试均分', value: `${overview.summary.average_exam_score} 分`, icon: Medal, tone: 'purple' },
        { label: '作业完成率', value: `${overview.summary.assignment_completion_rate}%`, icon: ClipboardCheck, tone: 'emerald' },
        { label: '出勤率', value: `${overview.summary.attendance_rate}%`, icon: UserCheck, tone: 'orange' },
        { label: '表扬次数', value: `${overview.summary.praise_count} 次`, icon: BarChart2, tone: 'pink' },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-white/60 bg-white/80 p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] backdrop-blur-xl">
        <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">选择班级:</span>
        {classes.map((cls) => (
          <button
            key={cls.id}
            onClick={() => setSelectedClassId(cls.id)}
            className={cn(
              'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              selectedClassId === cls.id
                ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                : 'border border-gray-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100/50',
            )}
          >
            {cls.name}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
          正在加载分析数据...
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-6 py-12 text-center text-red-600">
          分析数据加载失败，请稍后重试。
        </div>
      )}

      {!isLoading && !error && overview && (
        <>
          <MetricGrid items={metrics} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <DataPanel
              title="积分分布"
              icon={BarChart2}
              iconClassName="text-indigo-500"
              isEmpty={overview.distributions.length === 0}
              emptyText="暂无积分分布数据"
            >
              <HorizontalBarList items={overview.distributions} unit="人" tone="green" />
            </DataPanel>

            <DataPanel
              title="近期考试趋势"
              icon={TrendingUp}
              iconClassName="text-orange-500"
              isEmpty={overview.exam_trend.length === 0}
              emptyText="暂无考试数据"
            >
              <DataList
                items={overview.exam_trend}
                getKey={(exam) => exam.id}
                renderItem={(exam) => (
                  <div key={exam.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-bold text-slate-800">{exam.title}</div>
                        <div className="text-sm text-slate-500">{exam.exam_date || '未设置考试日期'}</div>
                      </div>
                      <div className="text-xl font-black text-orange-500">{Math.round(exam.average_score)} 分</div>
                    </div>
                  </div>
                )}
              />
            </DataPanel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <DataPanel
              title="最近作业完成情况"
              isEmpty={overview.assignment_trend.length === 0}
              emptyText="暂无作业数据"
            >
              <DataList
                items={overview.assignment_trend}
                getKey={(assignment) => assignment.id}
                renderItem={(assignment) => (
                  <div key={assignment.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-bold text-slate-800">{assignment.title}</div>
                        <div className="text-sm text-slate-500">{assignment.due_date || '未设置截止时间'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-emerald-600">{assignment.completion_rate}%</div>
                        <div className="text-xs text-slate-500">
                          {assignment.submitted_students}/{assignment.total_students}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              />
            </DataPanel>

            <DataPanel
              title="积分榜前五"
              isEmpty={overview.top_students.length === 0}
              emptyText="暂无学生数据"
            >
              <DataList
                items={overview.top_students}
                getKey={(student) => student.id}
                renderItem={(student, index) => (
                  <div key={student.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-black text-indigo-600">
                        {index + 1}
                      </div>
                      <div className="font-bold text-slate-800">{student.name}</div>
                    </div>
                    <div className="text-lg font-black text-indigo-600">{student.total_points} 分</div>
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
