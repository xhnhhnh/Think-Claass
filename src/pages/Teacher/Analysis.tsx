import { useEffect, useState } from 'react';
import { BarChart2, ClipboardCheck, LoaderCircle, Medal, TrendingUp, UserCheck, Users } from 'lucide-react';

import { useClassOverview } from '@/hooks/queries/useAnalytics';
import { useClasses } from '@/hooks/queries/useClasses';
import { useSettings } from '@/hooks/queries/useSettings';

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

  const cards = overview
    ? [
        { label: '班级总人数', value: `${overview.summary.total_students} 人`, icon: Users, color: 'bg-blue-100 text-blue-600' },
        { label: '平均积分', value: `${overview.summary.average_points} 分`, icon: TrendingUp, color: 'bg-indigo-100 text-indigo-600' },
        { label: '考试均分', value: `${overview.summary.average_exam_score} 分`, icon: Medal, color: 'bg-purple-100 text-purple-600' },
        { label: '作业完成率', value: `${overview.summary.assignment_completion_rate}%`, icon: ClipboardCheck, color: 'bg-emerald-100 text-emerald-600' },
        { label: '出勤率', value: `${overview.summary.attendance_rate}%`, icon: UserCheck, color: 'bg-orange-100 text-orange-600' },
        { label: '表扬次数', value: `${overview.summary.praise_count} 次`, icon: BarChart2, color: 'bg-pink-100 text-pink-600' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2 overflow-x-auto bg-white/80 backdrop-blur-xl p-4 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
        <span className="text-sm font-bold text-slate-500 mr-2 flex-shrink-0">选择班级:</span>
        {classes.map((cls) => (
          <button
            key={cls.id}
            onClick={() => setSelectedClassId(cls.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedClassId === cls.id
                ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]'
                : 'bg-slate-50/50 text-slate-600 border border-gray-200 hover:bg-slate-100/50'
            }`}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {cards.map((card) => (
              <div key={card.label} className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60 flex items-center">
                <div className={`p-3 rounded-xl mr-4 ${card.color}`}>
                  <card.icon className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-slate-500 text-sm font-medium">{card.label}</div>
                  <div className="text-2xl font-bold text-slate-800">{card.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
              <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                <BarChart2 className="w-5 h-5 mr-2 text-indigo-500" />
                积分分布
              </h2>
              <div className="space-y-4">
                {overview.distributions.map((item) => {
                  const maxValue = Math.max(...overview.distributions.map((entry) => entry.value), 1);
                  return (
                    <div key={item.label} className="flex items-center">
                      <div className="w-20 text-right pr-4 text-sm font-medium text-slate-600">{item.label}</div>
                      <div className="flex-1 flex items-center">
                        <div
                          className="h-6 bg-gradient-to-r from-green-400 to-green-500 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-500 ease-out"
                          style={{ width: `${(item.value / maxValue) * 100}%`, minWidth: item.value > 0 ? '2rem' : '0' }}
                        />
                        <span className="ml-3 text-sm font-bold text-slate-700">{item.value} 人</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
              <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-orange-500" />
                近期考试趋势
              </h2>
              <div className="space-y-4">
                {overview.exam_trend.length === 0 && <div className="text-slate-500">暂无考试数据</div>}
                {overview.exam_trend.map((exam) => (
                  <div key={exam.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-bold text-slate-800">{exam.title}</div>
                        <div className="text-sm text-slate-500">{exam.exam_date || '未设置考试日期'}</div>
                      </div>
                      <div className="text-xl font-black text-orange-500">{Math.round(exam.average_score)} 分</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
              <h2 className="text-lg font-bold text-slate-800 mb-6">最近作业完成情况</h2>
              <div className="space-y-4">
                {overview.assignment_trend.length === 0 && <div className="text-slate-500">暂无作业数据</div>}
                {overview.assignment_trend.map((assignment) => (
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
                ))}
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-white/60">
              <h2 className="text-lg font-bold text-slate-800 mb-6">积分榜前五</h2>
              <div className="space-y-4">
                {overview.top_students.length === 0 && <div className="text-slate-500">暂无学生数据</div>}
                {overview.top_students.map((student, index) => (
                  <div key={student.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-black text-indigo-600">
                        {index + 1}
                      </div>
                      <div className="font-bold text-slate-800">{student.name}</div>
                    </div>
                    <div className="text-lg font-black text-indigo-600">{student.total_points} 分</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
