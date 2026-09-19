/**
 * Permission engine.
 *
 * Replaces the 19 `enable_*` boolean columns on the `classes` table and the two
 * hardcoded key lists (`api/utils/classFeatures.ts`, `src/lib/classFeatures.ts`).
 *
 * Plugins declare permissions in their manifest; the engine resolves a decision by
 * walking the scope chain from narrowest to widest and falling back to the
 * declared default. Nothing about a specific permission is known to the kernel.
 */

import type {
  Actor,
  CapabilityAssignment,
  PermissionDeclaration,
  PermissionKey,
  ScopeRef,
  ScopeType,
} from '@thinkclass/contracts';

import type { Logger } from '../logging/logger.js';

const SCOPE_ORDER: Record<ScopeType, number> = {
  student: 0,
  class: 1,
  school: 2,
  platform: 3,
};

export interface AssignmentStore {
  get(scopeType: ScopeType, scopeId: number, key: PermissionKey): boolean | undefined;
  list(scopeType?: ScopeType, scopeId?: number): CapabilityAssignment[];
  set(assignment: CapabilityAssignment): void;
}

/** In-memory store; the SQLite-backed variant is created by the storage layer. */
export function createMemoryAssignmentStore(seed: CapabilityAssignment[] = []): AssignmentStore {
  const rows = new Map<string, CapabilityAssignment>();
  const idOf = (a: CapabilityAssignment) => `${a.scopeType}:${a.scopeId}:${a.capabilityKey}`;
  for (const a of seed) rows.set(idOf(a), a);

  return {
    get(scopeType, scopeId, key) {
      return rows.get(`${scopeType}:${scopeId}:${key}`)?.enabled;
    },
    list(scopeType, scopeId) {
      return [...rows.values()].filter(
        (a) => (scopeType === undefined || a.scopeType === scopeType) && (scopeId === undefined || a.scopeId === scopeId),
      );
    },
    set(assignment) {
      rows.set(idOf(assignment), assignment);
    },
  };
}

export interface PermissionEngine {
  /** Register every permission a plugin declares. Duplicate keys throw. */
  register(declarations: PermissionDeclaration[], pluginId: string): void;
  /** Remove a plugin's declarations (plugin stop/uninstall). */
  unregister(pluginId: string): void;
  list(): PermissionDeclaration[];
  get(key: PermissionKey): PermissionDeclaration | undefined;
  /** Does the actor hold `key`? Walks student -> class -> school -> platform. */
  can(actor: Actor, key: PermissionKey, scope?: ScopeRef): boolean;
  /** The scopes consulted for this actor, narrowest first. */
  scopeChain(actor: Actor, scope?: ScopeRef): ScopeRef[];
  store: AssignmentStore;
}

export interface PermissionEngineOptions {
  store?: AssignmentStore;
  logger?: Logger;
}

export function createPermissionEngine(options: PermissionEngineOptions = {}): PermissionEngine {
  const store = options.store ?? createMemoryAssignmentStore();
  const logger = options.logger;
  /** key -> declaration */
  const declarations = new Map<PermissionKey, PermissionDeclaration>();
  /** pluginId -> keys it declared */
  const ownedByPlugin = new Map<string, Set<PermissionKey>>();

  function scopeChain(actor: Actor, scope?: ScopeRef): ScopeRef[] {
    const chain: ScopeRef[] = [];
    const explicit = scope ?? inferScope(actor);
    if (explicit) chain.push(explicit);
    if (actor.studentId !== undefined && !chain.some((s) => s.type === 'student')) {
      chain.push({ type: 'student', id: actor.studentId });
    }
    if (actor.classId !== undefined && !chain.some((s) => s.type === 'class')) {
      chain.push({ type: 'class', id: actor.classId });
    }
    if (actor.schoolId !== undefined && !chain.some((s) => s.type === 'school')) {
      chain.push({ type: 'school', id: actor.schoolId });
    }
    chain.push({ type: 'platform' });
    return chain.sort((a, b) => SCOPE_ORDER[a.type] - SCOPE_ORDER[b.type]);
  }

  function inferScope(actor: Actor): ScopeRef | undefined {
    if (actor.studentId !== undefined) return { type: 'student', id: actor.studentId };
    if (actor.classId !== undefined) return { type: 'class', id: actor.classId };
    if (actor.schoolId !== undefined) return { type: 'school', id: actor.schoolId };
    return undefined;
  }

  return {
    store,

    register(list, pluginId) {
      for (const declaration of list) {
        const existing = declarations.get(declaration.key);
        if (existing && existing.pluginId !== pluginId) {
          throw new Error(
            `permission "${declaration.key}" is already declared by plugin "${existing.pluginId}"`,
          );
        }
        declarations.set(declaration.key, { ...declaration, pluginId });
        const owned = ownedByPlugin.get(pluginId) ?? new Set<PermissionKey>();
        owned.add(declaration.key);
        ownedByPlugin.set(pluginId, owned);
      }
      logger?.debug('permissions registered', { pluginId, count: list.length });
    },

    unregister(pluginId) {
      const owned = ownedByPlugin.get(pluginId);
      if (!owned) return;
      for (const key of owned) declarations.delete(key);
      ownedByPlugin.delete(pluginId);
    },

    list() {
      return [...declarations.values()].sort((a, b) => a.key.localeCompare(b.key));
    },

    get(key) {
      return declarations.get(key);
    },

    scopeChain,

    can(actor, key, scope) {
      const declaration = declarations.get(key);
      if (!declaration) {
        // An undeclared permission is denied. Failing closed matters more here than
        // convenience: a typo must not silently grant access.
        logger?.warn('permission not declared', { key, actorRole: actor.role });
        return false;
      }

      for (const ref of scopeChain(actor, scope)) {
        if (ref.id === undefined) continue;
        const assigned = store.get(ref.type, ref.id, key);
        if (assigned !== undefined) return assigned;
      }
      return declaration.default;
    },
  };
}
