/**
 * Parent-buff service.
 *
 * Behavior is relocated from the `createParentBuff` method of
 * `api/modules/platform/platform.service.ts` unchanged: the same two guards, in the same
 * order, with the same messages, and the same "one blessing per student per calendar day"
 * rule.
 *
 * `ApiError` now comes from the kernel rather than `api/utils/apiError.js`, because a plugin
 * may not import `api/**` - and `instanceof` does not hold across those two classes anyway.
 */

import { ApiError } from '@thinkclass/kernel';
import type { SqlParam } from '@thinkclass/plugin-sdk';

import type { ParentBuffRepository } from './parentBuff.repository.js';

export class ParentBuffService {
  constructor(private readonly repository: ParentBuffRepository) {}

  createParentBuff(input: { studentId?: unknown }) {
    const { studentId } = input ?? {};
    if (!studentId) {
      throw new ApiError(400, 'Student ID required');
    }

    const today = new Date().toISOString().split('T')[0];
    if (this.repository.findToday(studentId as SqlParam, today)) {
      throw new ApiError(400, '今日已经施放过祝福了');
    }

    this.repository.insert(studentId as SqlParam);
  }

  /**
   * Record that a parent was active with one of their students today.
   *
   * Published as `parent-buff.public` so the identity domain stops writing `parent_activity`
   * itself. The rule is the pre-migration one from `auth.service.login`: upsert on
   * `(parent_id, student_id)`, set `last_active_date`. No validation and no error path - the
   * legacy call site wrapped it in `if (student)` and ignored nothing else, so this method is a
   * straight write. `day` comes from the caller so the port does not invent a second clock.
   */
  touchParentLogin(parentId: number, studentId: number, day: string): void {
    this.repository.upsertParentLogin(parentId, studentId, day);
  }
}
