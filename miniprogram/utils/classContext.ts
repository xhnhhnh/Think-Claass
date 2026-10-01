/**
 * The class a session is working on.
 *
 * ## Why this exists
 *
 * A student's and a parent's login payload carries `classId` (the kernel resolves it from their
 * `students` row). A **teacher's does not**: one teacher owns several classes, so there is no single
 * value the server could pick. Every teacher-side screen that needs a class therefore had nothing to
 * work with, and the two that hard-coded a fallback only hid it:
 *
 *   - `pages/teacher/homework` refused to publish with 「当前账号还没有班级，无法发布作业」;
 *   - `utils/feature.ts` skipped the live `GET /api/classes/:id/features` call, so `enable_ai_study`
 *     stayed unresolved and the 智学看板 tab was filtered out of the bar forever.
 *
 * The class is a *choice* for a teacher, not a fact, so it is remembered (`SELECTED_CLASS_KEY`) and
 * re-derivable from `GET /api/classes` when the stored one is gone (a class deleted, another device).
 *
 * ## Resolution order
 *
 *   1. the session's own `classId` (student/parent) - never overridable;
 *   2. the remembered choice, while it is still one of the teacher's classes;
 *   3. the first class the teacher owns, remembered immediately.
 *
 * `null` means the account genuinely has no class yet (a teacher who has not created one), which the
 * pages report as an actionable state rather than a failure.
 */

import { listClasses } from '../services/teacher'
import { classIdOf, readSelectedClassId, readSession, writeSelectedClassId } from './storage'

let resolved: number | null = null
let resolvedFor: number | null = null

/** The class id already established this launch, without touching the network. */
export function currentClassId(): number | null {
  return resolved
}

/** Remember a teacher's choice (or clear it) and drop the memoised answer. */
export function selectClassId(classId: number | null): void {
  writeSelectedClassId(classId)
  resolved = classId
  resolvedFor = classId
}

/**
 * The class this session works on, resolving it if necessary.
 *
 * `force` re-asks the server, which is what 下拉刷新 and a class switch need; without it a value
 * established this launch is answered from memory so a tab switch costs no request.
 */
export async function ensureClassId(options: { force?: boolean } = {}): Promise<number | null> {
  const session = readSession()
  if (!session) {
    resolved = null
    resolvedFor = null
    return null
  }

  // A student or a parent belongs to exactly one class, and the server already said which.
  const own = classIdOf(session.user)
  if (own !== null) {
    resolved = own
    resolvedFor = own
    return own
  }

  if (!options.force && resolvedFor !== null) {
    return resolved
  }

  const remembered = readSelectedClassId()
  if (remembered !== null) {
    resolved = remembered
    resolvedFor = remembered
    // Verified on a forced pass only: the common path must not spend a request proving a class the
    // teacher picked a moment ago still exists.
    if (!options.force) {
      return remembered
    }
  }

  let classes: Array<{ id: number }> = []
  try {
    classes = await listClasses()
  } catch (error) {
    console.warn('[classContext] could not list classes', error)
    // The remembered class survives an offline launch; only "no answer at all" is null.
    resolved = remembered
    resolvedFor = remembered
    return remembered
  }

  if (classes.length === 0) {
    writeSelectedClassId(null)
    resolved = null
    resolvedFor = null
    return null
  }

  const stillThere = remembered !== null && classes.some((cls) => cls.id === remembered)
  const chosen = stillThere ? (remembered as number) : classes[0].id
  selectClassId(chosen)
  return chosen
}

/** Forget the memoised answer; the next `ensureClassId` re-resolves. Used on a session change. */
export function resetClassContext(): void {
  resolved = null
  resolvedFor = null
}
