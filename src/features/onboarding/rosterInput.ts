/**
 * Parse the roster a teacher pastes into the first-run wizard.
 *
 * Why a textarea rather than a dynamic list of name inputs: a teacher already has the class list
 * somewhere - a spreadsheet, a seating plan, an existing school system - and typing 40 names into
 * 40 inputs is worse than pasting 40 lines. This module is the part that has to be right, so it is
 * pure and unit-tested rather than tangled into the component.
 *
 * Accepted, per line:
 *
 *     张三                  name only, username generated
 *     张三 2023001          name + username
 *     张三,2023001          comma, ideographic comma, tab, or any run of whitespace
 *     1. 张三               a list marker is stripped
 *     (blank lines, and lines starting with #, are ignored)
 *
 * Usernames must be unique per line *and* across the batch, because the server creates a login
 * account per student and refuses a duplicate. Collisions are resolved by suffixing rather than by
 * failing, and every adjustment is reported so the teacher can see what will be created.
 */

export interface RosterEntry {
  name: string;
  username: string;
}

export interface ParsedRoster {
  entries: RosterEntry[];
  /** Lines that were skipped, with the reason, so the UI can explain what it ignored. */
  problems: string[];
}

/** Strip a leading list marker: `1.`, `1、`, `1)`, `-`, `•`, `*`. */
function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:\d+\s*[.、)]|[-•*])\s*/, '');
}

/** Split a line into at most two fields on a comma (ASCII or ideographic), tab, or whitespace run. */
function splitFields(line: string): string[] {
  const parts = line
    .split(/[,，\t]+|\s{1,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts;
}

/**
 * A stable, obviously-generated username for a student who was given only a name.
 *
 * Deliberately opaque and clearly temporary (`tc` + a per-batch counter): inventing a username
 * from the name would need a pinyin table the project does not have and would silently produce the
 * same string for different students. The teacher can rename accounts later; `123456` is the
 * documented initial password, and the wizard says so.
 */
function generatedUsername(index: number): string {
  return `tc${String(index + 1).padStart(3, '0')}`;
}

export function parseRoster(input: string): ParsedRoster {
  const entries: RosterEntry[] = [];
  const problems: string[] = [];
  const used = new Set<string>();

  for (const raw of input.split(/\r?\n/)) {
    const line = stripListMarker(raw).trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const fields = splitFields(line);
    const name = fields[0];
    if (!name) continue;

    if (fields.length > 2) {
      problems.push(`「${raw.trim()}」列多于两列，已按前两列读取`);
    }

    let username = fields[1] ?? generatedUsername(entries.length);
    // A duplicate is a hard failure on the server (`用户名重复`), so resolve it here where the
    // teacher can still see what happened.
    if (used.has(username)) {
      let suffix = 2;
      while (used.has(`${username}${suffix}`)) suffix += 1;
      problems.push(`用户名 ${username} 重复，已改为 ${username}${suffix}`);
      username = `${username}${suffix}`;
    }

    used.add(username);
    entries.push({ name, username });
  }

  return { entries, problems };
}
