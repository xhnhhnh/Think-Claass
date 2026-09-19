/**
 * Dependency resolution.
 *
 * Turns a flat set of discovered plugins into an activation order, and - just as
 * importantly - a precise account of what could not be activated and why. Every
 * rejection carries a machine-readable reason so the admin surface and the boot
 * log can explain a blocked plugin instead of leaving it mysteriously absent.
 *
 * Blocking is transitive: if A needs B and B is blocked, A is blocked too. Nothing
 * is ever activated with an unmet dependency, because the alternative is a plugin
 * that fails at request time instead of at boot.
 */

import type { PluginManifest } from '@thinkclass/contracts';
import { satisfies } from '@thinkclass/plugin-sdk';

import type { DiscoveredPlugin } from './discovery.js';

export type RejectReason =
  | 'kernel-incompatible'
  | 'missing-dependency'
  | 'version-mismatch'
  | 'conflict'
  | 'cycle'
  | 'disabled';

export interface RejectedPlugin {
  id: string;
  directory: string;
  reason: RejectReason;
  detail: string;
}

export interface ResolutionResult {
  /** Plugins that will be activated, in activation order. */
  active: DiscoveredPlugin[];
  /** Plugins that could not be activated, with the reason. */
  rejected: RejectedPlugin[];
  /** Dependency ids referenced by an active plugin but not present at all. */
  unresolvedDependencies: Array<{ pluginId: string; dependency: string; range: string }>;
}

export interface ResolveOptions {
  kernelApiVersion: number;
  /**
   * Plugin ids explicitly disabled by configuration. A disabled plugin is treated
   * as absent, so anything depending on it is blocked rather than started with a
   * half-satisfied graph.
   */
  disabled?: Iterable<string>;
}

/**
 * Deterministic topological sort.
 *
 * Kafka's ordering rule is not needed here, but determinism is: two runs over the
 * same plugin set must activate in the same order so logs and side effects are
 * reproducible. Ties break on tier (foundation first) then id.
 */
function activationSortKey(manifest: PluginManifest): [number, string] {
  return [manifest.tier === 'foundation' ? 0 : 1, manifest.id];
}

function compareKeys(a: [number, string], b: [number, string]): number {
  return a[0] - b[0] || a[1].localeCompare(b[1]);
}

