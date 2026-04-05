import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { LogOut, Home, MessageSquare, PieChart, CheckSquare, Calendar, BookOpen } from 'lucide-react';
import { useEffect } from 'react';

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
    <div className="min-h-screen bg-[#fdfbf7] flex text-stone-800 font-sans">
      <div className="w-64 bg-indigo-900 text-indigo-50 flex flex-col rounded-r-[2rem] shadow-[4px_0_24px_rgba(0,0,0,0.05)] m-4 mr-0 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-coral-500/10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none"></div>
        
        <div className="h-24 flex items-center px-8 font-bold text-2xl tracking-wider border-b border-indigo-800/50 relative z-10">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-coral-300 to-amber-200">成长日记</span>
        </div>
        <nav className="flex-1 px-4 py-8 space-y-3 relative z-10">
          <button onClick={() => navigate('/parent/dashboard')} className={`w-full flex items-center px-5 py-3.5 text-sm font-medium rounded-2xl transition-all duration-300 ${location.pathname === '/parent/dashboard' ? 'bg-coral-500 text-white shadow-lg shadow-coral-500/30 translate-x-2' : 'text-indigo-200 hover:bg-indigo-800/50 hover:text-white hover:translate-x-1'}`}>
            <Home className="mr-3 h-5 w-5" />温馨家园
          </button>
          <button onClick={() => navigate('/parent/communication')} className={`w-full flex items-center px-5 py-3.5 text-sm font-medium rounded-2xl transition-all duration-300 ${location.pathname === '/parent/communication' ? 'bg-coral-500 text-white shadow-lg shadow-coral-500/30 translate-x-2' : 'text-indigo-200 hover:bg-indigo-800/50 hover:text-white hover:translate-x-1'}`}>
            <MessageSquare className="mr-3 h-5 w-5" />家校信箱
          </button>
          <button onClick={() => navigate('/parent/report')} className={`w-full flex items-center px-5 py-3.5 text-sm font-medium rounded-2xl transition-all duration-300 ${location.pathname === '/parent/report' ? 'bg-coral-500 text-white shadow-lg shadow-coral-500/30 translate-x-2' : 'text-indigo-200 hover:bg-indigo-800/50 hover:text-white hover:translate-x-1'}`}>
            <PieChart className="mr-3 h-5 w-5" />成长足迹
          </button>
          <button onClick={() => navigate('/parent/tasks')} className={`w-full flex items-center px-5 py-3.5 text-sm font-medium rounded-2xl transition-all duration-300 ${location.pathname === '/parent/tasks' ? 'bg-coral-500 text-white shadow-lg shadow-coral-500/30 translate-x-2' : 'text-indigo-200 hover:bg-indigo-800/50 hover:text-white hover:translate-x-1'}`}>
            <CheckSquare className="mr-3 h-5 w-5" />家庭时光
          </button>
          <button onClick={() => navigate('/parent/leave-request')} className={`w-full flex items-center px-5 py-3.5 text-sm font-medium rounded-2xl transition-all duration-300 ${location.pathname === '/parent/leave-request' ? 'bg-coral-500 text-white shadow-lg shadow-coral-500/30 translate-x-2' : 'text-indigo-200 hover:bg-indigo-800/50 hover:text-white hover:translate-x-1'}`}>
            <Calendar className="mr-3 h-5 w-5" />请假假条
          </button>
          <button onClick={() => navigate('/parent/assignments')} className={`w-full flex items-center px-5 py-3.5 text-sm font-medium rounded-2xl transition-all duration-300 ${location.pathname === '/parent/assignments' ? 'bg-coral-500 text-white shadow-lg shadow-coral-500/30 translate-x-2' : 'text-indigo-200 hover:bg-indigo-800/50 hover:text-white hover:translate-x-1'}`}>
            <BookOpen className="mr-3 h-5 w-5" />学习采撷
          </button>
        </nav>
        <div className="p-6 border-t border-indigo-800/50 relative z-10">
          <button onClick={() => { logout(); navigate('/login'); }} className="w-full flex items-center px-5 py-3 text-sm font-medium rounded-2xl text-coral-300 hover:bg-indigo-800/50 transition-all duration-300">
            <LogOut className="mr-3 h-5 w-5" />轻轻离开
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <main className="p-8 max-w-7xl mx-auto"><Outlet /></main>
      </div>
    </div>
  );
}
