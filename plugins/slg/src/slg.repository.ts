/**
 * SLG repository.
 *
 * Takes the plugin's ownership-checked `DbApi` instead of the raw connection, so every
 * statement is validated against `data.adopted` in the manifest. The two tables carry
 * their legacy names (declared as `adopted`, not `tables`) because `SELECT *` rows are
 * returned straight through to the frontend - see slg.types.ts.
 *
 * The `students` and `records` statements the pre-migration
 * `slg.repository.sqlite.ts` contained are deliberately absent: both tables are owned by
 * classroom, so the plugin reaches them through `classroom.public` instead of a second
 * writer making that ownership declaration a lie.
 */

import type { DbApi } from '@thinkclass/plugin-sdk';

import type { ClassResources, SlgRepository, Territory, TerritoryStatus, TerritoryYield } from './slg.types.js';

export function createSlgRepository(db: DbApi): SlgRepository {
  return {
    listTerritories(classId) {
      return db.query<Territory>(`SELECT * FROM territories WHERE class_id = ?`, [classId]);
    },

    getOrCreateResources(classId) {
      db.run(`INSERT OR IGNORE INTO class_resources (class_id) VALUES (?)`, [classId]);
      return db.get<ClassResources>(`SELECT * FROM class_resources WHERE class_id = ?`, [classId]) as ClassResources;
    },

    getTerritory(territoryId) {
      return db.get<Territory>(`SELECT * FROM territories WHERE id = ?`, [territoryId]) ?? null;
    },

    updateTerritoryContribution(territoryId: number, contribution: number, status: TerritoryStatus) {
      db.run(`UPDATE territories SET current_contribution = ?, status = ? WHERE id = ?`, [
        contribution,
        status,
        territoryId,
      ]);
    },

    createTerritory(input) {
      const result = db.run(
        `INSERT INTO territories (class_id, name, type, cost_to_unlock, x_pos, y_pos)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.class_id, input.name, input.type, input.cost_to_unlock, input.x_pos, input.y_pos],
      );
      return Number(result.lastInsertRowid);
    },

    listOwnedTerritoryYields(classId) {
      return db.query<Pick<Territory, 'type' | 'level'>>(
        `SELECT type, level FROM territories WHERE class_id = ? AND status = 'owned'`,
        [classId],
      );
    },

    applyYield(classId: number, yieldInput: TerritoryYield) {
      // One transaction, exactly as the pre-migration service had: a resource row that
      // exists with half the yield applied would be a state the old code could not
      // produce.
      db.tx((tx) => {
        tx.run(`INSERT OR IGNORE INTO class_resources (class_id) VALUES (?)`, [classId]);
        tx.run(
          `UPDATE class_resources
              SET wood = wood + ?, stone = stone + ?, magic_dust = magic_dust + ?, gold = gold + ?
            WHERE class_id = ?`,
          [yieldInput.wood, yieldInput.stone, yieldInput.magic_dust, yieldInput.gold, classId],
        );
      });
    },
  };
}
