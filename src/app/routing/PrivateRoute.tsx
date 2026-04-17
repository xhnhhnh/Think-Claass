import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { ADMIN_PATH } from '@/constants';
import { useSettings } from '@/hooks/queries/useSettings';
import { useStore } from '@/store/useStore';

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
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    if (window.location.pathname.startsWith(ADMIN_PATH)) {
      return <Navigate to={`${ADMIN_PATH}/login`} replace />;
    }

    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const needsActivation =
    settings.revenue_enabled === '1' &&
    !user.is_activated &&
    user.role !== 'admin' &&
    user.role !== 'superadmin' &&
    user.role !== 'teacher';

  if (needsActivation) {
    if (settings.revenue_mode === 'activation_code' && window.location.pathname !== '/activate') {
      return <Navigate to="/activate" replace />;
    }

    if (settings.revenue_mode === 'direct_payment' && window.location.pathname !== '/payment') {
      return <Navigate to="/payment" replace />;
    }
  }

  return <>{children}</>;
}
