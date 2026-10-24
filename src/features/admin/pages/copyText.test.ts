import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyText } from './copyText';

/**
 * The copy helper the admin console's 复制 buttons share.
 *
 * These pin the three environments that actually occur: a secure origin (Clipboard API), an
 * insecure LAN origin (no `navigator.clipboard`), and a Clipboard API that exists but rejects
 * (permission denied). The old code called `navigator.clipboard.writeText` unguarded and toasted
 * success immediately, so two of the three looked identical to the operator: nothing copied.
 */
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

function setExecCommand(value: unknown) {
  Object.defineProperty(document, 'execCommand', { configurable: true, value });
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalClipboard) {
    Object.defineProperty(navigator, 'clipboard', originalClipboard);
  } else {
    // jsdom exposes no clipboard; deleting the test stub keeps the next test honest.
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  }
  delete (document as unknown as Record<string, unknown>).execCommand;
});

describe('copyText', () => {
  it('copies through the Clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    setExecCommand(vi.fn().mockReturnValue(false));

    await expect(copyText('TC-AAAA1111')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('TC-AAAA1111');
  });

  it('falls back to the textarea when the Clipboard API rejects', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    const execCommand = vi.fn().mockReturnValue(true);
    setExecCommand(execCommand);
    const before = document.body.childElementCount;

    await expect(copyText('sk-secret')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    // The hidden textarea the fallback creates is removed again, including on failure.
    expect(document.body.childElementCount).toBe(before);
  });

  it('falls back when the Clipboard API is absent (a plain-http LAN deployment)', async () => {
    setClipboard(undefined);
    setExecCommand(vi.fn().mockReturnValue(true));

    await expect(copyText('TC-BBBB2222')).resolves.toBe(true);
  });

  it('reports failure instead of throwing when no copy path works', async () => {
    setClipboard(undefined);
    setExecCommand(vi.fn().mockReturnValue(false));
    const before = document.body.childElementCount;

    await expect(copyText('nope')).resolves.toBe(false);
    expect(document.body.childElementCount).toBe(before);
  });

  it('reports failure when the legacy command throws', async () => {
    setClipboard(undefined);
    setExecCommand(
      vi.fn(() => {
        throw new Error('execCommand not implemented');
      }),
    );

    await expect(copyText('nope')).resolves.toBe(false);
  });
});
