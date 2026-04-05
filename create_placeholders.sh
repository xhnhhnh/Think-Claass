#!/bin/bash
mkdir -p src/pages/Parent src/pages/Teacher src/pages/Student src/pages/Admin src/pages/Home src/components/Layout

create_component() {
  local path=$1
  local name=$2
  if [ ! -f "$path" ]; then
    echo "export default function $name() { return <div className=\"p-8 text-center text-gray-500\">$name 功能正在重写恢复中...</div>; }" > "$path"
  fi
}

# Parent
create_component src/pages/Parent/Dashboard.tsx ParentDashboard
create_component src/pages/Parent/Communication.tsx ParentCommunication
create_component src/pages/Parent/Report.tsx ParentReport
create_component src/pages/Parent/Tasks.tsx ParentTasks

# Teacher
create_component src/pages/Teacher/Bigscreen.tsx TeacherBigscreen
create_component src/pages/Teacher/Analysis.tsx TeacherAnalysis
create_component src/pages/Teacher/Communication.tsx TeacherCommunication
create_component src/pages/Teacher/LuckyDrawConfig.tsx TeacherLuckyDrawConfig
create_component src/pages/Teacher/Tools.tsx TeacherTools
create_component src/pages/Teacher/Verification.tsx TeacherVerification
create_component src/pages/Teacher/Settings.tsx TeacherSettings

# Student
create_component src/pages/Student/Challenge.tsx StudentChallenge
create_component src/pages/Student/LuckyDraw.tsx StudentLuckyDraw
create_component src/pages/Student/MyRedemptions.tsx StudentMyRedemptions
create_component src/pages/Student/InteractiveWall.tsx StudentInteractiveWall

# Admin
create_component src/pages/Admin/Website.tsx AdminWebsite
create_component src/pages/Admin/Teachers.tsx AdminTeachers
create_component src/pages/Admin/Settings.tsx AdminSettings

# Home (Public)
create_component src/pages/Home/About.tsx HomeAbout
create_component src/pages/Home/Contact.tsx HomeContact
create_component src/pages/Home/News.tsx HomeNews
create_component src/pages/Home/Services.tsx HomeServices

# Create Parent Layout
if [ ! -f src/components/Layout/ParentLayout.tsx ]; then
cat << 'LAYOUT' > src/components/Layout/ParentLayout.tsx
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { LogOut, Home, MessageSquare, PieChart, CheckSquare } from 'lucide-react';
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
    <div className="min-h-screen bg-gray-50 flex">
      <div className="w-64 bg-slate-900 text-white shadow-xl flex flex-col">
        <div className="h-16 flex items-center px-6 bg-slate-800 font-bold text-xl tracking-wider shadow-sm">
          家长端
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button onClick={() => navigate('/parent/dashboard')} className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${location.pathname === '/parent/dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <Home className="mr-3 h-5 w-5" />总览
          </button>
          <button onClick={() => navigate('/parent/communication')} className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${location.pathname === '/parent/communication' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <MessageSquare className="mr-3 h-5 w-5" />家校沟通
          </button>
          <button onClick={() => navigate('/parent/report')} className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${location.pathname === '/parent/report' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <PieChart className="mr-3 h-5 w-5" />学情报告
          </button>
          <button onClick={() => navigate('/parent/tasks')} className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all ${location.pathname === '/parent/tasks' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <CheckSquare className="mr-3 h-5 w-5" />家庭任务
          </button>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => { logout(); navigate('/login'); }} className="w-full flex items-center px-4 py-2 text-sm font-medium rounded-lg text-red-400 hover:bg-slate-800 transition-colors">
            <LogOut className="mr-3 h-5 w-5" />退出登录
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <main className="p-8"><Outlet /></main>
      </div>
    </div>
  );
}
LAYOUT
fi
