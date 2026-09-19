/**
 * Dungeon domain types.
 *
 * The DTOs are re-exported from `@thinkclass/contracts` so the plugin and any future
 * consumer share one definition; only what describes this plugin's own table is
 * declared here.
 *
 * `dungeon_runs` is adopted rather than namespaced: the row is returned straight
 * through to the frontend and the column names ARE the response field names
 * (`current_floor`, `max_floor`, `active_buffs`, `current_hp`, `max_hp`, `status`).
 *
 * Two methods the pre-migration repository implemented are deliberately **absent**:
 *
 *   `addStudentPoints`  wrote `students.available_points`
 *   `insertRecord`      wrote the shared `records` point ledger
 *
 * `students` and `records` are classroom-owned, so both now go through
 * `classroom.public` (`transferStudentCredits` / `recordStudentLedgerEntry`). A
 * second writer would make classroom's ownership declaration a lie - and the plugin
 * runtime's table-ownership check rejects the statement at the call site anyway.
 */

import type { DungeonChoicePayload, DungeonChoiceResult, DungeonRun, DungeonState, FloorChoice } from '@thinkclass/contracts/domains/dungeon';

export interface DungeonRunRow extends Omit<DungeonRun, 'active_buffs'> {
  active_buffs: string | string[] | null;
}

/** Fields `updateRun` writes; mirrors the column list, not the whole row. */
export interface DungeonRunUpdate {
  currentFloor: number;
  maxFloor: number;
  currentHp: number;
  activeBuffs: string[];
  status: string;
}

export interface DungeonRepository {
  /** One better-sqlite3 transaction. Must only wrap synchronous statements. */
  transaction<T>(fn: () => T): T;
  getActiveRun(studentId: number): DungeonRunRow | null;
  getBestFloor(studentId: number): number;
  endActiveRuns(studentId: number): void;
  createRun(studentId: number): number;
  updateRun(runId: number, input: DungeonRunUpdate): void;
}

export type { DungeonChoicePayload, DungeonChoiceResult, DungeonRun, DungeonState, FloorChoice };
