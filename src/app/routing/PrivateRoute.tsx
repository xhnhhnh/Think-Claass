import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { ADMIN_PATH } from '@/constants';
import { useSettings } from '@/hooks/queries/useSettings';
import { useStore } from '@/store/useStore';

import { AppSplash } from './AppSplash';
import { homePathForRole } from './homePath';

export default function PrivateRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: string[];
}) {
  const { user } = useStore();
  const { data: settings = {}, isLoading } = useSettings();

  if (isLoading) {
    return <AppSplash label="正在准备你的工作台…" />;
  }

  if (!user) {
    if (window.location.pathname.startsWith(ADMIN_PATH)) {
      return <Navigate to={`${ADMIN_PATH}/login`} replace />;
    }

    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    /*
     * A signed-in account that opens another console's URL belongs in its own console.
     *
     * This used to send everyone to `/`, the marketing homepage - so a teacher who followed a
     * student link lost the console and was offered a sign-in form instead. Falling back to the
     * role's home keeps the session and the navigation meaningful.
     */
    const home = homePathForRole(user.role);
    return <Navigate to={home} replace />;
  }

  const needsActivation =
    settings.revenue_enabled === '1' &&
    !user.is_activated &&
    user.role !== 'admin' &&
    user.role !== 'superadmin' &&
    user.role !== 'teacher';

  /**
   * Where an unactivated account goes depends on how the deployment takes money.
   *
   * `direct_payment` is the operator's choice in 系统设置, and it was unreachable: this file only
   * ever sent people to `/activate`, the settings page refused to save that mode, and `/payment` was
   * a static "稍后开发" card nobody linked to. The three halves were each other's alibi.
   */
  const activationTarget = settings.revenue_mode === 'direct_payment' ? '/payment' : '/activate';

  if (needsActivation && window.location.pathname !== activationTarget) {
    return <Navigate to={activationTarget} replace />;
  }

  return <>{children}</>;
}
