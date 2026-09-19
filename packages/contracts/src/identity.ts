/**
 * Identity, roles and permission scopes.
 *
 * A permission is only meaningful together with a scope: `pet.adopt` may be
 * granted platform-wide, per school, per class, or per student. The current
 * codebase encodes the narrowest of these (per class) as 19 boolean columns on
 * the `classes` table, which is exactly what this vocabulary replaces.
 */

export type Role = 'superadmin' | 'admin' | 'teacher' | 'student' | 'parent';

/** The authenticated caller, resolved by the kernel from a verified session. */
export interface Actor {
  userId: number;
  role: Role;
  /** Present for students and parents. */
  studentId?: number;
  /** Present for students, teachers and parents (via their student). */
  classId?: number;
  schoolId?: number;
}

export type ScopeType = 'platform' | 'school' | 'class' | 'student';

export interface ScopeRef {
  type: ScopeType;
  /** Absent for `platform` scope. */
  id?: number;
}

/** A permission key declared by a plugin, e.g. `pet.adopt` or `shop.purchase`. */
export type PermissionKey = string;

export interface PermissionDeclaration {
  key: PermissionKey;
  scope: ScopeType;
  /**
   * Value used when no explicit assignment exists. The legacy class feature flags
   * default to enabled (1) in the schema, so `true` is the compatible default.
   */
  default: boolean;
  label: string;
  /** Plugin that owns this permission. Filled in by the runtime. */
  pluginId?: string;
}

/** A stored override of a permission's default for one scope instance. */
export interface CapabilityAssignment {
  scopeType: ScopeType;
  scopeId: number;
  capabilityKey: PermissionKey;
  enabled: boolean;
}
