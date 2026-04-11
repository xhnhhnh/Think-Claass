import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StudentLayout from './StudentLayout';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/components/AnnouncementBanner', () => ({
  default: () => <div>announcement</div>,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

describe('StudentLayout', () => {
  beforeEach(() => {
    const state = {
      user: {
        id: 1,
        role: 'student',
        name: '小明',
        classFeatures: {
          enable_chat_bubble: true,
          enable_peer_review: true,
          enable_tree_hole: true,
          enable_shop: false,
          enable_lucky_draw: true,
          enable_challenge: true,
          enable_family_tasks: true,
          enable_world_boss: true,
          enable_guild_pk: true,
          enable_auction_blind_box: true,
          enable_achievements: true,
          enable_parent_buff: true,
          enable_task_tree: true,
          enable_danmaku: true,
          enable_class_brawl: true,
          enable_slg: true,
          enable_gacha: true,
          enable_economy: true,
          enable_dungeon: true,
        },
      },
      logout: vi.fn(),
    };

    mocks.useStore.mockImplementation((selector: any) => selector(state));
  });

  it('filters disabled feature navigation items', () => {
    render(
      <MemoryRouter initialEntries={['/student/pet']}>
        <Routes>
          <Route path="/student" element={<StudentLayout />}>
            <Route path="pet" element={<div>pet page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('我的精灵')).toBeInTheDocument();
    expect(screen.queryByText('积分商城')).not.toBeInTheDocument();
  });

  it('redirects to the first enabled student route when current route is disabled', async () => {
    render(
      <MemoryRouter initialEntries={['/student/shop']}>
        <Routes>
          <Route path="/student" element={<StudentLayout />}>
            <Route path="pet" element={<div>pet page</div>} />
            <Route path="shop" element={<div>shop page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('pet page')).toBeInTheDocument();
    });
    expect(screen.queryByText('shop page')).not.toBeInTheDocument();
  });
});
