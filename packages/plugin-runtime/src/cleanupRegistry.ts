/**
 * The cleanup registry: how a cross-domain account deletion stays atomic without a cross-domain
 * writer.
 *
 * ## The problem this solves
 *
 * `DELETE /api/admin/users/:id` removed a teacher, their classes, their students and everything
 * those students owned: **58 tables in one `prisma.$transaction`**. Two properties mattered and
 * pulled in opposite directions:
 *
 *   - it is **atomic** - there is no such thing as a half-deleted account, which is what keeps
 *     the database's foreign keys satisfiable;
 *   - it **bypasses the ownership model** - it goes through Prisma, not `DbApi`, so it can and does
 *     delete from every other domain's tables by hard-coded name. It was the one write path that
 *     G1/G2/G10 could not see (a `tx.<table>.deleteMany` looks like nothing at all to a static
 *     check).
 *
 * The ruling is in `docs/migration/admin-cascade-decision.md`: keep the atomicity, and give the
 * table names back to their owners. Each plugin registers a rule deleting rows from **its own**
 * tables; this registry orders the rules from the schema and runs them in one transaction.
 *
 * ## What the runtime knows, and what it does not
 *
 * It knows that a set of rules exists, that a table may have exactly one rule, and that the order
 * follows the foreign-key graph. It names **no business table**: every table name in this file is
 * one a caller passed in. That boundary is what keeps guardrail G5 (the kernel and the runtime
 * carry zero domain knowledge) true while the kernel executes business deletes - the tension
 * HANDOFF section 1.1 recorded for option B is resolved by narrowing the runtime's job to
 * ordering, not by loosening G5.
 *
 * ## Why the order is derived rather than declared
 *
 * A rule may need ids derived from a table another plugin owns: the collaboration rule deletes
 * `peer_reviews` matched by `assignment_id IN (SELECT id FROM assignments WHERE ...)`, and
 * `assignments` is deleted by the assignments rule in the same batch. If the assignments rule ran
 * first, that subquery would return nothing and the peer reviews would be left behind - silently,
 * unless a foreign key happens to catch it. Foreign keys express exactly that dependency
 * (`peer_reviews.assignment_id -> assignments.id`), so the order is read from
 * `PRAGMA foreign_key_list` instead of being maintained by hand next to the rules.
 *
 * The graph is verified acyclic: a cycle throws with the participating rules named, rather than
 * picking an arbitrary order and hoping.
 */

import type { Database, Logger } from '@thinkclass/kernel';
import type { CleanupRule, CleanupSubject, DbApi } from '@thinkclass/plugin-sdk';

/** A rule as registered by one plugin, with the context it needs to run. */
export interface RegisteredCleanupRule {
  pluginId: string;
  rule: CleanupRule;
  /** The registrant's own ownership-checked handle; statements still run through the check. */
  api: DbApi;
  /** Tables the registrant declared; a rule may only name these. */
  ownedTables: Set<string>;
}

export interface CleanupRegistration {
  pluginId: string;
  rule: CleanupRule;
  api: DbApi;
  ownedTables: Set<string>;
}

export interface CleanupRegistry {
  /**
   * Register a plugin's rule. Throws when the rule reaches outside the plugin's declaration or
   * when another plugin already claimed one of its tables - a plugin that fails here fails its
   * `setup()`, which is the same fail-closed posture as every other declaration in the runtime.
   */
  register(registration: CleanupRegistration): void;
  /** Every table with a registered rule, sorted. */
  tables(): string[];
  /** Rules in the order they will run, for diagnostics and tests. */
  executionOrder(): string[];
  /** Rule id (`<pluginId>`) -> tables, sorted; diagnostics and tests. */
  rules(): Array<{ pluginId: string; tables: string[] }>;
  /**
   * Run every rule for `subject` inside ONE transaction.
   *
   * Foreign keys are enforced immediately (not deferred): if a rule is missing or the order is
   * wrong, the statement that dangles fails the whole transaction instead of committing a database
   * full of orphans.
   */
  run(subject: CleanupSubject): void;
}

export interface CleanupRegistryOptions {
  db: Database;
  logger?: Logger;
}

function uniqueIds(values: number[] | undefined): number[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === 'number' && Number.isFinite(value)))].sort(
    (left, right) => left - right,
  );
}

/** Named id sets, normalized once so every rule sees the same shape. */
export function normalizeSubject(subject: CleanupSubject): CleanupSubject {
  return {
    teacherIds: uniqueIds(subject?.teacherIds),
    classIds: uniqueIds(subject?.classIds),
    studentIds: uniqueIds(subject?.studentIds),
    userIds: uniqueIds(subject?.userIds),
  };
}

function isThenable(value: unknown): boolean {
  return Boolean(value) && typeof (value as { then?: unknown }).then === 'function';
}

