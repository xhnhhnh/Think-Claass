import { useState, useEffect, useRef } from 'react';
import { Server, Users, GraduationCap, School, Activity, Cpu, HardDrive, Clock, RefreshCw, Download, Upload, BookOpen, Calendar, Target, Award } from 'lucide-react';
import { toast } from 'sonner';

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
      const data = await apiPost('/api/admin/data/import', formData);

      if (data.success) {
        toast.success(data.message);
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        toast.error(data.message || '导入失败');
      }
    } catch (error) {
      toast.error('网络错误，导入失败');
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
          <h2 className="text-2xl font-bold text-slate-800">系统仪表盘</h2>
          <p className="text-slate-500 mt-1">实时监控系统运行状态与数据统计</p>
        </div>
        <div className="flex items-center space-x-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".sqlite" 
            onChange={handleImport}
          />
          <button 
            onClick={handleExport}
            className="flex items-center px-4 py-2 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            导出数据
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center px-4 py-2 bg-amber-50 text-amber-600 rounded-2xl hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            <Upload className={`w-4 h-4 mr-2 ${importing ? 'animate-bounce' : ''}`} />
            {importing ? '导入中...' : '导入数据'}
          </button>
          <button 
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-blue-50/50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新数据
          </button>
        </div>
      </div>

      {!stats && loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : stats ? (
        <>
          {/* Database Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="总用户数" 
              value={stats.database.totalUsers} 
              icon={<Users className="w-6 h-6 text-blue-500" />} 
              bgColor="bg-blue-50/50"
            />
            <StatCard 
              title="教师人数" 
              value={stats.database.teachers} 
              icon={<School className="w-6 h-6 text-indigo-500" />} 
              bgColor="bg-indigo-50"
            />
            <StatCard 
              title="学生人数" 
              value={stats.database.students} 
              icon={<GraduationCap className="w-6 h-6 text-emerald-500" />} 
              bgColor="bg-emerald-50"
            />
            <StatCard 
              title="班级数量" 
              value={stats.database.classes} 
              icon={<School className="w-6 h-6 text-amber-500" />} 
              bgColor="bg-amber-50"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
            <StatCard 
              title="总作业数" 
              value={stats.database.totalAssignments} 
              icon={<BookOpen className="w-6 h-6 text-purple-500" />} 
              bgColor="bg-purple-50"
            />
            <StatCard 
              title="请假记录" 
              value={stats.database.totalLeaves} 
              icon={<Calendar className="w-6 h-6 text-pink-500" />} 
              bgColor="bg-pink-50"
            />
            <StatCard 
              title="组队任务" 
              value={stats.database.totalTeamQuests} 
              icon={<Target className="w-6 h-6 text-orange-500" />} 
              bgColor="bg-orange-50"
            />
            <StatCard 
              title="系统总积分" 
              value={stats.database.totalPoints} 
              icon={<Award className="w-6 h-6 text-yellow-500" />} 
              bgColor="bg-yellow-50"
            />
          </div>

          {/* Server Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-slate-100 rounded-2xl mr-4">
                  <Server className="w-6 h-6 text-slate-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">服务器状态</h3>
              </div>
              
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-slate-600 flex items-center">
                      <Cpu className="w-4 h-4 mr-2" />
                      CPU 使用率 ({stats.server.cpuCount} 核)
                    </span>
                    <span className="text-sm font-bold text-slate-800">{stats.server.cpuUsage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full ${stats.server.cpuUsage > 80 ? 'bg-red-500' : stats.server.cpuUsage > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                      style={{ width: `${Math.min(stats.server.cpuUsage, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-slate-600 flex items-center">
                      <HardDrive className="w-4 h-4 mr-2" />
                      内存使用率
                    </span>
                    <span className="text-sm font-bold text-slate-800">{stats.server.memUsage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full ${stats.server.memUsage > 80 ? 'bg-red-500' : stats.server.memUsage > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                      style={{ width: `${Math.min(stats.server.memUsage, 100)}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 text-right">
                    {formatBytes(stats.server.usedMem)} / {formatBytes(stats.server.totalMem)}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1 flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      系统运行时间
                    </p>
                    <p className="text-sm font-medium text-slate-800">{formatUptime(stats.server.uptime)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1 flex items-center">
                      <Server className="w-3 h-3 mr-1" />
                      操作系统
                    </p>
                    <p className="text-sm font-medium text-slate-800 capitalize">{stats.server.platform}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-blue-50/50 rounded-2xl mr-4">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">系统活跃度</h3>
              </div>
              
              <div className="flex flex-col justify-center items-center h-48 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                <p className="text-sm text-slate-500 mb-2">系统总活动记录数</p>
                <p className="text-5xl font-black text-blue-600">{stats.database.totalActivity.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-4">包含积分变动、兑换、操作等所有记录</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-slate-500">
          无法加载数据
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, bgColor }: { title: string, value: number, icon: React.ReactNode, bgColor: string }) {
  return (
    <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex items-center">
      <div className={`p-4 rounded-xl mr-4 ${bgColor}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-800">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
