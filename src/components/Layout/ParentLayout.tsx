import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { LogOut, Home, MessageSquare, PieChart, CheckSquare, Calendar, BookOpen, Heart } from 'lucide-react';
import { useEffect } from 'react';

const navItems = [
  { path: '/parent/dashboard', icon: Home, label: '温馨家园' },
  { path: '/parent/communication', icon: MessageSquare, label: '家校信箱' },
  { path: '/parent/report', icon: PieChart, label: '成长足迹' },
  { path: '/parent/tasks', icon: CheckSquare, label: '家庭时光' },
  { path: '/parent/leave-request', icon: Calendar, label: '请假假条' },
  { path: '/parent/assignments', icon: BookOpen, label: '学习采撷' },
];

export default function ParentLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user || user.role !== 'parent') {
      navigate('/login');
    }
  }, [user, navigate]);

  if (!user || user.role !== 'parent') return null;

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col font-sans theme-parent relative overflow-hidden">
      {/* Decorative ambient background elements */}
      <div className="absolute top-[-10%] right-[-5%] w-[30%] h-[40%] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-pink-400/10 blur-[100px] pointer-events-none" />

      <div className="flex-1 flex overflow-hidden p-4 gap-6 z-10">
        {/* Sidebar */}
        <aside className="w-64 glass rounded-3xl flex flex-col z-10 relative overflow-hidden soft-shadow">
          <div className="h-20 flex items-center px-8 border-b border-white/20 flex-shrink-0">
            <Heart className="mr-3 h-8 w-8 text-primary" />
            <span className="font-bold text-xl tracking-wide gemini-gradient-text">成长日记</span>
          </div>
          
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-2xl transition-all duration-300 ${
                    isActive 
                      ? 'bg-primary/10 text-primary shadow-sm border border-primary/20 glow-shadow' 
                      : 'text-gray-500 hover:bg-black/5 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-primary' : 'text-gray-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          
          <div className="p-4 border-t border-white/20 bg-white/30">
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut className="mr-3 h-5 w-5" />
              轻轻离开
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 glass rounded-3xl overflow-hidden relative soft-shadow">
          <header className="h-20 border-b border-white/20 flex items-center px-8 flex-shrink-0 z-10 relative bg-white/40">
            <h1 className="text-2xl font-semibold text-gray-800 tracking-tight">
              {navItems.find(item => item.path === location.pathname)?.label || '温馨家园'}
            </h1>
          </header>
          <main className="flex-1 overflow-auto p-8 relative bg-white/50">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}