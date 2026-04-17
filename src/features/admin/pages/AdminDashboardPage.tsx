import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  BookOpen,
  Calendar,
  Clock,
  Cpu,
  Download,
  GraduationCap,
  HardDrive,
  RefreshCw,
  School,
  Server,
  ShieldAlert,
  Target,
  Upload,
  Users,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { ADMIN_PATH } from '@/constants';
import { adminClient } from '@/features/admin/api/adminClient';
import { useAdminStatsQuery, useDatabaseImportMutation } from '@/features/admin/hooks/useAdminSystem';

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 300,
      damping: 24,
    },
  },
};

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}天 ${h}小时 ${m}分钟`;
}

function ProgressBar({ value }: { value: number }) {
  const tone = value > 80 ? 'bg-red-500 text-red-500' : value > 50 ? 'bg-amber-500 text-amber-500' : 'bg-emerald-500 text-emerald-500';

  return (
    <div className="w-full bg-slate-800/50 rounded-full h-2.5 border border-white/5 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 shadow-[0_0_10px_currentColor] relative overflow-hidden ${tone}`} style={{ width: `${Math.min(value, 100)}%` }}>
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
        />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  bgColor,
  glowColor,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  bgColor: string;
  glowColor: string;
}) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -5, boxShadow: '0 10px 30px rgba(255,255,255,0.1)' }}
      className="glass-dark p-6 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-white/10 relative overflow-hidden transition-colors duration-300 hover:border-white/20"
    >
      <div className={`absolute top-[-20px] right-[-20px] w-24 h-24 ${glowColor} opacity-10 blur-3xl rounded-full pointer-events-none`} />
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className={`w-12 h-12 rounded-2xl ${bgColor} flex items-center justify-center border border-white/10`}>{icon}</div>
        <span className="text-xs uppercase tracking-[0.3em] text-slate-500">live</span>
      </div>
      <p className="text-sm text-slate-400">{title}</p>
      <p className="text-3xl font-bold text-slate-100 mt-2">{value}</p>
    </motion.div>
  );
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: stats, isPending, refetch, isRefetching } = useAdminStatsQuery();
  const importDatabaseMutation = useDatabaseImportMutation();

  const handleExport = () => {
    if (confirm('确定要导出所有数据吗？')) {
      window.location.href = adminClient.getDatabaseExportUrl();
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm('确定要导入此数据文件吗？这将会覆盖当前所有数据！\n导入成功后服务器将自动重启。')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await importDatabaseMutation.mutateAsync(formData);
      toast.success(result.message);
      setTimeout(() => window.location.reload(), 3000);
    } catch (error) {
      const message =
        (error as any)?.response?.data?.message ||
        (error as any)?.data?.message ||
        (error as Error)?.message ||
        '网络错误，导入失败';
      toast.error(message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">系统仪表盘</h2>
          <p className="text-slate-400 mt-1">实时监控系统运行状态与数据统计</p>
        </div>
        <div className="flex items-center space-x-3">
          <input type="file" ref={fileInputRef} className="hidden" accept=".sqlite" onChange={handleImport} />
          <motion.button onClick={handleExport} whileHover={{ y: -2, boxShadow: '0 0 15px rgba(16,185,129,0.5)' }} whileTap={{ scale: 0.95 }} className="flex items-center px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl hover:bg-emerald-500/30 transition-colors duration-300">
            <Download className="w-4 h-4 mr-2" />
            导出数据
          </motion.button>
          <motion.button onClick={() => fileInputRef.current?.click()} disabled={importDatabaseMutation.isPending} whileHover={{ y: -2, boxShadow: '0 0 15px rgba(245,158,11,0.5)' }} whileTap={{ scale: 0.95 }} className="flex items-center px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl hover:bg-amber-500/30 transition-colors duration-300 disabled:opacity-50">
            <Upload className={`w-4 h-4 mr-2 ${importDatabaseMutation.isPending ? 'animate-bounce' : ''}`} />
            {importDatabaseMutation.isPending ? '导入中...' : '导入数据'}
          </motion.button>
          <motion.button onClick={() => refetch()} disabled={isPending || isRefetching} whileHover={{ y: -2, boxShadow: '0 0 15px rgba(59,130,246,0.5)' }} whileTap={{ scale: 0.95 }} className="flex items-center px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-2xl hover:bg-blue-500/30 transition-colors duration-300 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 mr-2 ${isPending || isRefetching ? 'animate-spin' : ''}`} />
            刷新数据
          </motion.button>
          <motion.button onClick={() => navigate(`${ADMIN_PATH}/reset`)} whileHover={{ y: -2, boxShadow: '0 0 15px rgba(248,113,113,0.5)' }} whileTap={{ scale: 0.95 }} className="flex items-center px-4 py-2 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-2xl hover:bg-rose-500/30 transition-colors duration-300">
            <ShieldAlert className="w-4 h-4 mr-2" />
            系统重置
          </motion.button>
        </div>
      </div>

      {!stats && isPending ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]"></div>
        </div>
      ) : stats ? (
        <motion.div initial="hidden" animate="visible">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="总用户数" value={stats.database.totalUsers} icon={<Users className="w-6 h-6 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" />} bgColor="bg-blue-500/20" glowColor="bg-blue-500" />
            <StatCard title="教师人数" value={stats.database.teachers} icon={<School className="w-6 h-6 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]" />} bgColor="bg-indigo-500/20" glowColor="bg-indigo-500" />
            <StatCard title="学生人数" value={stats.database.students} icon={<GraduationCap className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />} bgColor="bg-emerald-500/20" glowColor="bg-emerald-500" />
            <StatCard title="班级数量" value={stats.database.classes} icon={<School className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />} bgColor="bg-amber-500/20" glowColor="bg-amber-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
            <StatCard title="总作业数" value={stats.database.totalAssignments} icon={<BookOpen className="w-6 h-6 text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]" />} bgColor="bg-purple-500/20" glowColor="bg-purple-500" />
            <StatCard title="请假记录" value={stats.database.totalLeaves} icon={<Calendar className="w-6 h-6 text-pink-400 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)]" />} bgColor="bg-pink-500/20" glowColor="bg-pink-500" />
            <StatCard title="组队任务" value={stats.database.totalTeamQuests} icon={<Target className="w-6 h-6 text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]" />} bgColor="bg-orange-500/20" glowColor="bg-orange-500" />
            <StatCard title="系统总积分" value={stats.database.totalPoints} icon={<Award className="w-6 h-6 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" />} bgColor="bg-yellow-500/20" glowColor="bg-yellow-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            <motion.div
              variants={itemVariants}
              whileHover={{ y: -5, boxShadow: '0 10px 30px rgba(255,255,255,0.1)' }}
              className="glass-dark p-6 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-white/10 relative overflow-hidden transition-colors duration-300 hover:border-white/20"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none"></div>
              <div className="flex items-center mb-6 relative z-10">
                <div className="p-3 bg-slate-800/50 rounded-2xl mr-4 border border-white/5 shadow-inner">
                  <Server className="w-6 h-6 text-slate-300 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]" />
                </div>
                <h3 className="text-lg font-bold text-slate-100 drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">服务器状态</h3>
              </div>

              <div className="space-y-6 relative z-10">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-slate-400 flex items-center">
                      <Cpu className="w-4 h-4 mr-2" />
                      CPU 使用率 ({stats.server.cpuCount} 核)
                    </span>
                    <span className="text-sm font-bold text-slate-200 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">{stats.server.cpuUsage}%</span>
                  </div>
                  <ProgressBar value={stats.server.cpuUsage} />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-slate-400 flex items-center">
                      <HardDrive className="w-4 h-4 mr-2" />
                      内存使用率
                    </span>
                    <span className="text-sm font-bold text-slate-200 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">{stats.server.memUsage}%</span>
                  </div>
                  <ProgressBar value={stats.server.memUsage} />
                  <p className="text-xs text-slate-500 mt-2 text-right">
                    {formatBytes(stats.server.usedMem)} / {formatBytes(stats.server.totalMem)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <div className="flex items-center text-slate-400 text-sm mb-2">
                      <Clock className="w-4 h-4 mr-2" />
                      运行时长
                    </div>
                    <p className="text-slate-100 font-semibold">{formatUptime(stats.server.uptime)}</p>
                  </div>
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <div className="flex items-center text-slate-400 text-sm mb-2">
                      <Activity className="w-4 h-4 mr-2" />
                      运行平台
                    </div>
                    <p className="text-slate-100 font-semibold uppercase">{stats.server.platform}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-100">
          暂时无法获取系统统计数据，请稍后重试。
        </div>
      )}
    </div>
  );
}
