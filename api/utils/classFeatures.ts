/**
 * Class feature flags - compatibility layer.
 *
 * Historically this module held a hardcoded array of 19 `enable_*` keys, duplicated
 * verbatim in `src/lib/classFeatures.ts`, and read them straight off 19 boolean
 * columns on the `classes` table. Adding one flag meant an `ALTER TABLE` on a core
 * table plus edits in five places.
 *
 * It is now generic. The flag names are **derived from the class row itself**, so
 * this file contains no key list at all, and values are resolved:
 *
 *   1. from a capability assignment (`capability_assignments`), the new source of
 *      truth, written when a teacher toggles a flag;
 *   2. falling back to the legacy column, which is what an untouched class has.
 *
 * Writes update both, so a direct column reader never sees a stale value while the
 * migration is in progress. When nothing has been toggled the behaviour is
 * byte-for-byte what it was.
 */

import type { ScopeType } from '@thinkclass/contracts';
import { getActiveKernel } from '@thinkclass/kernel';

import db from '../db.js';
import { ApiError } from './apiError.js';

/** Prefix that identifies a legacy class-scope flag column. */
const LEGACY_PREFIX = 'enable_';

/**
 * Plugin that owns class-scope capabilities. The classroom plugin declares each of
 * these as a permission, which is what puts them in the catalogue the admin surface
 * reads; this layer resolves the *values*.
 */
const CAPABILITY_OWNER = 'classroom';

/** A legacy flag name such as `enable_shop`. */
export type ClassFeatureKey = string;

export type ClassFeatures = Record<string, boolean>;

interface ClassRow {
  id: number;
  [column: string]: unknown;
}

/** Capability key backing a legacy flag, e.g. `enable_shop` -> `classroom.enable_shop`. */
export function capabilityKeyFor(legacyKey: string): string {
  return `${CAPABILITY_OWNER}.${legacyKey}`;
}

function loadClassRow(classId: number): ClassRow | null {
  const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId) as ClassRow | undefined;
  return row ?? null;
}

/**
 * Flag names present on a class row.
 *
 * Derived rather than declared: the schema is the list. This is what removes the
 * hardcoded array - and it means a column added by a future migration is picked up
 * without touching this file.
 */
export function legacyKeysOf(row: Record<string, unknown>): ClassFeatureKey[] {
  return Object.keys(row)
    .filter((column) => column.startsWith(LEGACY_PREFIX))
    .sort();
}

/** Explicit assignment for this class scope, or undefined when never set. */
function assignmentFor(classId: number, legacyKey: string): boolean | undefined {
  const store = getActiveKernel()?.permissions.store;
  if (!store) return undefined;
  return store.get('class' as ScopeType, classId, capabilityKeyFor(legacyKey));
}

/** Values from the class row alone, ignoring any assignment overlay. */
export function pickClassFeatures(source: Record<string, unknown> | null | undefined): ClassFeatures {
  const features: ClassFeatures = {};
  if (!source) return features;
  for (const key of legacyKeysOf(source)) features[key] = Boolean(source[key]);
  return features;
}

/** Resolve every flag for a class: assignment first, then the legacy column. */
export function getClassFeaturesByClassId(classId: number): ClassFeatures {
  const row = loadClassRow(classId);
  if (!row) throw new ApiError(404, '班级未找到');

  const features: ClassFeatures = {};
  for (const key of legacyKeysOf(row)) {
    const assigned = assignmentFor(classId, key);
    features[key] = assigned === undefined ? Boolean(row[key]) : assigned;
  }
  return features;
}

/**
 * Write flags for a class.
 *
 * Dual write: the capability assignment becomes the source of truth, and the legacy
 * column is kept in step so any remaining direct reader stays correct. Keys are
 * validated against the class row, so a typo is ignored rather than silently
 * creating a capability nothing reads.
 */
export function setClassFeatures(classId: number, values: Record<string, unknown>): ClassFeatures {
  const row = loadClassRow(classId);
  if (!row) throw new ApiError(404, '班级未找到');

  const known = new Set(legacyKeysOf(row));
  const kernel = getActiveKernel();

  for (const [key, raw] of Object.entries(values)) {
    if (!known.has(key)) continue;
    const enabled = Boolean(raw);

    kernel?.permissions.store.set({
      scopeType: 'class',
      scopeId: classId,
      capabilityKey: capabilityKeyFor(key),
      enabled,
    });

    // The column name comes from the row's own column list, so it cannot be
    // attacker controlled.
    db.prepare(`UPDATE classes SET \`${key}\` = ? WHERE id = ?`).run(enabled ? 1 : 0, classId);
  }

  return getClassFeaturesByClassId(classId);
}

export function assertClassFeatureEnabled(classId: number, feature: ClassFeatureKey): ClassFeatures {
  const features = getClassFeaturesByClassId(classId);
  if (!features[feature]) {
    throw new ApiError(403, '该功能当前已关闭');
  }
  return features;
}

export function getClassIdByStudentId(studentId: number): number {
  const row = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId) as
    | { class_id: number }
    | undefined;
  if (!row) {
    throw new ApiError(404, '学生未找到');
  }
  return row.class_id;
}

export function getClassIdByUserId(userId: number, role: 'student' | 'parent' = 'student'): number {
  const row =
    role === 'parent'
      ? (db
          .prepare(
            `
            SELECT s.class_id
            FROM parent_students ps
            JOIN students s ON s.id = ps.student_id
            WHERE ps.parent_id = ?
            LIMIT 1
          `,
          )
          .get(userId) as { class_id: number } | undefined)
      : (db.prepare('SELECT class_id FROM students WHERE user_id = ?').get(userId) as
          | { class_id: number }
          | undefined);

  if (!row) {
    throw new ApiError(404, '班级未找到');
  }

  return row.class_id;
}

export function assertAnyClassFeatureEnabled(classId: number, featuresToCheck: ClassFeatureKey[]): ClassFeatures {
  const features = getClassFeaturesByClassId(classId);
  if (!featuresToCheck.some((feature) => features[feature])) {
    throw new ApiError(403, '该功能当前已关闭');
  }
  return features;
}

export function assertStudentFeatureEnabled(studentId: number, feature: ClassFeatureKey): ClassFeatures {
  const classId = getClassIdByStudentId(studentId);
  return assertClassFeatureEnabled(classId, feature);
}

export function assertAnyStudentFeatureEnabled(studentId: number, featuresToCheck: ClassFeatureKey[]): ClassFeatures {
  const classId = getClassIdByStudentId(studentId);
  return assertAnyClassFeatureEnabled(classId, featuresToCheck);
}

export function assertActorFeatureEnabled(
  userId: number,
  role: 'student' | 'parent',
  feature: ClassFeatureKey,
): ClassFeatures {
  const classId = getClassIdByUserId(userId, role);
  return assertClassFeatureEnabled(classId, feature);
}
