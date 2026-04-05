import { ADMIN_PATH } from "@/constants";
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
      navigate(`${ADMIN_PATH}/login`);
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
            onClick={() => navigate(ADMIN_PATH)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === ADMIN_PATH ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <LayoutDashboard className={`mr-3 h-5 w-5 ${location.pathname === ADMIN_PATH ? 'text-white' : 'text-slate-400'}`} />
            系统仪表盘
          </button>
          <button
            onClick={() => navigate(`${ADMIN_PATH}/announcements`)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === `${ADMIN_PATH}/announcements` ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Megaphone className={`mr-3 h-5 w-5 ${location.pathname === `${ADMIN_PATH}/announcements` ? 'text-white' : 'text-slate-400'}`} />
            公告管理
          </button>
          <button
            onClick={() => navigate(`${ADMIN_PATH}/articles`)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === `${ADMIN_PATH}/articles` ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileText className={`mr-3 h-5 w-5 ${location.pathname === `${ADMIN_PATH}/articles` ? 'text-white' : 'text-slate-400'}`} />
            文章管理
          </button>
          <button
            onClick={() => navigate(`${ADMIN_PATH}/website`)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === `${ADMIN_PATH}/website` ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Globe className={`mr-3 h-5 w-5 ${location.pathname === `${ADMIN_PATH}/website` ? 'text-white' : 'text-slate-400'}`} />
            网站设置
          </button>
          <button
            onClick={() => navigate(`${ADMIN_PATH}/teachers`)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === `${ADMIN_PATH}/teachers` ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users className={`mr-3 h-5 w-5 ${location.pathname === `${ADMIN_PATH}/teachers` ? 'text-white' : 'text-slate-400'}`} />
            教师管理
          </button>
          <button
            onClick={() => navigate(`${ADMIN_PATH}/codes`)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === `${ADMIN_PATH}/codes` ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Key className={`mr-3 h-5 w-5 ${location.pathname === `${ADMIN_PATH}/codes` ? 'text-white' : 'text-slate-400'}`} />
            激活码管理
          </button>
          <button
            onClick={() => navigate(`${ADMIN_PATH}/settings`)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === `${ADMIN_PATH}/settings` ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className={`mr-3 h-5 w-5 ${location.pathname === `${ADMIN_PATH}/settings` ? 'text-white' : 'text-slate-400'}`} />
            系统设置
          </button>
          <button
            onClick={() => navigate(`${ADMIN_PATH}/openapi`)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === `${ADMIN_PATH}/openapi` ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Server className={`mr-3 h-5 w-5 ${location.pathname === `${ADMIN_PATH}/openapi` ? 'text-white' : 'text-slate-400'}`} />
            开发者与校园
          </button>
          <button
            onClick={() => navigate(`${ADMIN_PATH}/audit-logs`)}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${
              location.pathname === `${ADMIN_PATH}/audit-logs` ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Shield className={`mr-3 h-5 w-5 ${location.pathname === `${ADMIN_PATH}/audit-logs` ? 'text-white' : 'text-slate-400'}`} />
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
              navigate(`${ADMIN_PATH}/login`);
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
            {location.pathname === ADMIN_PATH && '系统仪表盘'}
            {location.pathname === `${ADMIN_PATH}/announcements` && '公告管理'}
            {location.pathname === `${ADMIN_PATH}/articles` && '文章管理'}
            {location.pathname === `${ADMIN_PATH}/website` && '网站设置'}
            {location.pathname === `${ADMIN_PATH}/teachers` && '教师管理'}
            {location.pathname === `${ADMIN_PATH}/codes` && '激活码管理'}
            {location.pathname === `${ADMIN_PATH}/settings` && '系统设置'}
            {location.pathname === `${ADMIN_PATH}/openapi` && '开发者与校园'}
            {location.pathname === `${ADMIN_PATH}/audit-logs` && '审计日志'}
          </h1>
        </header>
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
