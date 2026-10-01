/**
 * Text comparison for the generated-file checks.
 *
 * `route-modules.mjs --check` and `class-features.mjs --check` both compare a committed generated
 * file against what the generator would write, and both used a bare `!==`. On a checkout with
 * `core.autocrlf=true` - the default on Windows - git rewrites that file to CRLF on the way out
 * while the blob, and therefore the generator's output, stays LF. The comparison then reports "out
 * of date" for a file nobody edited, and the instruction it prints (regenerate) rewrites the file
 * back to LF, so the next checkout breaks it again.
 *
 * That is not hypothetical: it appeared after a branch merge re-checked out
 * `src/app/routing/pageModules.generated.ts`, and it would hit any Windows contributor who switches
 * branches. What the checks are actually about is "does the committed content still equal the
 * generated content", and line endings are not content the generator controls - git owns them.
 *
 * Normalising here rather than at each call site keeps the two checks from drifting apart, and the
 * behaviour on Linux/macOS (where nothing is rewritten) is unchanged.
 */

/** Text with every CRLF collapsed to LF, so a git-rewritten checkout compares equal. */
export function normaliseNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

/** Whether two texts are equal ignoring line-ending style. */
export function sameText(left, right) {
  return normaliseNewlines(left) === normaliseNewlines(right);
}
