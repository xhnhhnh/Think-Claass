/**
 * @thinkclass/contracts - the neutral shared vocabulary.
 *
 * Type-only by design and enforced by guardrail G6: this package must never gain
 * runtime code, otherwise it stops being a vocabulary and becomes a hidden
 * implementation layer that every plugin transitively depends on.
 */

export type {
  ApiFailure,
  ApiResult,
  ApiSuccess,
  HealthStatus,
  PageRequest,
  PageResult,
} from './http.js';

export type {
  Actor,
  CapabilityAssignment,
  PermissionDeclaration,
  PermissionKey,
  Role,
  ScopeRef,
  ScopeType,
} from './identity.js';

export type {
  Disposable,
  EventContracts,
  EventHandler,
  EventMeta,
  EventPayload,
  EventTopic,
} from './events.js';

export type { ServiceContracts, ServiceImplementation, ServiceName } from './services.js';

export type {
  FrontendMenuDeclaration,
  FrontendRouteDeclaration,
  FrontendSlotDeclaration,
  HttpMethod,
  JobDeclaration,
  LayoutId,
  MigrationDeclaration,
  PluginDataDeclaration,
  PluginFrontendDeclaration,
  PluginIsolation,
  PluginManifest,
  PluginProvides,
  PluginState,
  PluginTier,
  PublicPluginDescriptor,
  RouteDeclaration,
  ServiceDeclaration,
  SettingDeclaration,
  SlotId,
} from './plugin.js';
