/**
 * Cross-plugin service contracts.
 *
 * This is the typed port registry: a plugin publishes an implementation under a
 * name (`ctx.provide`) and consumers resolve it (`ctx.use`). Because the map is
 * declared here, resolving a service is type checked and the compiler catches a
 * renamed or removed method at the call site rather than at runtime.
 *
 * Plugins extend this interface alongside the plugin that supplies the service:
 *
 *   export interface ServiceContracts {
 *     'classroom.public': ClassroomPublicApi;
 *     'identity.public': IdentityPublicApi;
 *   }
 */

export interface ServiceContracts {
  /** Marker entry so the interface is never empty. */
  'kernel.none': never;
}

export type ServiceName = keyof ServiceContracts & string;

export type ServiceImplementation<N extends ServiceName> = ServiceContracts[N];
