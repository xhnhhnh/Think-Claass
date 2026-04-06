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

  const navItems = [
    { path: ADMIN_PATH, icon: LayoutDashboard, label: '系统仪表盘' },
    { path: `${ADMIN_PATH}/announcements`, icon: Megaphone, label: '公告管理' },
    { path: `${ADMIN_PATH}/articles`, icon: FileText, label: '文章管理' },
    { path: `${ADMIN_PATH}/website`, icon: Globe, label: '网站设置' },
    { path: `${ADMIN_PATH}/teachers`, icon: Users, label: '教师管理' },
    { path: `${ADMIN_PATH}/codes`, icon: Key, label: '激活码管理' },
    { path: `${ADMIN_PATH}/settings`, icon: Settings, label: '系统设置' },
    { path: `${ADMIN_PATH}/openapi`, icon: Server, label: '开发者与校园' },
    { path: `${ADMIN_PATH}/audit-logs`, icon: Shield, label: '审计日志' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col font-sans theme-admin relative overflow-hidden">
      {/* Decorative ambient background elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[100px] pointer-events-none" />

      <div className="flex-1 flex overflow-hidden p-4 gap-6 z-10">
        {/* Sidebar */}
        <aside className="w-64 glass-dark rounded-3xl flex flex-col z-10 relative overflow-hidden border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
          <div className="h-20 flex items-center px-8 border-b border-white/10 flex-shrink-0 relative z-10">
            <Settings className="mr-3 h-8 w-8 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
            <span className="font-bold text-xl tracking-wide text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">超级管理员</span>
          </div>
          
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar relative z-10">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-2xl transition-all duration-300 relative overflow-hidden group ${
                    isActive 
                      ? 'bg-blue-500/20 text-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.2)] border border-blue-500/30' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent opacity-50 pointer-events-none" />
                  )}
                  <Icon className={`mr-3 h-5 w-5 transition-all duration-300 ${
                    isActive 
                      ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]' 
                      : 'text-slate-500 group-hover:text-slate-300 group-hover:drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]'
                  }`} />
                  <span className={`relative z-10 ${isActive ? 'drop-shadow-[0_0_5px_rgba(147,197,253,0.5)]' : ''}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
          
          <div className="p-4 border-t border-white/10 bg-black/20 relative z-10 backdrop-blur-md">
            <div className="flex items-center px-4 py-3 text-sm text-slate-300 font-medium mb-2">
              <span className="truncate">欢迎, {user.username}</span>
            </div>
            <button
              onClick={() => {
                logout();
                navigate(`${ADMIN_PATH}/login`);
              }}
              className="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 border border-transparent hover:border-red-500/20 transition-all duration-300 group hover:shadow-[0_0_15px_rgba(239,68,68,0.15)]"
            >
              <LogOut className="mr-3 h-5 w-5 group-hover:drop-shadow-[0_0_8px_rgba(248,113,113,0.8)] transition-all duration-300" />
              退出登录
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 glass-dark rounded-3xl overflow-hidden relative">
          <header className="h-20 border-b border-white/10 flex items-center px-8 flex-shrink-0 z-10 relative bg-white/5">
            <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">
              {navItems.find(item => item.path === location.pathname)?.label || '系统仪表盘'}
            </h1>
          </header>
          <main className="flex-1 overflow-auto p-8 relative bg-white/5">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}