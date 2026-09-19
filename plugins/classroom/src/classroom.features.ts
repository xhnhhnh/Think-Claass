/**
 * Class-scope feature flags, inside the plugin.
 *
 * This is the plugin-local equivalent of `api/utils/classFeatures.ts`. The migration
 * removed the last reason that module reached for the kernel through `getActiveKernel()`
 * (a service locator): the plugin has `ctx.permissions.assignedTo`, so the resolution
 * order is explicit and testable.
 *
 * Resolution order, unchanged from the compatibility layer:
 *
 *   1. an explicit capability assignment (`capability_assignments`) for this class scope;
 *   2. failing that, the legacy `classes.enable_*` column.
 *
 * Both the port and the HTTP service call these helpers, so "how a feature flag is read"
 * has exactly one implementation in the domain.
 */

import { ApiError } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { ClassroomRepository } from './classroom.repository.js';
import type { ClassFeatures } from './classroom.types.js';

/** Prefix identifying a legacy class-scope feature column. */
const LEGACY_FEATURE_PREFIX = 'enable_';

/** Plugin that owns class-scope capabilities; must match the manifest id. */
const CAPABILITY_OWNER = 'classroom';

/** Capability key backing a legacy flag, e.g. `enable_shop` -> `classroom.enable_shop`. */
export function capabilityKeyFor(legacyKey: string): string {
  return `${CAPABILITY_OWNER}.${legacyKey}`;
}

/**
 * Flag names present on a class row.
 *
 * Derived rather than declared: the schema is the list, so a column added by a future
 * migration is picked up without touching this file.
 */
export function legacyKeysOf(row: Record<string, unknown>): string[] {
  return Object.keys(row)
    .filter((column) => column.startsWith(LEGACY_FEATURE_PREFIX))
    .sort();
}

/** Values from a class row alone, ignoring any assignment overlay. */
export function pickClassFeatures(source: Record<string, unknown> | null | undefined): ClassFeatures {
  const features: ClassFeatures = {};
  if (!source) return features;
  for (const key of legacyKeysOf(source)) features[key] = Boolean(source[key]);
  return features;
}

export function createClassFeatureResolver(ctx: KernelContext, repository: ClassroomRepository) {
  /**
   * Is a class-scope feature on?
   *
   * Never throws for a missing class: the port answers "no" and the caller decides what
   * that means. The HTTP assertions below throw, because they are answering a request.
   */
  function isFeatureEnabled(classId: number, feature: string): boolean {
    const assigned = ctx.permissions.assignedTo('class', classId, capabilityKeyFor(feature));
    if (assigned !== undefined) return assigned;

    const row = repository.findClassRow(classId);
    if (!row) return false;
    if (!feature.startsWith(LEGACY_FEATURE_PREFIX)) return false;
    return Boolean(row[feature]);
  }

  /** Every flag for a class: assignment first, then the legacy column. */
  function getClassFeaturesByClassId(classId: number): ClassFeatures {
    const row = repository.findClassRow(classId);
    if (!row) throw new ApiError(404, '班级未找到');

    const features: ClassFeatures = {};
    for (const key of legacyKeysOf(row)) {
      const assigned = ctx.permissions.assignedTo('class', classId, capabilityKeyFor(key));
      features[key] = assigned === undefined ? Boolean(row[key]) : assigned;
    }
    return features;
  }

  /**
   * Write flags for a class.
   *
   * Dual write, exactly as the pre-migration helper did: the capability assignment becomes
   * the source of truth and the legacy column is kept in step so a direct column reader
   * never sees a stale value. Keys are validated against the class row, so a typo is
   * ignored rather than silently creating a capability nothing reads.
   */
  function setClassFeatures(classId: number, values: Record<string, unknown>): ClassFeatures {
    const row = repository.findClassRow(classId);
    if (!row) throw new ApiError(404, '班级未找到');

    const known = new Set(legacyKeysOf(row));
    for (const [key, raw] of Object.entries(values)) {
      if (!known.has(key)) continue;
      const enabled = Boolean(raw);
      repository.setCapabilityAssignment('class', classId, capabilityKeyFor(key), enabled);
      repository.updateClassFeatureColumn(classId, key, enabled);
    }

    return getClassFeaturesByClassId(classId);
  }

  function assertClassFeatureEnabled(classId: number, feature: string): ClassFeatures {
    const features = getClassFeaturesByClassId(classId);
    if (!features[feature]) {
      throw new ApiError(403, '该功能当前已关闭');
    }
    return features;
  }

  /** The class a student belongs to, or the legacy 404 when the student row is gone. */
  function getClassIdByStudentId(studentId: number): number {
    const row = repository.findStudentRow(studentId);
    if (!row) {
      throw new ApiError(404, '学生未找到');
    }
    return row.class_id;
  }

  function assertStudentFeatureEnabled(studentId: number, feature: string): ClassFeatures {
    return assertClassFeatureEnabled(getClassIdByStudentId(studentId), feature);
  }

  return {
    capabilityKeyFor,
    legacyKeysOf,
    pickClassFeatures,
    isFeatureEnabled,
    getClassFeaturesByClassId,
    setClassFeatures,
    assertClassFeatureEnabled,
    assertStudentFeatureEnabled,
    getClassIdByStudentId,
  };
}

export type ClassFeatureResolver = ReturnType<typeof createClassFeatureResolver>;
