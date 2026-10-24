import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useTerritoryMap: vi.fn(),
  useContributeTerritoryMutation: vi.fn(),
}));

vi.mock('@/features/slg/hooks/useTerritory', () => ({
  useTerritoryMap: mocks.useTerritoryMap,
  useContributeTerritoryMutation: mocks.useContributeTerritoryMutation,
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 5, role: 'student', studentId: 101, class_id: 1 } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import StudentTerritoryPage from './StudentTerritoryPage';

/**
 * 王国版图 - the map has to be pannable by touch.
 *
 * Only the mouse events were wired (and a lone `onTouchStart`), so on a phone the 3000x3000
 * canvas could not move and every territory outside the first viewport was unreachable. The
 * regression is a touch drag: start at (100,100), move to (160,130), the canvas translates by
 * (60,30).
 */
describe('StudentTerritoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useTerritoryMap.mockReturnValue({
      data: {
        territories: [
          {
            id: 1,
            class_id: 1,
            name: '静谧森林',
            type: 'forest',
            status: 'owned',
            level: 1,
            x_pos: 1,
            y_pos: 1,
            current_contribution: 0,
            cost_to_unlock: 100,
          },
        ],
        resources: { wood: 10, stone: 5, magic_dust: 1, gold: 2 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useContributeTerritoryMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('pans the map with a touch drag', () => {
    render(<StudentTerritoryPage />);

    const map = screen.getByTestId('territory-map');
    const content = screen.getByTestId('territory-map-content');

    fireEvent.touchStart(map, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(map, { touches: [{ clientX: 160, clientY: 130 }] });

    expect(content).toHaveAttribute('data-map-x', '60');
    expect(content).toHaveAttribute('data-map-y', '30');
  });

  it('keeps panning with a mouse drag', () => {
    render(<StudentTerritoryPage />);

    const map = screen.getByTestId('territory-map');
    const content = screen.getByTestId('territory-map-content');

    fireEvent.mouseDown(map, { clientX: 200, clientY: 100 });
    fireEvent.mouseMove(map, { clientX: 150, clientY: 80 });
    fireEvent.mouseUp(map);

    expect(content).toHaveAttribute('data-map-x', '-50');
    expect(content).toHaveAttribute('data-map-y', '-20');
  });
});
