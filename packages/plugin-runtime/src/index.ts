/**
 * @thinkclass/plugin-runtime - discovery, resolution, lifecycle and isolation.
 *
 * The kernel owns the *slot* for a plugin host (`PluginHostView`); this package is
 * the implementation that fills it. Keeping them separate means the kernel has no
 * dependency on the runtime, and the runtime can be replaced without touching the
 * core.
 */

export { createPluginHost } from './host.js';
export type {
  ActivePlugin,
  PluginHost,
  PluginHostOptions,
  PluginRejection,
} from './host.js';

export { discoverPlugins } from './discovery.js';
export type { DiscoveredPlugin, DiscoveryResult, RejectedPlugin } from './discovery.js';

export { activationOrder, missingRequiredPlugins, resolvePlugins } from './resolver.js';
export type { RejectReason, ResolutionResult, ResolveOptions } from './resolver.js';

export { createPluginBoundary } from './boundary.js';
export type {
  BoundaryOptions,
  PluginBoundary,
  PluginHealthSnapshot,
  RunOutcome,
} from './boundary.js';

export { createServiceRegistry, ServiceNotAvailableError } from './serviceRegistry.js';
export type { ServiceRegistration, ServiceRegistry } from './serviceRegistry.js';

export { createDbApi, isWriteStatement, referencedTables, TableOwnershipError } from './dbApi.js';
export type { DbApiOptions } from './dbApi.js';

export {
  PLUGINS_MIGRATION_ID,
  createPluginStateStore,
  hashManifest,
  pluginsMigration,
} from './stateStore.js';
export type { PluginStateRow, PluginStateStore, RecordPluginInput } from './stateStore.js';

export { describeViolations, runPluginMigrations } from './migrationRunner.js';
export type { PluginMigrationOutcome, PluginMigrationViolation } from './migrationRunner.js';

export { createPluginContext, pluginTablePrefix, stopCallbacksOf } from './contextFactory.js';
export type { ContextFactoryDeps, MountedRouter } from './contextFactory.js';
