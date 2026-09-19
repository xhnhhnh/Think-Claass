import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import CampusShell from '@/components/Layout/CampusShell';
import { adminNavEntries, iconFor } from '@/components/Layout/navRegistry';
import { adminPath } from '@/constants';

/**
 * Admin shell.
 *
 * The menu comes from the route table like the other three layouts. The admin path is injected at
 * runtime (`window.__TC_CONFIG__.adminPath`), so this asks `adminPath()` rather than importing the
 * build-time constant - using the constant here would send a renamed deployment's login redirect
 * to `/beiadmin/login`.
 */
export default function AdminLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = adminPath();

  if (!user) return null;

  const navItems = adminNavEntries().map((entry) => ({
    path: entry.path,
    label: entry.label,
    icon: iconFor(entry),
  }));

  const currentTitle = navItems.find((item) => item.path === location.pathname)?.label || '系统仪表盘';

  return (
    <CampusShell
      role="admin"
      title={currentTitle}
      subtitle="把公告、教师、激活码和系统配置整理成更稳、更清楚的校园运营台。"
      navItems={navItems}
      brandLabel="超级管理员"
      userLabel={user.username}
      userMeta="系统运营"
      homePath={basePath}
      onLogout={() => {
        logout();
        navigate(`${basePath}/login`);
      }}
    >
      <Outlet />
    </CampusShell>
  );
}