export function createCleanupRegistry(options: CleanupRegistryOptions): CleanupRegistry {
  const { db, logger } = options;
  const registered: RegisteredCleanupRule[] = [];
  const claim = new Map<string, string>();
  let ordered: RegisteredCleanupRule[] | null = null;

  function register(registration: CleanupRegistration): void {
    const { pluginId, rule, api, ownedTables } = registration;

    if (!Array.isArray(rule?.tables) || rule.tables.length === 0) {
      throw new Error(`plugin "${pluginId}" registered a cleanup rule with no tables`);
    }
    if (typeof rule.run !== 'function') {
      throw new Error(`plugin "${pluginId}" registered a cleanup rule without a run() function`);
    }

    // Validate the whole rule before claiming anything: a rejected registration must leave the
    // registry exactly as it was, or a plugin whose setup failed would still hold table claims and
    // the next plugin's legitimate rule would be refused as a duplicate.
    for (const table of rule.tables) {
      if (!ownedTables.has(table)) {
        throw new Error(
          `plugin "${pluginId}" registered a cleanup rule for table "${table}", which it does not own. ` +
            `Declare it in manifest data.tables or data.adopted, or leave it to its owner.`,
        );
      }
      const owner = claim.get(table);
      if (owner && owner !== pluginId) {
        throw new Error(
          `cleanup rule for table "${table}" is already registered by plugin "${owner}"; ` +
            `plugin "${pluginId}" cannot claim it too. One table has one cleanup owner.`,
        );
      }
    }

    for (const table of rule.tables) claim.set(table, pluginId);

    registered.push({ pluginId, rule: { ...rule, tables: [...rule.tables] }, api, ownedTables });
    ordered = null;
  }

  /**
   * Foreign keys pointing from a registered table to another registered table.
   *
   * `PRAGMA foreign_key_list` rather than `sqlite_master` SQL parsing: it is the schema's own
   * answer, so it cannot drift from what SQLite will enforce.
   */
  function parentEdges(table: string): string[] {
    const rows = db.prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`).all() as Array<{
      table: string;
    }>;
    return rows.map((row) => row.table);
  }

  /**
   * Rules in run order: children before parents.
   *
   * Kahn's algorithm over the rule graph, where an edge `A -> B` means "some table A deletes from
   * references some table B deletes from". Ties are broken by plugin id so the order is stable
   * across runs.
   */
  function order(): RegisteredCleanupRule[] {
    if (ordered) return ordered;

    const tableOwner = new Map<string, number>();
    registered.forEach((entry, index) => {
      for (const table of entry.rule.tables) tableOwner.set(table, index);
    });

    const before = new Map<number, Set<number>>();
    const indegree = new Array<number>(registered.length).fill(0);
    for (let index = 0; index < registered.length; index += 1) before.set(index, new Set());

    for (let index = 0; index < registered.length; index += 1) {
      for (const table of registered[index].rule.tables) {
        for (const parent of parentEdges(table)) {
          const parentIndex = tableOwner.get(parent);
          if (parentIndex === undefined || parentIndex === index) continue;
          if (before.get(index)?.has(parentIndex)) continue;
          before.get(index)?.add(parentIndex);
          indegree[parentIndex] += 1;
        }
      }
    }

    const remaining = new Set(registered.map((_entry, index) => index));
    const result: RegisteredCleanupRule[] = [];
    while (remaining.size > 0) {
      const ready = [...remaining]
        .filter((index) => indegree[index] === 0)
        .sort((left, right) => registered[left].pluginId.localeCompare(registered[right].pluginId));
      if (ready.length === 0) {
        const cycle = [...remaining].map((index) => registered[index].pluginId).sort();
        throw new Error(
          `cleanup rules form a cycle in the foreign-key graph: ${cycle.join(', ')}. ` +
            `Run order is derived automatically, so a cycle means the rules cannot be ordered in a ` +
            `single pass; split one of them or express the dependency differently.`,
        );
      }
      for (const index of ready) {
        remaining.delete(index);
        result.push(registered[index]);
        for (const target of before.get(index) ?? []) indegree[target] -= 1;
      }
    }

    ordered = result;
    return result;
  }

  return {
    register,

    tables() {
      return [...claim.keys()].sort();
    },

    rules() {
      return registered
        .map((entry) => ({ pluginId: entry.pluginId, tables: [...entry.rule.tables].sort() }))
        .sort((left, right) => left.pluginId.localeCompare(right.pluginId));
    },

    executionOrder() {
      return order().map((entry) => entry.pluginId);
    },

    run(subject) {
      const normalized = normalizeSubject(subject);
      const plan = order();

      db.transaction(() => {
        for (const entry of plan) {
          const result = entry.rule.run(entry.api, normalized) as unknown;
          if (isThenable(result)) {
            throw new Error(
              `cleanup rule of plugin "${entry.pluginId}" returned a promise. Rules must be ` +
                `synchronous: better-sqlite3 transaction callbacks cannot await, so an async rule ` +
                `would run part of its work outside this transaction while looking atomic.`,
            );
          }
        }
      })();

      logger?.debug('cleanup rules executed', {
        rules: plan.length,
        tables: claim.size,
        teacherIds: normalized.teacherIds,
        classIds: normalized.classIds.length,
        studentIds: normalized.studentIds.length,
        userIds: normalized.userIds.length,
      });
    },
  };
}
