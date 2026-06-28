import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import FeatureDisabledState from '@/components/FeatureDisabledState';
import {
  defaultClassFeatures,
  getFirstEnabledRoute,
  isFeatureRequirementEnabled,
  type ClassFeatures,
  type FeatureRequirement,
} from '@/lib/classFeatures';
import { useStore } from '@/store/useStore';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';

export default function FeatureRouteGuard({
  role,
  requirement,
  fallbackPath,
  title,
  children,
}: {
  role: 'student' | 'parent';
  requirement?: FeatureRequirement;
  fallbackPath?: string | null;
  title: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const user = useStore((state) => state.user);
  const classId = Number(user?.classId ?? user?.class_id) || null;
  const { data: classFeatureData } = useClassFeatures(classId, { refetchInterval: 5000 });
  const features = (classId
    ? classFeatureData?.features ?? defaultClassFeatures
    : user?.classFeatures ?? defaultClassFeatures) as ClassFeatures;

  if (!isFeatureRequirementEnabled(features, requirement)) {
    const nextPath = fallbackPath ?? getFirstEnabledRoute(role, features);

    return (
      <FeatureDisabledState
        title={`${title}当前未开放`}
        description="老师已关闭当前班级的这项功能，请返回其他已开放页面继续使用。"
        actionLabel={nextPath ? '前往可用页面' : undefined}
        onAction={nextPath ? () => navigate(nextPath) : undefined}
      />
    );
  }

  return <>{children}</>;
}
