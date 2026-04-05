import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { LogOut, LayoutDashboard, Settings, Megaphone, FileText, Globe, Users, Shield, Server, Key } from 'lucide-react';
import { useEffect } from 'react';

export default function AdminLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user || user.role !== 'superadmin') {
      navigate('/beiadmin/login');
    }
  }, [user, navigate]);

  if (!user || user.role !== 'superadmin') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900/95 backdrop-blur-2xl text-white shadow-[4px_0_24px_rgba(0,0,0,0.1)] flex flex-col border-r border-slate-700/50">
        <div className="h-16 flex items-center px-6 bg-slate-800/50 font-bold text-xl tracking-wide shadow-sm border-b border-slate-700/50">
          <Settings className="mr-2 h-6 w-6 text-blue-400" />
          超级管理员后台
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button
            onClick={() => navigate('/beiadmin')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/beiadmin' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <LayoutDashboard className={`mr-3 h-5 w-5 ${location.pathname === '/beiadmin' ? 'text-white' : 'text-slate-400'}`} />
            系统仪表盘
          </button>
          <button
            onClick={() => navigate('/beiadmin/announcements')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/beiadmin/announcements' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Megaphone className={`mr-3 h-5 w-5 ${location.pathname === '/beiadmin/announcements' ? 'text-white' : 'text-slate-400'}`} />
            公告管理
          </button>
          <button
            onClick={() => navigate('/beiadmin/articles')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/beiadmin/articles' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileText className={`mr-3 h-5 w-5 ${location.pathname === '/beiadmin/articles' ? 'text-white' : 'text-slate-400'}`} />
            文章管理
          </button>
          <button
            onClick={() => navigate('/beiadmin/website')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/beiadmin/website' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Globe className={`mr-3 h-5 w-5 ${location.pathname === '/beiadmin/website' ? 'text-white' : 'text-slate-400'}`} />
            网站设置
          </button>
          <button
            onClick={() => navigate('/beiadmin/teachers')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/beiadmin/teachers' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users className={`mr-3 h-5 w-5 ${location.pathname === '/beiadmin/teachers' ? 'text-white' : 'text-slate-400'}`} />
            教师管理
          </button>
          <button
            onClick={() => navigate('/beiadmin/codes')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/beiadmin/codes' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Key className={`mr-3 h-5 w-5 ${location.pathname === '/beiadmin/codes' ? 'text-white' : 'text-slate-400'}`} />
            激活码管理
          </button>
          <button
            onClick={() => navigate('/beiadmin/settings')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/beiadmin/settings' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className={`mr-3 h-5 w-5 ${location.pathname === '/beiadmin/settings' ? 'text-white' : 'text-slate-400'}`} />
            系统设置
          </button>
          <button
            onClick={() => navigate('/beiadmin/openapi')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/beiadmin/openapi' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Server className={`mr-3 h-5 w-5 ${location.pathname === '/beiadmin/openapi' ? 'text-white' : 'text-slate-400'}`} />
            开发者与校园
          </button>
          <button
            onClick={() => navigate('/beiadmin/audit-logs')}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === '/beiadmin/audit-logs' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Shield className={`mr-3 h-5 w-5 ${location.pathname === '/beiadmin/audit-logs' ? 'text-white' : 'text-slate-400'}`} />
            审计日志
          </button>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center px-4 py-3 text-sm text-slate-300 font-medium mb-2">
            <span className="truncate">欢迎, {user.username}</span>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/beiadmin/login');
            }}
            className="w-full flex items-center px-4 py-2 text-sm font-medium rounded-lg text-red-400 hover:bg-slate-800 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5" />
            退出登录
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <header className="bg-white/60 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.02)] h-16 border-b border-white/40 flex items-center px-8 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-800">
            {location.pathname === '/beiadmin' && '系统仪表盘'}
            {location.pathname === '/beiadmin/announcements' && '公告管理'}
            {location.pathname === '/beiadmin/articles' && '文章管理'}
            {location.pathname === '/beiadmin/website' && '网站设置'}
            {location.pathname === '/beiadmin/teachers' && '教师管理'}
            {location.pathname === '/beiadmin/codes' && '激活码管理'}
            {location.pathname === '/beiadmin/settings' && '系统设置'}
            {location.pathname === '/beiadmin/openapi' && '开发者与校园'}
            {location.pathname === '/beiadmin/audit-logs' && '审计日志'}
          </h1>
        </header>
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
