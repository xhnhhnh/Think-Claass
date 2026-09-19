/**
 * Dependency resolution.
 *
 * Every rejection must be actionable: "plugin X did not start" is not a usable
 * outcome, so each case carries a machine-readable reason and a sentence naming the
 * unsatisfied dependency and the versions involved.
 */

import { describe, expect, it } from 'vitest';

import { validateManifest } from '@thinkclass/plugin-sdk';
import { activationOrder, missingRequiredPlugins, resolvePlugins } from '@thinkclass/plugin-runtime';

import type { DiscoveredPlugin } from '@thinkclass/plugin-runtime';

function plugin(id: string, overrides: Record<string, unknown> = {}): DiscoveredPlugin {
  // Note: no `kernelApiVersion` option - manifest validation is a separate concern
  // here, and passing it would reject the very fixtures used to exercise the
  // resolver's own kernel-compatibility check.
  const result = validateManifest({
    id,
    name: id,
    version: '1.0.0',
    kernel: '^1',
    tier: 'feature',
    entry: { backend: './src/index.ts' },
    ...overrides,
  });
  if (!result.manifest) throw new Error(`fixture "${id}" is invalid: ${JSON.stringify(result.errors)}`);
  return {
    manifest: result.manifest,
    directory: `/plugins/${id}`,
    absoluteManifestPath: `/plugins/${id}/plugin.json`,
    warnings: result.warnings,
  };
}

const foundation = (id: string, overrides: Record<string, unknown> = {}) =>
  plugin(id, { tier: 'foundation', required: true, ...overrides });

