import { useStore } from '@/store/useStore';
import { AlertCircle, Calendar, Heart, LoaderCircle, PieChart, Star, TrendingDown, TrendingUp } from 'lucide-react';

import { useStudentReport } from '@/hooks/queries/useAnalytics';
import { useSettings } from '@/hooks/queries/useSettings';

export default function ParentReport() {
  const user = useStore(state => state.user);
  const { data: settings } = useSettings();
  const { data: report, isLoading, error } = useStudentReport(user?.studentId ?? null);

  if (!user?.studentId) {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-100/50 p-8 text-center max-w-5xl mx-auto">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
          <Heart className="w-10 h-10 text-coral-400" />
        </div>
        <h2 className="text-2xl font-bold text-stone-800 mb-3">等待宝贝加入</h2>
        <p className="text-stone-500 max-w-md">
          您的账号尚未绑定宝贝信息，请联系老师获取邀请码进行绑定，开启温馨的家校之旅。
        </p>
      </div>
    );
  }

  if (settings?.enable_parent_report === '0') {
    return (
      <div className="flex flex-col items-center justify-center h-80 bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-100/50 p-8 text-center max-w-5xl mx-auto">
        <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10 text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold text-stone-800 mb-3">报告功能暂未开放</h2>
        <p className="text-stone-500 max-w-md">管理员当前关闭了家长报告功能，请稍后再查看。</p>
      </div>
    );
  }

  const summary = report?.summary;
  const records = report?.records ?? [];
  const recentExams = report?.recent_exams ?? [];
  const assignments = report?.assignments ?? [];
  const praises = report?.praises ?? [];
  const leaves = report?.leaves ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-800">成长足迹</h1>
          <p className="text-stone-500 mt-2">
            {report?.student.name ? `${report.student.name} 的真实成长报告` : '记录宝贝每一次闪光的瞬间'}
          </p>
        </div>
        <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shadow-inner">
          <PieChart className="w-7 h-7" />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center rounded-[2rem] bg-white p-16 text-stone-500 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <LoaderCircle className="mr-3 h-5 w-5 animate-spin" />
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
          <div className="flex items-center space-x-4 mb-5">
            <div className="w-12 h-12 bg-green-50 text-green-500 rounded-2xl flex items-center justify-center shadow-inner">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-stone-700 text-lg">本周收获</h3>
          </div>
          <div className="flex items-baseline space-x-2">
            <p className="text-4xl font-bold text-green-500">+{summary?.weekly_earned ?? 0}</p>
            <span className="text-stone-400 font-medium">朵</span>
          </div>
        </div>

        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
          <div className="flex items-center space-x-4 mb-5">
            <div className="w-12 h-12 bg-coral-50 text-coral-500 rounded-2xl flex items-center justify-center shadow-inner">
              <TrendingDown className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-stone-700 text-lg">本周兑换</h3>
          </div>
          <div className="flex items-baseline space-x-2">
            <p className="text-4xl font-bold text-coral-500">-{summary?.weekly_spent ?? 0}</p>
            <span className="text-stone-400 font-medium">朵</span>
          </div>
        </div>

        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
          <div className="flex items-center space-x-4 mb-5">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center shadow-inner">
              <Star className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-stone-700 text-lg">累计获得</h3>
          </div>
          <div className="flex items-baseline space-x-2">
            <p className="text-4xl font-bold text-indigo-500">{summary?.total_earned ?? 0}</p>
            <span className="text-stone-400 font-medium">朵</span>
          </div>
        </div>

        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
          <div className="flex items-center space-x-4 mb-5">
            <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shadow-inner">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-stone-700 text-lg">累计使用</h3>
          </div>
          <div className="flex items-baseline space-x-2">
            <p className="text-4xl font-bold text-amber-500">{summary?.total_spent ?? 0}</p>
            <span className="text-stone-400 font-medium">朵</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50">
          <h2 className="text-lg font-bold text-stone-800 mb-4">学习概况</h2>
          <div className="space-y-3 text-stone-600">
            <div className="flex items-center justify-between"><span>平均考试分</span><span className="font-bold text-indigo-600">{summary?.average_exam_score ?? 0}</span></div>
            <div className="flex items-center justify-between"><span>作业完成率</span><span className="font-bold text-emerald-600">{summary?.assignment_completion_rate ?? 0}%</span></div>
            <div className="flex items-center justify-between"><span>出勤率</span><span className="font-bold text-orange-600">{summary?.attendance_rate ?? 0}%</span></div>
            <div className="flex items-center justify-between"><span>获得表扬</span><span className="font-bold text-pink-500">{summary?.praise_count ?? 0} 次</span></div>
          </div>
        </div>

        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50">
          <h2 className="text-lg font-bold text-stone-800 mb-4">近期考试</h2>
          <div className="space-y-3">
            {recentExams.length === 0 && <div className="text-stone-400">暂无考试记录</div>}
            {recentExams.map((exam) => (
              <div key={`${exam.title}-${exam.exam_date}`} className="rounded-2xl bg-white/80 border border-amber-50 p-4">
                <div className="font-bold text-stone-800">{exam.title}</div>
                <div className="text-sm text-stone-500 mt-1">{exam.exam_date || '未设置考试日期'}</div>
                <div className="mt-2 text-lg font-bold text-indigo-600">
                  {exam.score}/{exam.total_score}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#fffdfa] p-7 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50">
          <h2 className="text-lg font-bold text-stone-800 mb-4">作业与出勤</h2>
          <div className="space-y-3">
            <div className="rounded-2xl bg-white/80 border border-amber-50 p-4">
              <div className="text-sm text-stone-500">出勤明细</div>
              <div className="mt-2 text-stone-700">
                到课 {report.attendance.present_count} 次 · 迟到 {report.attendance.late_count} 次 · 缺勤 {report.attendance.absent_count} 次
              </div>
            </div>
            {assignments.slice(0, 2).map((assignment) => (
              <div key={`${assignment.title}-${assignment.due_date}`} className="rounded-2xl bg-white/80 border border-amber-50 p-4">
                <div className="font-bold text-stone-800">{assignment.title}</div>
                <div className="mt-1 text-sm text-stone-500">
                  状态：{assignment.status === 'submitted' ? '已提交' : '待完成'}
                </div>
              </div>
            ))}
            {assignments.length === 0 && <div className="text-stone-400">暂无作业记录</div>}
          </div>
        </div>
      </div>

      <div className="bg-[#fffdfa] rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 overflow-hidden">
        <div className="px-8 py-6 border-b border-amber-50 bg-white/50 backdrop-blur-sm">
          <h2 className="text-xl font-bold text-stone-800 tracking-wide flex items-center">
            <div className="w-8 h-8 bg-coral-50 text-coral-400 rounded-xl flex items-center justify-center mr-3">
              <Heart className="w-4 h-4" />
            </div>
            红花手账
          </h2>
        </div>
        <div className="p-8 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] relative">
          <div className="absolute inset-0 bg-gradient-to-b from-[#fffdfa]/80 to-[#fffdfa]/40 pointer-events-none"></div>
          <div className="relative z-10">
            {records.length === 0 ? (
              <div className="text-center py-16 text-stone-400">
                <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Star className="w-10 h-10 opacity-20" />
                </div>
                <p className="font-medium tracking-wide">还没有新的记录哦，期待宝贝的第一个闪光时刻</p>
              </div>
            ) : (
              <div className="space-y-4">
                {records.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-5 rounded-2xl bg-white/80 backdrop-blur-sm hover:bg-white hover:shadow-md transition-all duration-300 border border-amber-50 hover:-translate-y-0.5">
                    <div className="flex items-center">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mr-5 shadow-inner ${record.amount > 0 ? 'bg-green-50 text-green-500' : 'bg-coral-50 text-coral-500'}`}>
                        {record.amount > 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="font-bold text-stone-800 text-[15px]">{record.description}</p>
                        <p className="text-xs text-stone-400 mt-1.5 font-medium tracking-wider">
                          {new Date(record.created_at).toLocaleString([], {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className={`text-2xl font-bold flex items-center ${record.amount > 0 ? 'text-green-500' : 'text-coral-500'}`}>
                      {record.amount > 0 ? '+' : ''}{record.amount}
                      <span className="text-sm font-medium ml-1.5 opacity-80">朵</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#fffdfa] rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 p-8">
          <h2 className="text-xl font-bold text-stone-800 mb-6">教师表扬与评语</h2>
          <div className="space-y-4">
            {praises.length === 0 && <div className="text-stone-400">最近还没有新的表扬记录</div>}
            {praises.map((praise) => (
              <div key={`${praise.title}-${praise.created_at}`} className="rounded-2xl bg-white/80 border border-amber-50 p-5">
                <div className="font-bold text-stone-800">{praise.title}</div>
                <div className="mt-2 text-stone-600">{praise.message}</div>
                <div className="mt-3 text-xs text-stone-400">{new Date(praise.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#fffdfa] rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-50 p-8">
          <h2 className="text-xl font-bold text-stone-800 mb-6">请假与出勤提醒</h2>
          <div className="space-y-4">
            {leaves.length === 0 && <div className="text-stone-400">最近没有请假记录</div>}
            {leaves.map((leave) => (
              <div key={`${leave.reason}-${leave.created_at}`} className="rounded-2xl bg-white/80 border border-amber-50 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="font-bold text-stone-800">{leave.reason}</div>
                  <div className="text-sm font-bold text-amber-600">{leave.status}</div>
                </div>
                <div className="mt-2 text-sm text-stone-500">
                  {leave.start_date} 至 {leave.end_date}
                </div>
                {leave.review_comment && <div className="mt-3 text-stone-600">{leave.review_comment}</div>}
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
