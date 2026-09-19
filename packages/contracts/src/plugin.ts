/**
 * Plugin manifest - the declarative description of what a plugin contributes.
 *
 * The manifest is the contract between a plugin and the runtime. Nothing a plugin
 * does at runtime may exceed what its manifest declares; the runtime enforces this
 * so that the dependency graph, the permission catalogue and the frontend route
 * table can all be computed *without executing plugin code*.
 */

import type { PermissionDeclaration, Role, ScopeType } from './identity.js';

export type PluginTier = 'foundation' | 'feature';

export type PluginIsolation = 'in-process' | 'restricted' | 'worker';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type PluginState =
  | 'discovered'
  | 'invalid'
  | 'installed'
  | 'blocked'
  | 'enabled'
  | 'active'
  | 'degraded'
  | 'disabled'
  | 'failed'
  | 'removed';

export type LayoutId = string;

export type SlotId = string;

export interface ServiceDeclaration {
  /** Namespaced service name, e.g. `classroom.public`. */
  name: string;
  version: string;
}

export interface RouteDeclaration {
  method: HttpMethod;
  /** Full mount path, e.g. `/api/p/pet`. */
  base: string;
  /** Legacy paths served by the same handler during migration. */
  compat?: string[];
  handler: string;
  auth: 'public' | 'actor';
  permissions?: string[];
}

export interface JobDeclaration {
  name: string;
  /** Cron-ish schedule string; interpretation is the kernel's concern. */
  schedule: string;
  timeoutMs?: number;
}

export interface SettingDeclaration {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  default: unknown;
  scope: ScopeType;
  label: string;
}

export interface MigrationDeclaration {
  id: string;
  /** Path to the .sql file, relative to the plugin directory. */
  up: string;
  down?: string;
}

export interface FrontendRouteDeclaration {
  path: string;
  /** Component id resolved through the frontend component registry. */
  component: string;
  layout: LayoutId;
  roles: Role[];
  permissions?: string[];
  order: number;
}

export interface FrontendMenuDeclaration {
  id: string;
  layout: LayoutId;
  path: string;
  label: string;
  icon: string;
  order: number;
  roles: Role[];
  permissions?: string[];
}

export interface FrontendSlotDeclaration {
  slot: SlotId;
  component: string;
  order: number;
  roles?: Role[];
}

export interface PluginFrontendDeclaration {
  routes?: FrontendRouteDeclaration[];
  menus?: FrontendMenuDeclaration[];
  slots?: FrontendSlotDeclaration[];
  assets?: string;
}

export interface PluginProvides {
  services?: ServiceDeclaration[];
  permissions?: PermissionDeclaration[];
  routes?: RouteDeclaration[];
  events?: { emits?: string[]; subscribes?: string[] };
  jobs?: JobDeclaration[];
  settings?: SettingDeclaration[];
  migrations?: MigrationDeclaration[];
  frontend?: PluginFrontendDeclaration;
}

export interface PluginDataDeclaration {
  /**
   * Tables this plugin owns. Every entry must be prefixed `p_<slug>_`; the
   * migration runner refuses DDL against anything else.
   */
  tables?: string[];
  /**
   * Tables this plugin owns but which still carry their **legacy** name from the
   * pre-plugin schema (`students`, `classes`, ...).
   *
   * This is a transitional declaration, not a design: it exists so that a
   * foundation plugin can own a table before the namespace migration has renamed
   * it, without either lying about ownership or breaking the `p_<slug>_` rule.
   * Guardrail G10 ratchets the total to zero; when it reaches zero this field and
   * the migration it describes are both gone.
   */
  adopted?: string[];
  /** Tables owned elsewhere that this plugin reads. Declarative, auditable. */
  reads?: string[];
  /** Host capabilities the plugin needs. Anything undeclared is unavailable. */
  capabilities?: Array<'fs' | 'net' | 'child_process'>;
}

export interface PluginManifest {
  /** Stable unique id, e.g. `pet` or `acme.quiz`. */
  id: string;
  /** Table-namespace slug derived from id: `pet`, `acme_quiz`. */
  slug: string;
  name: string;
  version: string;
  /** Semver range of the kernel API this plugin supports, e.g. `^1`. */
  kernel: string;
  tier: PluginTier;
  /** Foundation plugins must set this; the kernel refuses to boot without them. */
  required: boolean;
  description?: string;
  author?: string;
  license?: string;
  isolation?: PluginIsolation;
  entry: { backend?: string; frontend?: string };
  dependsOn?: Record<string, string>;
  optionalPeers?: Record<string, string>;
  conflictsWith?: string[];
  provides: PluginProvides;
  data: PluginDataDeclaration;
}

/** Manifest projected for the frontend: only what the browser needs. */
export interface PublicPluginDescriptor {
  id: string;
  name: string;
  version: string;
  frontend: PluginFrontendDeclaration;
  permissions: string[];
}
