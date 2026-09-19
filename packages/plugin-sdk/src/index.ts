/**
 * @thinkclass/plugin-sdk - the public SDK for writing ThinkClass plugins.
 *
 * A plugin declares what it contributes in `plugin.json` (validated without
 * executing any plugin code) and implements it in a backend module built with
 * `definePlugin`. Everything the plugin can do goes through `KernelContext`.
 */

export { definePlugin, isPluginDefinition } from './definePlugin.js';
export type { PluginBackendModule, PluginDefinition } from './definePlugin.js';

export { PLUGIN_CONTEXT, PLUGIN_MANIFEST } from './context.js';
export type {
  AuditApi,
  CapabilityApi,
  CleanupApi,
  CleanupRule,
  CleanupSubject,
  ConfigApi,
  DatabaseMaintenanceApi,
  DbApi,
  DbRunResult,
  EventsApi,
  JobsApi,
  KernelContext,
  MigrationsApi,
  PermissionsApi,
  PluginIdentity,
  RoutesApi,
  SettingsApi,
  SqlParam,
} from './context.js';

export { slugOf, tablePrefixOf, validateManifest } from './manifest.js';
export type { ManifestIssue, ManifestValidationResult } from './manifest.js';

export { andAll, equals, grouped, inList, orAll } from './sql.js';
export type { SqlFragment } from './sql.js';

export {
  compareVersions,
  formatVersion,
  isValidRange,
  parseRangeVersion,
  parseVersion,
  satisfies,
} from './semver.js';
export type { RangeCheck, Version } from './semver.js';
