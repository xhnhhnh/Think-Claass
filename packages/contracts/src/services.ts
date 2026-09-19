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
import type { PetPort } from './domains/pet.js';

export interface ServiceContracts {
  /** Marker entry so the interface is never empty. */
  'kernel.none': never;

  /** Supplied by the `classroom` foundation plugin. */
  'classroom.public': ClassroomPort;
  /** Supplied by the `pet` feature plugin. */
  'pet.public': PetPort;
}

export type ServiceName = keyof ServiceContracts & string;

export type ServiceImplementation<N extends ServiceName> = ServiceContracts[N];
