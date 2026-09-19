/**
 * Dungeon repository.
 *
 * Takes the plugin's ownership-checked `DbApi` instead of the raw connection, so
 * every statement is validated against `data.adopted` in the manifest. `dungeon_runs`
 * keeps its legacy name (declared as `adopted`, not `tables`) because its column
 * names are the JSON the frontend reads - see dungeon.types.ts.
 *
 * `students` and `records` are deliberately absent: student points and the shared
 * ledger are reached through `classroom.public` from the service, because a second
 * writer would make classroom's ownership of those tables meaningless.
 */

import type { DbApi } from '@thinkclass/plugin-sdk';

import type { DungeonRepository, DungeonRunRow, DungeonRunUpdate } from './dungeon.types.js';

export function createDungeonRepository(db: DbApi): DungeonRepository {
  return {
    transaction<T>(fn: () => T): T {
      // Nested `db.tx` is a savepoint in better-sqlite3, so wrapping is safe.
      return db.tx(() => fn());
    },

    getActiveRun(studentId) {
      return (
        db.get<DungeonRunRow>(
          `SELECT * FROM dungeon_runs WHERE student_id = ? AND status = 'active'`,
          [studentId],
        ) ?? null
      );
    },

    getBestFloor(studentId) {
      const row = db.get<{ best_floor: number | null }>(
        `SELECT MAX(max_floor) as best_floor FROM dungeon_runs WHERE student_id = ?`,
        [studentId],
      );
      return row?.best_floor ?? 0;
    },

    endActiveRuns(studentId) {
      db.run(`UPDATE dungeon_runs SET status = 'died' WHERE student_id = ? AND status = 'active'`, [studentId]);
    },

    createRun(studentId) {
      const result = db.run(
        `INSERT INTO dungeon_runs (student_id, current_floor, max_floor, active_buffs, current_hp, max_hp, status)
         VALUES (?, 1, 1, '[]', 100, 100, 'active')`,
        [studentId],
      );
      return Number(result.lastInsertRowid);
    },

    updateRun(runId, input: DungeonRunUpdate) {
      db.run(
        `UPDATE dungeon_runs
            SET current_floor = ?, max_floor = ?, current_hp = ?, active_buffs = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [input.currentFloor, input.maxFloor, input.currentHp, JSON.stringify(input.activeBuffs), input.status, runId],
      );
    },
  };
}