describe('dependency resolution', () => {
  it('orders dependencies before dependents', () => {
    const result = resolvePlugins([plugin('app', { dependsOn: { core: '^1' } }), foundation('core')], {
      kernelApiVersion: 1,
    });
    expect(activationOrder(result)).toEqual(['core', 'app']);
  });

  it('orders an arbitrarily deep chain', () => {
    const plugins = [
      plugin('c', { dependsOn: { b: '^1' } }),
      plugin('b', { dependsOn: { a: '^1' } }),
      foundation('a'),
    ];
    expect(activationOrder(resolvePlugins(plugins, { kernelApiVersion: 1 }))).toEqual(['a', 'b', 'c']);
  });

  it('puts foundation plugins first when there is no dependency between them', () => {
    const result = resolvePlugins([plugin('zeta'), foundation('alpha')], { kernelApiVersion: 1 });
    expect(activationOrder(result)).toEqual(['alpha', 'zeta']);
  });

  it('reports a missing dependency precisely', () => {
    const result = resolvePlugins([plugin('app', { dependsOn: { absent: '^2.0.0' } })], { kernelApiVersion: 1 });
    expect(result.active).toEqual([]);
    expect(result.rejected[0]).toMatchObject({ id: 'app', reason: 'missing-dependency' });
    expect(result.rejected[0].detail).toContain('absent');
    expect(result.unresolvedDependencies).toEqual([{ pluginId: 'app', dependency: 'absent', range: '^2.0.0' }]);
  });

  it('reports a version mismatch with both versions', () => {
    const result = resolvePlugins([plugin('app', { dependsOn: { core: '^2.0.0' } }), foundation('core')], {
      kernelApiVersion: 1,
    });
    expect(result.rejected[0]).toMatchObject({ id: 'app', reason: 'version-mismatch' });
    expect(result.rejected[0].detail).toContain('1.0.0 is installed');
  });

  it('blocks dependents transitively', () => {
    const plugins = [
      plugin('top', { dependsOn: { middle: '^1' } }),
      plugin('middle', { dependsOn: { missing: '^1' } }),
    ];
    const result = resolvePlugins(plugins, { kernelApiVersion: 1 });
    expect(result.active).toEqual([]);
    expect(result.rejected.map((r) => r.id).sort()).toEqual(['middle', 'top']);
    expect(result.rejected.find((r) => r.id === 'top')?.detail).toContain('could not be activated');
  });

  it('rejects a plugin that requires a newer kernel API', () => {
    const result = resolvePlugins([plugin('future', { kernel: '^2' })], { kernelApiVersion: 1 });
    expect(result.active).toEqual([]);
    expect(result.rejected[0]).toMatchObject({ id: 'future', reason: 'kernel-incompatible' });
    expect(result.rejected[0].detail).toContain('^2');
  });

  it('rejects conflicting plugins pairwise', () => {
    const plugins = [
      plugin('alpha', { conflictsWith: ['beta'] }),
      plugin('beta'),
    ];
    const result = resolvePlugins(plugins, { kernelApiVersion: 1 });
    expect(result.active).toEqual([]);
    expect(result.rejected.filter((r) => r.reason === 'conflict')).toHaveLength(2);
  });

  it('detects a dependency cycle and blocks everything in it', () => {
    const plugins = [
      plugin('a', { dependsOn: { b: '^1' } }),
      plugin('b', { dependsOn: { a: '^1' } }),
    ];
    const result = resolvePlugins(plugins, { kernelApiVersion: 1 });
    expect(result.active).toEqual([]);
    expect(result.rejected.every((r) => r.reason === 'cycle')).toBe(true);
    expect(result.rejected[0].detail).toContain('dependency cycle');
  });

  it('propagates a cycle to dependents outside the cycle', () => {
    const plugins = [
      plugin('a', { dependsOn: { b: '^1' } }),
      plugin('b', { dependsOn: { a: '^1' } }),
      plugin('outsider', { dependsOn: { a: '^1' } }),
    ];
    const result = resolvePlugins(plugins, { kernelApiVersion: 1 });
    expect(result.active).toEqual([]);
    // The outsider is rejected because its dependency could not activate, not
    // because it is itself in the cycle.
    expect(result.rejected.find((r) => r.id === 'outsider')?.reason).toBe('missing-dependency');
  });

  it('treats a disabled plugin as absent and blocks its dependents', () => {
    const plugins = [foundation('core'), plugin('app', { dependsOn: { core: '^1' } })];
    const result = resolvePlugins(plugins, { kernelApiVersion: 1, disabled: ['core'] });

    expect(result.rejected.find((r) => r.id === 'core')?.reason).toBe('disabled');
    expect(result.rejected.find((r) => r.id === 'app')?.reason).toBe('missing-dependency');
    expect(result.active).toEqual([]);
  });

  it('never activates a plugin whose dependency is unsatisfied', () => {
    const plugins = [
      foundation('core'),
      plugin('ok', { dependsOn: { core: '^1' } }),
      plugin('broken', { dependsOn: { core: '^9' } }),
    ];
    const result = resolvePlugins(plugins, { kernelApiVersion: 1 });
    expect(activationOrder(result)).toEqual(['core', 'ok']);
  });

  it('is deterministic across runs', () => {
    const build = () => [plugin('m'), plugin('a'), foundation('z'), plugin('b')];
    const first = activationOrder(resolvePlugins(build(), { kernelApiVersion: 1 }));
    const second = activationOrder(resolvePlugins(build(), { kernelApiVersion: 1 }));
    expect(first).toEqual(second);
  });
});

describe('required plugins', () => {
  it('reports a required plugin that could not activate', () => {
    const plugins = [foundation('core', { dependsOn: { ghost: '^1' } }), plugin('app')];
    const result = resolvePlugins(plugins, { kernelApiVersion: 1 });
    const missing = missingRequiredPlugins(plugins, result);
    expect(missing).toHaveLength(1);
    expect(missing[0].id).toBe('core');
    expect(missing[0].reason).toContain('missing-dependency');
  });

  it('reports nothing when every required plugin is active', () => {
    const plugins = [foundation('core'), plugin('app')];
    const result = resolvePlugins(plugins, { kernelApiVersion: 1 });
    expect(missingRequiredPlugins(plugins, result)).toEqual([]);
  });
});
