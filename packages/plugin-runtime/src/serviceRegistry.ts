/**
 * Cross-plugin service registry.
 *
 * This is how plugins talk to each other. A plugin publishes an implementation
 * under a namespaced name (`classroom.public`) and consumers resolve it. Direct
 * imports between plugins are forbidden by guardrail G1 precisely so that this
 * registry is the only channel - a stable interface rather than a shared internal.
 *
 * The naming rule is enforced: a service `<slug>.public` may only be provided by
 * the plugin whose slug is `<slug>`. Without that check a plugin could publish an
 * implementation under another plugin's name and impersonate it.
 */

import type { ServiceContracts, ServiceName } from '@thinkclass/contracts';
import type { Logger } from '@thinkclass/kernel';

export interface ServiceRegistration {
  name: string;
  pluginId: string;
  pluginSlug: string;
}

export interface ServiceRegistry {
  /**
   * Publish an implementation.
   *
   * `implementation` is typed `unknown` here on purpose: `ServiceContracts[N]` is
   * not provable for an unresolved generic `N`, so a precise signature would force
   * every caller to cast. The precise typing lives where plugin authors see it -
   * `KernelContext.provide` - and this layer validates the *name* at runtime, which
   * is the part types cannot check.
   */
  provide(pluginSlug: string, name: ServiceName, implementation: unknown): void;
  use<N extends ServiceName>(consumer: string, name: N): ServiceContracts[N];
  tryUse<N extends ServiceName>(consumer: string, name: N): ServiceContracts[N] | null;
  has(name: string): boolean;
  list(): ServiceRegistration[];
  /** Drop everything a plugin published; used when a plugin stops. */
  revoke(pluginSlug: string): number;
}

export class ServiceNotAvailableError extends Error {
  constructor(
    readonly consumer: string,
    readonly name: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceNotAvailableError';
  }
}

export function createServiceRegistry(logger?: Logger): ServiceRegistry {
  const registry = new Map<string, ServiceRegistration & { implementation: unknown }>();

  return {
    provide(pluginSlug, name, implementation) {
      const owner = String(name).split('.')[0];
      if (owner !== pluginSlug) {
        throw new Error(
          `plugin "${pluginSlug}" may not provide service "${name}": the name must be namespaced under its own slug ("${pluginSlug}.*")`,
        );
      }
      if (registry.has(name)) {
        const existing = registry.get(name) as ServiceRegistration;
        throw new Error(`service "${name}" is already provided by plugin "${existing.pluginSlug}"`);
      }
      registry.set(name, { name, pluginId: pluginSlug, pluginSlug, implementation });
      logger?.debug('service provided', { name, pluginSlug });
    },

    use(consumer, name) {
      const entry = registry.get(name);
      if (!entry) {
        throw new ServiceNotAvailableError(
          consumer,
          name,
          `plugin "${consumer}" requires service "${name}", which no active plugin provides`,
        );
      }
      return entry.implementation as ServiceContracts[typeof name];
    },

    tryUse(consumer, name) {
      const entry = registry.get(name);
      return entry ? (entry.implementation as ServiceContracts[typeof name]) : null;
    },

    has(name) {
      return registry.has(name);
    },

    list() {
      return [...registry.values()].map(({ name, pluginId, pluginSlug }) => ({ name, pluginId, pluginSlug }));
    },

    revoke(pluginSlug) {
      let removed = 0;
      for (const [name, entry] of registry) {
        if (entry.pluginSlug !== pluginSlug) continue;
        registry.delete(name);
        removed += 1;
      }
      return removed;
    },
  };
}
