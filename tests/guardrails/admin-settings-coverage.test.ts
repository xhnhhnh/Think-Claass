/**
 * G23 - every system setting is either rendered by the console or declared as not-a-knob.
 *
 * `DEFAULT_SYSTEM_SETTINGS` (in `plugins/admin` and its frontend parity copy) is the list the
 * settings route persists and the payment/homework plugins read. A key with no control in
 * 系统设置 is a configuration nobody can reach: `ai_provider` spent a whole release frozen at its
 * `mock` default because the page rendered no field for it, and the same was true of all thirteen
 * payment-channel keys and of `payment_notify_url` - a setting that no code read either.
 *
 * The check is textual on purpose: the page is a form, and "is there a control bound to this key" is
 * a question about the source (`formData.<key>`), not about a rendered tree.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SYSTEM_SETTINGS } from '@/lib/systemSettings';

import { ROOT } from './lib/paths.mjs';

const PAGE = 'src/features/admin/pages/AdminSettingsPage.tsx';

/**
 * Keys that intentionally have no control on this page.
 *
 * Every entry needs a reason that survives review: "not implemented yet" is not one.
 */
const NOT_A_KNOB: Record<string, string> = {};

describe('G23: the console can reach every system setting', () => {
  const source = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
  const keys = Object.keys(DEFAULT_SYSTEM_SETTINGS);

  it('renders a control for every key', () => {
    const missing = keys.filter((key) => !NOT_A_KNOB[key] && !source.includes(key));
    expect(
      missing,
      `settings with no control in ${PAGE} (add one, or record why it is not a knob):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('does not render controls for keys that do not exist', () => {
    // The other direction: a field bound to a key the backend never persists silently does nothing.
    const referenced = [...source.matchAll(/formData\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]);
    const unknown = [...new Set(referenced)].filter((key) => !keys.includes(key));
    expect(unknown, `fields bound to keys the backend does not store:\n${unknown.join('\n')}`).toEqual([]);
  });
});
