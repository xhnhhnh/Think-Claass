import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMessages: vi.fn(),
}));

vi.mock('@/features/engagement/api/danmakuApi', () => ({
  danmakuApi: {
    getMessages: mocks.getMessages,
  },
}));

import DanmakuOverlay from './DanmakuOverlay';

describe('DanmakuOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.getMessages.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls and renders danmaku messages', async () => {
    mocks.getMessages.mockResolvedValue({
      success: true,
      messages: [
        {
          id: 11,
          class_id: 3,
          sender_name: '小明',
          content: '加油',
          color: '#ffffff',
          created_at: '2026-05-05T00:00:00Z',
        },
      ],
    });

    render(<DanmakuOverlay classId={3} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.getMessages).toHaveBeenCalledWith(3, undefined);
    expect(screen.getByText('加油')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mocks.getMessages).toHaveBeenCalledWith(3, 11);
  });
});
