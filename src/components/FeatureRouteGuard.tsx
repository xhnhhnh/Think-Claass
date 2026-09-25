import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, LoaderCircle } from 'lucide-react';

import FeatureDisabledState from '@/components/FeatureDisabledState';
import { Button } from '@/components/ui/button';
import { getFirstEnabledRoute, isFeatureRequirementEnabled, type FeatureRequirement } from '@/lib/classFeatures';
import { useStore } from '@/store/useStore';
import { useResolvedClassFeatures } from '@/features/classroom/hooks/useResolvedClassFeatures';

/**
 * Gate one page on the class's feature flags.
 *
 * Three states, and keeping them apart is the point:
 *
 *   - **unknown** - no answer yet (the flags are loading, and no login snapshot exists to fall back
 *     on). Render a loading state. It must NOT render the disabled state: doing so painted
 *     「功能未开放」over every gated page for the first frames after a refresh, which reads as "this
 *     feature is broken" rather than "one moment".
 *   - **unavailable** - the request failed and there was nothing to fall back on. Render an error
 *     with a retry, because the alternative is a page permanently locked by a transient network
 *     failure with no way out.
 *   - **off** - the teacher really did switch this feature off. Render the disabled state, which is
 *     the only case entitled to say so.
 */
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
  const { features, canDecide, isError, refetch } = useResolvedClassFeatures(classId, {
    refetchInterval: 5000,
  });

  if (!canDecide) {
    // A failed request with no snapshot is a distinct state from a slow one: one is worth waiting
    // for, the other needs a way out.
    if (isError) {
      return (
        <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 text-center">
          <AlertCircle className="size-8 text-warning" />
          <div>
            <h2 className="text-lg font-bold text-ink-1">无法读取班级功能配置</h2>
            <p className="mt-1 text-sm text-ink-3">
              班级功能开关没有加载成功，这不代表功能被关闭。请重试。
            </p>
          </div>
          <Button variant="outline" onClick={refetch}>
            重新加载
          </Button>
        </div>
      );
    }

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-3">
        <LoaderCircle className="size-6 animate-spin text-primary" />
        <p className="text-sm">正在读取班级功能配置...</p>
      </div>
    );
  }

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
