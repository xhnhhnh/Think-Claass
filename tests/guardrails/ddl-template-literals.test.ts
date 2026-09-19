/**
 * Guard: DDL template literals must not contain a stray backtick.
 *
 * `api/schema/adoptedTables.ts` builds its DDL inside template literals, and a SQL
 * comment that mentions a column name in backticks silently ENDS the literal. The parse
 * error then points far from the cause - `Expected ")" but found "mood"` - and I hit
 * that four times while writing this file.
 *
 * `tsc` does catch it, so this is not a correctness backstop; it is a *diagnosis* one.
 * It converts "confusing parse error somewhere in a 400-line file" into a line number and
 * the offending comment, in a 2ms test rather than a full typecheck.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROOT } from './lib/paths.mjs';

/** Files whose DDL lives in template literals. */
const DDL_FILES = ['api/schema/adoptedTables.ts'];

describe('G12 DDL template literals are well formed', () => {
  it('no SQL comment inside a DDL template contains a backtick', () => {
    const problems: string[] = [];

    for (const rel of DDL_FILES) {
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) continue;

      const source = fs.readFileSync(file, 'utf8');
      if ((source.match(/`/g) ?? []).length % 2 !== 0) {
        problems.push(`${rel}: odd number of backticks; one template is unterminated`);
      }

      // Walk the file tracking whether we are inside a template literal. A SQL comment
      // line carrying an odd number of backticks while inside one is the classic slip.
      let insideTemplate = false;
      source.split(/\r?\n/).forEach((line, index) => {
        const count = (line.match(/`/g) ?? []).length;
        if (insideTemplate && /^\s*--/.test(line) && count % 2 === 1) {
          problems.push(`${rel}:${index + 1}: SQL comment contains a backtick, ending the template: ${line.trim()}`);
        }
        if (count % 2 === 1) insideTemplate = !insideTemplate;
      });
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });
});
