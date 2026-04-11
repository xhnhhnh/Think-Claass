import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ParentLayout from './ParentLayout';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

describe('ParentLayout', () => {
  beforeEach(() => {
    const state = {
      user: {
        id: 2,
        role: 'parent',
        classFeatures: {
          enable_chat_bubble: true,
          enable_peer_review: true,
          enable_tree_hole: true,
          enable_shop: true,
          enable_lucky_draw: true,
          enable_challenge: true,
          enable_family_tasks: false,
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

  it('hides disabled family task navigation', () => {
    render(
      <MemoryRouter initialEntries={['/parent/dashboard']}>
        <Routes>
          <Route path="/parent" element={<ParentLayout />}>
            <Route path="dashboard" element={<div>dashboard page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('温馨家园').length).toBeGreaterThan(0);
    expect(screen.queryByText('家庭时光')).not.toBeInTheDocument();
  });

  it('redirects away from disabled family tasks route', async () => {
    render(
      <MemoryRouter initialEntries={['/parent/tasks']}>
        <Routes>
          <Route path="/parent" element={<ParentLayout />}>
            <Route path="dashboard" element={<div>dashboard page</div>} />
            <Route path="tasks" element={<div>tasks page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('dashboard page')).toBeInTheDocument();
    });
    expect(screen.queryByText('tasks page')).not.toBeInTheDocument();
  });
});
