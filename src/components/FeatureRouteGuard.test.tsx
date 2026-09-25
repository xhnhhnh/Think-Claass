/**
 * The route guard's three states.
 *
 * `FeatureRouteGuard` gates every feature page in the student area on the class's 19 `enable_*`
 * flags. It used to have two states - on and off - and computed "off" from
 * `classFeatureData?.features ?? defaultClassFeatures`, where that default is **every flag false**
 * ("the state before a class's settings have loaded"). Two consequences, both user-visible:
 *
 *   - every gated page painted「功能未开放」for the first frames after a refresh, even when the
 *     feature was on;
 *   - if the features request failed, the page stayed locked for the whole session with no retry.
 *
 * So the assertions below are about *which* state renders, not about styling: a pending request
 * must show the loading state, a failed one must offer a retry, and only a real "off" may claim
 * the feature is closed.
 */

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FeatureRouteGuard from './FeatureRouteGuard';
import type { ClassFeatures } from '@/lib/classFeatures';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useResolvedClassFeatures: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/features/classroom/hooks/useResolvedClassFeatures', () => ({
  useResolvedClassFeatures: mocks.useResolvedClassFeatures,
}));

const ALL_OFF: ClassFeatures = {
  enable_achievements: false,
  enable_ai_study: false,
  enable_auction_blind_box: false,
  enable_challenge: false,
  enable_chat_bubble: false,
  enable_class_brawl: false,
  enable_danmaku: false,
  enable_dungeon: false,
  enable_economy: false,
  enable_family_tasks: false,
  enable_gacha: false,
  enable_guild_pk: false,
  enable_lucky_draw: false,
  enable_parent_buff: false,
  enable_peer_review: false,
  enable_shop: false,
  enable_slg: false,
  enable_task_tree: false,
  enable_tree_hole: false,
  enable_world_boss: false,
};

const ALL_ON: ClassFeatures = Object.fromEntries(
  Object.keys(ALL_OFF).map((key) => [key, true]),
) as ClassFeatures;

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/student/shop']}>
      <FeatureRouteGuard role="student" requirement={{ key: 'enable_shop' }} title="积分商城">
        <div>shop page</div>
      </FeatureRouteGuard>
    </MemoryRouter>,
  );
}

describe('FeatureRouteGuard', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    mocks.useStore.mockImplementation((selector: any) =>
      selector({ user: { id: 1, role: 'student', classId: 3, classFeatures: ALL_ON } }),
    );
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: ALL_ON,
      source: 'class',
      canDecide: true,
      isError: false,
      refetch,
    });
  });

  it('renders the page when the feature is on', () => {
    renderGuard();

    expect(screen.getByText('shop page')).toBeInTheDocument();
    expect(screen.queryByText(/积分商城当前未开放/)).not.toBeInTheDocument();
  });

  it('renders the disabled state when the teacher really switched it off', () => {
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: ALL_OFF,
      source: 'class',
      canDecide: true,
      isError: false,
      refetch,
    });

    renderGuard();

    expect(screen.queryByText('shop page')).not.toBeInTheDocument();
    expect(screen.getByText(/积分商城当前未开放/)).toBeInTheDocument();
  });

  it('renders a loading state - never the disabled state - while the flags are unknown', () => {
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: ALL_OFF,
      source: 'unknown',
      canDecide: false,
      isError: false,
      refetch,
    });

    renderGuard();

    expect(screen.queryByText('shop page')).not.toBeInTheDocument();
    // The regression: all-off flags plus "not ready" used to render the feature-closed page.
    expect(screen.queryByText(/积分商城当前未开放/)).not.toBeInTheDocument();
    expect(screen.getByText('正在读取班级功能配置...')).toBeInTheDocument();
  });

  it('offers a retry when the request failed and there is no snapshot to fall back on', () => {
    mocks.useStore.mockImplementation((selector: any) =>
      selector({ user: { id: 1, role: 'student', classId: 3 } }),
    );
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: ALL_OFF,
      source: 'unknown',
      canDecide: false,
      isError: true,
      refetch,
    });

    renderGuard();

    expect(screen.getByText('无法读取班级功能配置')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument();
    // A failed request must not be reported as "the teacher turned this off".
    expect(screen.queryByText(/积分商城当前未开放/)).not.toBeInTheDocument();
  });

  it('still renders the page when the request failed but a login snapshot resolved it', () => {
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: ALL_ON,
      source: 'login-snapshot',
      canDecide: true,
      isError: true,
      refetch,
    });

    renderGuard();

    // The snapshot is a real answer, just an older one - an error on the refresh must not hide a
    // feature the server told us at login is enabled.
    expect(screen.getByText('shop page')).toBeInTheDocument();
  });
});
