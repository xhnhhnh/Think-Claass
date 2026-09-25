import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

import { AppShell } from '@/app/layouts/AppShell';
import { adminPath } from '@/constants';
import { defaultClassFeatures } from '@/lib/classFeatures';
import { useStore } from '@/store/useStore';

/**
 * Admin console.
 *
 * ## The one thing this layout must not get wrong
 *
 * The console's path is injected by the server at runtime
 * (`window.__TC_CONFIG__.adminPath`), so everything here asks `adminPath()` rather than
 * importing the build-time constant. Using the constant is what sent a renamed
 * deployment's login redirect to `/beiadmin/login` and forced a `sed` rewrite of the built
 * bundle. The route table resolves the same value, and `usePageMeta` resolves the console
 * by its layout module rather than by a path, so all three agree on whatever the
 * deployment chose.
 *
 * ## Why there is no feature gating here
 *
 * Class feature flags are a classroom concept: they decide what a student sees and what a
 * teacher configures. The admin console is not in a class, so its menu is ungated and it
 * passes the default (all-on) feature set, which is also why `navSections` returns groups
 * for it rather than an empty list - the groups come from the layout module, not the flags.
 */
export default function AdminLayout() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = adminPath();

  void location;

  if (!user) return null;

  return (
    <AppShell
      role="admin"
      /*
       * The brand label is short on purpose. It sits in a 240-pixel rail beside an icon,
       * and 「超级管理员」 - the label the previous shell used - is wider than the space
       * left for it, so it rendered as 「超级管理』」 with the last glyph cut. 「管理后台」
       * is also what the console's own login page already calls itself, so this is one
       * name rather than two.
       */
      brand={{ label: '管理后台', meta: user.username, icon: ShieldCheck }}
      fallbackTitle="系统仪表盘"
      homePath={basePath}
      settingsPath={`${basePath}/profile`}
      features={defaultClassFeatures}
      userLabel={user.username}
      onLogout={() => {
        logout();
        navigate(`${basePath}/login`);
      }}
    >
      <Outlet />
    </AppShell>
  );
}
