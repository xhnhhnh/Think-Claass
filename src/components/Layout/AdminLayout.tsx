import { ADMIN_PATH } from "@/constants";
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { LayoutDashboard, Settings, Megaphone, FileText, Globe, Users, Shield, Server, Key, AlertTriangle } from 'lucide-react';
import CampusShell from '@/components/Layout/CampusShell';

export default function AdminLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

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
    { path: `${ADMIN_PATH}/reset`, icon: AlertTriangle, label: '系统重置' },
  ];

  const currentTitle = navItems.find(item => item.path === location.pathname)?.label || '系统仪表盘';

  return (
    <CampusShell
      role="admin"
      title={currentTitle}
      subtitle="把公告、教师、激活码和系统配置整理成更稳、更清楚的校园运营台。"
      navItems={navItems}
      brandLabel="超级管理员"
      userLabel={user.username}
      userMeta="系统运营"
      homePath={ADMIN_PATH}
      onLogout={() => {
        logout();
        navigate(`${ADMIN_PATH}/login`);
      }}
    >
      <Outlet />
    </CampusShell>
  );
}
