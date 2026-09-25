import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RestartGuideButton } from './RestartGuideButton';
import { clearReplayRequest, getReplayRequested } from './startupGuideStore';

/**
 * The replay control.
 *
 * It is one component because it appears in two places - the settings card and the shell's profile
 * block - and a reader looks for the same words in both. These assertions pin the label and the
 * effect, so a future edit cannot quietly leave one of the two surfaces saying something else.
 */

afterEach(() => {
  clearReplayRequest();
});

describe('RestartGuideButton', () => {
  it('asks the tour to run again when pressed', () => {
    render(<RestartGuideButton />);

    expect(getReplayRequested()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /重新开始引导/ }));

    expect(getReplayRequested()).toBe(true);
  });

  it('takes the kit variant it is given, so the shell and the card can look different', () => {
    render(<RestartGuideButton variant="ghost" className="w-full" />);

    const button = screen.getByRole('button', { name: /重新开始引导/ });
    expect(button).toHaveClass('w-full');
    // A class the ghost variant owns, proving `variant` reached the kit rather than being
    // dropped. Written against the UI-R token names: the assertion is about the prop
    // arriving, so it follows the kit's vocabulary rather than pinning it.
    expect(button.className).toContain('hover:bg-surface-3');
  });

  it('is a real button, not a clickable box', () => {
    render(<RestartGuideButton />);

    expect(screen.getByRole('button', { name: /重新开始引导/ })).toHaveAttribute('type', 'button');
  });
});
