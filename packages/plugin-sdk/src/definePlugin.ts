/**
 * `definePlugin` - the entry point every plugin's backend module uses.
 *
 *   import { definePlugin, PLUGIN_CONTEXT } from '@thinkclass/plugin-sdk';
 *
 *   export default definePlugin({
 *     controllers: [PetController],
 *     providers: [PetService],
 *     async onStart(ctx) {
 *       ctx.provide('pet.public', createPetPublicApi(ctx));
 *     },
 *   });
 *
 * The runtime reads `plugin.json` for discovery and dependency resolution *without*
 * executing this module; the module is only imported once a plugin has passed
 * validation and its dependencies are satisfied.
 */

import type { Provider, Type } from '@nestjs/common';

import type { KernelContext } from './context.js';

export interface PluginBackendModule {
  /**
   * Nest controllers contributed by this plugin. The runtime assembles them into a
   * per-plugin dynamic module, so routes are mounted atomically and can be removed
   * by restarting with a different plugin set.
   */
  controllers?: Type<unknown>[];
  /** Nest providers (services, repositories) contributed by this plugin. */
  providers?: Provider[];
  /** Called once dependencies are satisfied, before routes are mounted. */
  setup?(ctx: KernelContext): void | Promise<void>;
  /** Called after routes are mounted. */
  onStart?(ctx: KernelContext): void | Promise<void>;
  /** Called before routes are unmounted. */
  onStop?(ctx: KernelContext): void | Promise<void>;
}

const BRAND = Symbol.for('thinkclass.plugin');

export interface PluginDefinition extends PluginBackendModule {
  readonly [BRAND]: true;
}

/**
 * Identity function that brands a plugin definition.
 *
 * The brand lets the runtime reject a module that was not built with the SDK, which
 * catches the common mistake of exporting a bare object whose hooks are silently
 * never called.
 */
export function definePlugin(definition: PluginBackendModule): PluginDefinition {
  if (definition === null || typeof definition !== 'object') {
    throw new TypeError('definePlugin() expects an object');
  }
  for (const key of ['controllers', 'providers'] as const) {
    const value = definition[key];
    if (value !== undefined && !Array.isArray(value)) {
      throw new TypeError(`definePlugin(): "${key}" must be an array`);
    }
  }
  return Object.freeze({ ...definition, [BRAND]: true as const });
}

/** True when `value` came from `definePlugin()`. */
export function isPluginDefinition(value: unknown): value is PluginDefinition {
  return Boolean(value && typeof value === 'object' && (value as Record<symbol, unknown>)[BRAND] === true);
}
