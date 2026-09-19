/**
 * Cross-plugin service contracts.
 *
 * This is the typed port registry: a plugin publishes an implementation under a
 * name (`ctx.provide`) and consumers resolve it (`ctx.use`). Because the map is
 * declared here, resolving a service is type checked and the compiler catches a
 * renamed or removed method at the call site rather than at runtime.
 *
 * Ports are declared centrally, next to the DTOs they expose. Module augmentation
 * from the domain files was tried first and did not resolve reliably under
 * `moduleResolution: bundler`, so the names live here explicitly - which also makes
 * the complete set of cross-plugin interfaces readable in one place.
 *
 * The plugins that supply these ports live in `plugins/<name>`; their
 * implementations must satisfy the interfaces below, and the runtime enforces that
 * a service `<slug>.public` is only ever provided by the plugin whose slug matches.
 */

import type { ClassroomPort } from './domains/classroom.js';
import type { EngagementPort } from './domains/engagement.js';
import type { IdentityPort } from './domains/identity.js';
import type { ParentActivityRecorder } from './domains/parent-buff.js';
import type { PetPort } from './domains/pet.js';

export interface ServiceContracts {
  /** Marker entry so the interface is never empty. */
  'kernel.none': never;

  /** Supplied by the `classroom` foundation plugin. */
  'classroom.public': ClassroomPort;
  /** Supplied by the `pet` feature plugin. */
  'pet.public': PetPort;
  /**
   * Supplied by the `identity` foundation plugin.
   *
   * The activation write path: the activation-code route (identity's own) and the payment
   * webhook (still in `api/modules/platform`) both end in `activateUser`, so that one
   * operation is what crosses the boundary.
   */
  'identity.public': IdentityPort;
  /**
   * Supplied by the `parent-buff` feature plugin.
   *
   * The name is `parent_buff.public` - with an underscore - because that is the plugin's
   * derived slug: `slugOf('parent-buff')` replaces hyphens, and `serviceRegistry.provide`
   * rejects any name whose first segment is not exactly `manifest.slug`. Guardrail G7 checks
   * the same rule against the manifest, so this key is the only spelling that both the type
   * map and the runtime accept.
   *
   * Exists so `identity` stops writing `parent_activity` directly: parent login records
   * activity there and the table's owner is parent-buff. Consumers treat it as optional - a
   * parent must still be able to log in on a deployment where parent-buff is disabled.
   */
  'parent_buff.public': ParentActivityRecorder;
  /**
   * Supplied by the `engagement` feature plugin.
   *
   * Exists so the insights read model can count and read praises without touching `praises`, which
   * engagement owns. Consumers treat it as optional: a report must still render on a deployment
   * where the engagement domain is disabled, with the praise half showing zero.
   */
  'engagement.public': EngagementPort;
}

export type ServiceName = keyof ServiceContracts & string;

export type ServiceImplementation<N extends ServiceName> = ServiceContracts[N];
