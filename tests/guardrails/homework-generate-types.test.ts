/**
 * G21 - the console's 出题 type list must match the templates the server has.
 *
 * `src/features/homework/components/AiQuestionPanel.tsx` cannot import
 * `plugins/homework/src/homework.templates.ts`: that module is backend code, and the frontend reaching
 * into a plugin's source is the coupling the plugin boundary exists to prevent (G1's rule, applied in
 * the direction G1 does not cover). So the three type names exist twice - once as the templates the
 * prompt is built from, once as the options a teacher can pick.
 *
 * This is the same shape as G9 (`system-settings-parity.test.ts`), and it exists for the same reason:
 * the two copies are only safe while something compares them. The failure it prevents is specific and
 * quiet - a type added to the server (or renamed in a template) that the console does not offer, or an
 * option the console offers that the route answers 400 for. Neither is visible in the type system,
 * because the two namespaces never meet at compile time.
 *
 * It reads the component's source rather than importing it, deliberately: importing a `.tsx` module
 * into a guardrail test would need the app's test environment (React, jsdom, path aliases) and would
 * make this suite depend on the UI toolchain. The list is a plain exported literal for exactly this
 * reason - see the constant's own note.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { GENERATABLE_TYPES, QUESTION_TEMPLATES } from '../../plugins/homework/src/homework.templates.js';
import { ROOT } from './lib/paths.mjs';

const PANEL = path.join(
  ROOT,
  'src',
  'features',
  'homework',
  'components',
  'AiQuestionPanel.tsx',
);

/**
 * The `value:` entries of the exported constant, in order.
 *
 * Regex rather than a parser: the literal is `{ value: 'single', label: ... }` lines and nothing else,
 * and the shape is asserted below so a rewrite that changes it fails loudly instead of silently
 * matching nothing.
 */
function panelTypes(): string[] {
  const source = fs.readFileSync(PANEL, 'utf8');
  const declaration = /export const GENERATABLE_QUESTION_TYPES[^=]*=\s*\[([\s\S]*?)\n\];/.exec(source);
  expect(declaration, 'AiQuestionPanel.tsx no longer declares GENERATABLE_QUESTION_TYPES').toBeTruthy();

  return [...declaration![1].matchAll(/value:\s*'([^']+)'/g)].map((match) => match[1]);
}

describe('G21 the 出题 type list matches the server templates', () => {
  it('offers exactly the generatable types, in the same order', () => {
    const serverTypes = [...GENERATABLE_TYPES];
    const consoleTypes = panelTypes();

    expect(consoleTypes, 'the console and the templates disagree about what can be generated').toEqual(serverTypes);
    // Non-vacuity: a parse that found nothing would make the comparison above trivially true.
    expect(consoleTypes.length).toBeGreaterThan(0);
  });

  it('offers every type that has a template, and no type that does not', () => {
    for (const type of Object.keys(QUESTION_TEMPLATES) as Array<keyof typeof QUESTION_TEMPLATES>) {
      expect(GENERATABLE_TYPES).toContain(type);
    }
    // 简答 has no template and must not be offered - the assertion that documents the decision.
    expect(GENERATABLE_TYPES).not.toContain('short');
    expect(panelTypes()).not.toContain('short');
  });
});
