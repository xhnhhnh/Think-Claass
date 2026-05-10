import { describe, expect, it, vi } from 'vitest';

const confettiMock = vi.hoisted(() => vi.fn());

vi.mock('canvas-confetti', () => ({
  default: confettiMock,
}));

import { launchConfetti } from './confetti';

describe('launchConfetti', () => {
  it('loads canvas-confetti lazily and forwards options', async () => {
    await launchConfetti({ particleCount: 12, spread: 40 });

    expect(confettiMock).toHaveBeenCalledWith({ particleCount: 12, spread: 40 });
  });
});
