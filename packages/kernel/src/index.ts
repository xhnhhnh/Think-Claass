/**
 * @thinkclass/kernel - the minimal core.
 *
 * Anything exported here is public API for plugins and the host application.
 * Internals live under `src/internal` and must not be imported by plugins;
 * guardrail G2 enforces that the kernel never reaches back into `plugins/**`.
 */

// --- bootstrap -------------------------------------------------------------
export { createKernel, getActiveKernel, kernelMigrations } from './bootstrap/createKernel.js';
export type { CreateKernelOptions, Kernel, KernelRuntimeHooks } from './bootstrap/createKernel.js';

// --- config ----------------------------------------------------------------
export { KERNEL_API_VERSION, loadConfig } from './config/loadConfig.js';
export type { KernelConfig, LoadConfigOptions } from './config/loadConfig.js';

// --- logging ---------------------------------------------------------------
export { createLogger, createNullLogger } from './logging/logger.js';
export type { LogFields, LogRecord, LogSink, Logger, LogLevel } from './logging/logger.js';
export {
  AUDIT_LOGS_MIGRATION_ID,
  auditLogsMigration,
  createAuditLog,
  createAuditMiddleware,
  createAuditRegistry,
  renderDetail,
} from './logging/auditLog.js';
export type {
  AuditDescriptor,
  AuditEntry,
  AuditLog,
  AuditLogOptions,
  AuditMatch,
  AuditRegistry,
  AuditRow,
  RequestLike,
  ResponseLike,
} from './logging/auditLog.js';

// --- events ----------------------------------------------------------------
export { createEventBus } from './events/eventBus.js';
export type { EventBus, EventBusOptions, EventBusStats, SubscribeOptions } from './events/eventBus.js';

// --- permissions -----------------------------------------------------------
export { createMemoryAssignmentStore, createPermissionEngine } from './permissions/permissionEngine.js';
export type {
  AssignmentStore,
  PermissionEngine,
  PermissionEngineOptions,
} from './permissions/permissionEngine.js';
export {
  CAPABILITY_ASSIGNMENTS_MIGRATION_ID,
  capabilityAssignmentsMigration,
  createSqliteAssignmentStore,
  seedAssignments,
} from './permissions/capabilityStore.js';

// --- auth ------------------------------------------------------------------
export { hashPassword, isPasswordHash, verifyPassword } from './auth/password.js';
export {
  SESSIONS_MIGRATION_ID,
  createSessionService,
  sessionsMigration,
} from './auth/session.js';
export type { IssueSessionInput, IssuedSession, SessionRow, SessionService } from './auth/session.js';
export type {
  AuthCredentials,
  AuthProvider,
  AuthenticatedIdentity,
} from './auth/authProvider.js';

// --- storage ---------------------------------------------------------------
export {
  openDatabase,
  quoteIdentifier,
  tableColumns,
  tableExists,
  transaction,
} from './storage/connection.js';
export type { Database, OpenDatabaseOptions } from './storage/connection.js';
export { SETTINGS_MIGRATION_ID, createSettingsStore, settingsMigration } from './storage/settingsStore.js';
export type { SettingsStore } from './storage/settingsStore.js';
export {
  checkTableOwnership,
  extractTableOperations,
  listApplied,
  pluginTablePrefix,
  rollbackMigration,
  runMigrations,
} from './storage/migrations.js';
export type {
  AppliedMigration,
  Migration,
  MigrationResult,
  OwnershipViolation,
  RunMigrationsOptions,
} from './storage/migrations.js';

// --- http ------------------------------------------------------------------
export {
  ApiError,
  asyncHandler,
  badRequest,
  conflict,
  createErrorMiddleware,
  forbidden,
  notFound,
  renderError,
  unauthorized,
} from './http/errorEnvelope.js';
export type { ErrorMiddlewareOptions } from './http/errorEnvelope.js';
export { createRequestContextMiddleware, getRequestContext } from './http/requestContext.js';
export type {
  RequestContext,
  RequestContextOptions,
  RequestWithContext,
  ScopeResolver,
} from './http/requestContext.js';
export { createEmptyPluginHost, createKernelRouter } from './http/kernelRoutes.js';
export type { KernelRoutesOptions, PluginHostView } from './http/kernelRoutes.js';
