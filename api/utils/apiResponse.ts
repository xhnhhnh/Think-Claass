/**
 * Response envelope helpers.
 *
 * `ok()` lived as a module-private helper inside `api/modules/game/game.controllers.ts`.
 * When that 741-line file was split into six per-domain controllers in P4.3, the
 * helper had to move with them rather than be copied six times - each controller
 * already defined its own copy of the same three lines, which is how the shape
 * drifted between modules in the first place.
 *
 * The optional `legacyPayload` parameter exists because several endpoints return
 * `{ success, data, ...otherTopLevelFields }` for clients that read the extra fields
 * directly; it is preserved verbatim from the original helper.
 */

export function ok<T>(data: T, legacyPayload: Record<string, unknown> = {}) {
  return { success: true, data, ...legacyPayload };
}
