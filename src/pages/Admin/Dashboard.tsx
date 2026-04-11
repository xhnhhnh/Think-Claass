import { useState, useEffect, useRef } from 'react';
import { Server, Users, GraduationCap, School, Activity, Cpu, HardDrive, Clock, RefreshCw, Download, Upload, BookOpen, Calendar, Target, Award } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

import { apiGet, apiPost } from "@/lib/api";

interface Stats {
  server: {
    cpuUsage: number;
    cpuCount: number;
    totalMem: number;
    usedMem: number;
    freeMem: number;
    memUsage: number;
    uptime: number;
    platform: string;
  };
  database: {
    totalUsers: number;
    teachers: number;
    students: number;
    classes: number;
    totalActivity: number;
    totalAssignments: number;
    totalLeaves: number;
    totalTeamQuests: number;
    totalPoints: number;
  };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      type: "spring" as const,
      stiffness: 300,
      damping: 24
    } 
  }
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/admin/stats');
      if (data.success) {
        setStats(data.data);
      } else {
        toast.error(data.message || '获取数据失败');
      }
    } catch (error) {
      toast.error('网络错误，无法获取统计数据');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (confirm('确定要导出所有数据吗？')) {
      window.location.href = '/api/admin/data/export';
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('确定要导入此数据文件吗？这将会覆盖当前所有数据！\n导入成功后服务器将自动重启。')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const data = await apiPost('/api/admin/data/import', formData, { showError: false });

      if (data.success) {
        toast.success(data.message);
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        toast.error(data.message || '导入失败');
      }
    } catch (error) {
      const message = (error as any)?.response?.data?.message || (error as any)?.data?.message || (error as any)?.message;
      toast.error(message || '网络错误，导入失败');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}天 ${h}小时 ${m}分钟`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">系统仪表盘</h2>
          <p className="text-slate-400 mt-1">实时监控系统运行状态与数据统计</p>
        </div>
        <div className="flex items-center space-x-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".sqlite" 
            onChange={handleImport}
          />
          <motion.button 
            onClick={handleExport}
            whileHover={{ y: -2, boxShadow: "0 0 15px rgba(16,185,129,0.5)" }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl hover:bg-emerald-500/30 transition-colors duration-300"
          >
            <Download className="w-4 h-4 mr-2" />
            导出数据
          </motion.button>
          <motion.button 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            whileHover={{ y: -2, boxShadow: "0 0 15px rgba(245,158,11,0.5)" }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl hover:bg-amber-500/30 transition-colors duration-300 disabled:opacity-50"
          >
            <Upload className={`w-4 h-4 mr-2 ${importing ? 'animate-bounce' : ''}`} />
            {importing ? '导入中...' : '导入数据'}
          </motion.button>
          <motion.button 
            onClick={fetchStats}
            disabled={loading}
            whileHover={{ y: -2, boxShadow: "0 0 15px rgba(59,130,246,0.5)" }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-2xl hover:bg-blue-500/30 transition-colors duration-300 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新数据
          </motion.button>
        </div>
      </div>

      {!stats && loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]"></div>
        </div>
      ) : stats ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Database Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="总用户数" 
              value={stats.database.totalUsers} 
              icon={<Users className="w-6 h-6 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" />} 
              bgColor="bg-blue-500/20"
              glowColor="bg-blue-500"
            />
            <StatCard 
              title="教师人数" 
              value={stats.database.teachers} 
              icon={<School className="w-6 h-6 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]" />} 
              bgColor="bg-indigo-500/20"
              glowColor="bg-indigo-500"
            />
            <StatCard 
              title="学生人数" 
              value={stats.database.students} 
              icon={<GraduationCap className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />} 
              bgColor="bg-emerald-500/20"
              glowColor="bg-emerald-500"
            />
            <StatCard 
              title="班级数量" 
              value={stats.database.classes} 
              icon={<School className="w-6 h-6 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />} 
              bgColor="bg-amber-500/20"
              glowColor="bg-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
            <StatCard 
              title="总作业数" 
              value={stats.database.totalAssignments} 
              icon={<BookOpen className="w-6 h-6 text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]" />} 
              bgColor="bg-purple-500/20"
              glowColor="bg-purple-500"
            />
            <StatCard 
              title="请假记录" 
              value={stats.database.totalLeaves} 
              icon={<Calendar className="w-6 h-6 text-pink-400 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)]" />} 
              bgColor="bg-pink-500/20"
              glowColor="bg-pink-500"
            />
            <StatCard 
              title="组队任务" 
              value={stats.database.totalTeamQuests} 
              icon={<Target className="w-6 h-6 text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]" />} 
              bgColor="bg-orange-500/20"
              glowColor="bg-orange-500"
            />
            <StatCard 
              title="系统总积分" 
              value={stats.database.totalPoints} 
              icon={<Award className="w-6 h-6 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" />} 
              bgColor="bg-yellow-500/20"
              glowColor="bg-yellow-500"
            />
          </div>

          {/* Server Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            <motion.div 
              variants={itemVariants}
              whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(255,255,255,0.1)" }}
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
                  <div className="w-full bg-slate-800/50 rounded-full h-2.5 border border-white/5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 shadow-[0_0_10px_currentColor] relative overflow-hidden ${stats.server.cpuUsage > 80 ? 'bg-red-500 text-red-500' : stats.server.cpuUsage > 50 ? 'bg-amber-500 text-amber-500' : 'bg-emerald-500 text-emerald-500'}`} 
                      style={{ width: `${Math.min(stats.server.cpuUsage, 100)}%` }}
                    >
                      <motion.div 
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-slate-400 flex items-center">
                      <HardDrive className="w-4 h-4 mr-2" />
                      内存使用率
                    </span>
                    <span className="text-sm font-bold text-slate-200 drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">{stats.server.memUsage}%</span>
                  </div>
                  <div className="w-full bg-slate-800/50 rounded-full h-2.5 border border-white/5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 shadow-[0_0_10px_currentColor] relative overflow-hidden ${stats.server.memUsage > 80 ? 'bg-red-500 text-red-500' : stats.server.memUsage > 50 ? 'bg-amber-500 text-amber-500' : 'bg-emerald-500 text-emerald-500'}`} 
                      style={{ width: `${Math.min(stats.server.memUsage, 100)}%` }}
                    >
                      <motion.div 
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear", delay: 0.5 }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 text-right">
                    {formatBytes(stats.server.usedMem)} / {formatBytes(stats.server.totalMem)}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <p className="text-xs text-slate-400 mb-1 flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      系统运行时间
                    </p>
                    <p className="text-sm font-medium text-slate-200">{formatUptime(stats.server.uptime)}</p>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                    <p className="text-xs text-slate-400 mb-1 flex items-center">
                      <Server className="w-3 h-3 mr-1" />
                      操作系统
                    </p>
                    <p className="text-sm font-medium text-slate-200 capitalize">{stats.server.platform}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div 
              variants={itemVariants}
              whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(255,255,255,0.1)" }}
              className="glass-dark p-6 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-white/10 relative overflow-hidden transition-colors duration-300 hover:border-white/20"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none"></div>
              <div className="flex items-center mb-6 relative z-10">
                <div className="p-3 bg-blue-500/20 rounded-2xl mr-4 border border-blue-500/30 shadow-inner">
                  <Activity className="w-6 h-6 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                </div>
                <h3 className="text-lg font-bold text-slate-100 drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">系统活跃度</h3>
              </div>
              
              <div className="flex flex-col justify-center items-center h-48 bg-black/20 rounded-xl border border-white/10 border-dashed relative z-10 overflow-hidden group hover:border-blue-500/50 transition-colors duration-300">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                <p className="text-sm text-slate-400 mb-2">系统总活动记录数</p>
                {stats.database.totalActivity > 0 ? (
                  <p className="text-5xl font-black text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.5)] tracking-tight">
                    {stats.database.totalActivity.toLocaleString()}
                  </p>
                ) : (
                  <div className="flex flex-col items-center justify-center opacity-80 my-2">
                    <p className="text-4xl font-black text-slate-500 drop-shadow-[0_0_10px_rgba(100,116,139,0.3)] tracking-tight">0</p>
                    <p className="text-xs text-slate-500 mt-1 font-medium bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50">暂无记录</p>
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-4">包含积分变动、兑换、操作等所有记录</p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          无法加载数据
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, bgColor, glowColor }: { title: string, value: number, icon: React.ReactNode, bgColor: string, glowColor: string }) {
  return (
    <motion.div 
      variants={itemVariants}
      whileHover={{ y: -5, boxShadow: "0 10px 30px rgba(255,255,255,0.1)" }}
      className="glass-dark p-6 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-white/10 flex items-center relative overflow-hidden group hover:border-white/20 transition-colors duration-300"
    >
      <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full blur-[50px] opacity-10 group-hover:opacity-30 transition-opacity duration-300 ${glowColor}`}></div>
      <div className={`p-4 rounded-xl mr-4 ${bgColor} border border-white/5 relative z-10 shadow-inner`}>
        {icon}
      </div>
      <div className="relative z-10">
        <p className="text-sm font-medium text-slate-400 mb-1 group-hover:text-slate-300 transition-colors">{title}</p>
        <p className="text-2xl font-bold text-slate-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] group-hover:drop-shadow-[0_0_12px_rgba(255,255,255,0.4)] transition-all">{value.toLocaleString()}</p>
      </div>
    </motion.div>
  );
}
