import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from './dialog';

/**
 * The dialog must not use a transform for centring.
 *
 * Base UI writes an inline `transform: translateX(...)` onto the popup. A
 * Radix-style `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` combo therefore
 * ends up overridden and the modal is pinned near the top-left of the content area.
 * The wrapper below is the durable shape: a fixed grid positioner owns centring, and
 * the popup explicitly opts out of the primitive's transform.
 */
describe('Dialog layout contract', () => {
  it('centres through the positioner and opts out of the primitive transform', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogTitle>确认</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    const popup = screen.getByRole('dialog');
    const positioner = popup.closest('[data-slot="dialog-positioner"]');

    expect(positioner).not.toBeNull();
    expect(positioner?.className).toContain('grid');
    expect(positioner?.className).toContain('place-items-center');
    expect(popup.className).toContain('!transform-none');
    expect(popup.parentElement).toBe(positioner);
  });
});