export function resolvePlugins(plugins: DiscoveredPlugin[], options: ResolveOptions): ResolutionResult {
  const disabled = new Set(options.disabled ?? []);
  const rejected: RejectedPlugin[] = [];
  const unresolvedDependencies: ResolutionResult['unresolvedDependencies'] = [];

  /** Candidates after removing disabled plugins. */
  const candidates = plugins.filter((plugin) => {
    if (disabled.has(plugin.manifest.id)) {
      rejected.push({
        id: plugin.manifest.id,
        directory: plugin.directory,
        reason: 'disabled',
        detail: 'disabled by configuration',
      });
      return false;
    }
    return true;
  });

  const byId = new Map(candidates.map((plugin) => [plugin.manifest.id, plugin]));

  // -- kernel compatibility ------------------------------------------------
  /** @type {Map<string, DiscoveredPlugin>} */
  const eligible = new Map();
  for (const plugin of candidates) {
    const check = satisfies(`${options.kernelApiVersion}.0.0`, plugin.manifest.kernel);
    if (!check.ok) {
      rejected.push({
        id: plugin.manifest.id,
        directory: plugin.directory,
        reason: 'kernel-incompatible',
        detail: check.reason ?? `requires kernel "${plugin.manifest.kernel}"`,
      });
      continue;
    }
    eligible.set(plugin.manifest.id, plugin);
  }

  // -- explicit conflicts --------------------------------------------------
  const conflictRejects = new Set<string>();
  const conflictDetail = new Map<string, string>();
  for (const plugin of eligible.values()) {
    for (const other of plugin.manifest.conflictsWith ?? []) {
      if (!eligible.has(other)) continue;
      conflictRejects.add(plugin.manifest.id);
      conflictRejects.add(other);
      // Both sides are rejected, so both sides get a reason. Reporting only the
      // plugin that declared the conflict leaves the other one silently absent.
      conflictDetail.set(plugin.manifest.id, `declares a conflict with "${other}", which is also enabled`);
      if (!conflictDetail.has(other)) {
        conflictDetail.set(other, `conflicts with "${plugin.manifest.id}", which is also enabled`);
      }
    }
  }
  for (const id of [...conflictRejects].sort()) {
    const plugin = eligible.get(id);
    if (!plugin) continue;
    rejected.push({
      id,
      directory: plugin.directory,
      reason: 'conflict',
      detail: conflictDetail.get(id) ?? 'conflicts with an enabled plugin',
    });
  }

  // -- transitive dependency blocking --------------------------------------
  // Repeat until stable: a plugin blocked in one pass may block its dependents in
  // the next, and the graph depth is arbitrary.
  const blocked = new Set<string>(conflictRejects);
  let changed = true;
  while (changed) {
    changed = false;
    for (const plugin of eligible.values()) {
      const id = plugin.manifest.id;
      // Typed explicitly: destructuring with a `{}` default widens the value type to
      // `unknown`, which then leaks into the version-range check.
      const dependsOn: Record<string, string> = plugin.manifest.dependsOn ?? {};
      if (blocked.has(id)) continue;

      for (const [dependency, range] of Object.entries(dependsOn)) {
        const target = eligible.get(dependency);

        if (!target) {
          blocked.add(id);
          changed = true;
          unresolvedDependencies.push({ pluginId: id, dependency, range });
          rejected.push({
            id,
            directory: plugin.directory,
            reason: 'missing-dependency',
            detail: `requires "${dependency}" ${range}, which is not installed`,
          });
          break;
        }

        if (blocked.has(dependency)) {
          blocked.add(id);
          changed = true;
          rejected.push({
            id,
            directory: plugin.directory,
            reason: 'missing-dependency',
            detail: `requires "${dependency}" ${range}, which could not be activated`,
          });
          break;
        }

        const check = satisfies(target.manifest.version, range);
        if (!check.ok) {
          blocked.add(id);
          changed = true;
          rejected.push({
            id,
            directory: plugin.directory,
            reason: 'version-mismatch',
            detail: `requires "${dependency}" ${range} but ${target.manifest.version} is installed`,
          });
          break;
        }
      }
    }
  }

  // -- topological order with cycle detection ------------------------------
  /** @type {DiscoveredPlugin[]} */
  const active: DiscoveredPlugin[] = [];
  /** 0 = unvisited, 1 = on stack, 2 = done */
  const marks = new Map<string, 0 | 1 | 2>();
  const cycleMembers = new Set<string>();

  const visit = (plugin: DiscoveredPlugin, trail: string[]): void => {
    const id = plugin.manifest.id;
    const mark = marks.get(id) ?? 0;
    if (mark === 2) return;
    if (mark === 1) {
      // Found a back edge: everything from the first occurrence onwards is a cycle.
      const start = trail.indexOf(id);
      for (const member of trail.slice(start === -1 ? 0 : start)) cycleMembers.add(member);
      cycleMembers.add(id);
      return;
    }

    marks.set(id, 1);
    const nextTrail = [...trail, id];
    for (const dependency of Object.keys(plugin.manifest.dependsOn ?? {})) {
      const target = eligible.get(dependency);
      if (target && !blocked.has(dependency)) visit(target, nextTrail);
    }
    marks.set(id, 2);
    active.push(plugin);
  };

  const ordered = [...eligible.values()]
    .filter((plugin) => !blocked.has(plugin.manifest.id))
    .sort((a, b) => compareKeys(activationSortKey(a.manifest), activationSortKey(b.manifest)));

  for (const plugin of ordered) visit(plugin, []);

  for (const id of [...cycleMembers].sort()) {
    const plugin = eligible.get(id);
    if (!plugin) continue;
    rejected.push({
      id,
      directory: plugin.directory,
      reason: 'cycle',
      detail: `part of a dependency cycle: ${[...cycleMembers].sort().join(' -> ')}`,
    });
  }

  // Cycle members were only discovered after the dependency-blocking pass, so
  // dependents of a cycle member must be blocked now. `active` is topologically
  // ordered (dependencies first), so one forward pass is enough to propagate.
  const unavailable = new Set<string>([...blocked, ...cycleMembers]);
  for (const plugin of active) {
    const id = plugin.manifest.id;
    const dependsOn: Record<string, string> = plugin.manifest.dependsOn ?? {};
    if (unavailable.has(id)) continue;
    for (const dependency of Object.keys(dependsOn)) {
      if (!unavailable.has(dependency)) continue;
      unavailable.add(id);
      rejected.push({
        id,
        directory: plugin.directory,
        reason: 'missing-dependency',
        detail: `requires "${dependency}", which could not be activated`,
      });
      break;
    }
  }

  return {
    active: active.filter((plugin) => !unavailable.has(plugin.manifest.id)),
    rejected,
    unresolvedDependencies,
  };
}

/** Convenience: ids of the plugins that will start. */
export function activationOrder(result: ResolutionResult): string[] {
  return result.active.map((plugin) => plugin.manifest.id);
}

/** Foundation plugins that are declared `required` and are not active. */
export function missingRequiredPlugins(
  plugins: DiscoveredPlugin[],
  result: ResolutionResult,
): Array<{ id: string; reason: string }> {
  const activeIds = new Set(result.active.map((plugin) => plugin.manifest.id));
  const missing: Array<{ id: string; reason: string }> = [];

  for (const plugin of plugins) {
    if (!plugin.manifest.required) continue;
    if (activeIds.has(plugin.manifest.id)) continue;
    const rejection = result.rejected.find((r) => r.id === plugin.manifest.id);
    missing.push({
      id: plugin.manifest.id,
      reason: rejection ? `${rejection.reason}: ${rejection.detail}` : 'not active',
    });
  }
  return missing;
}
