/**
 * Battles repository.
 *
 * Takes the plugin's ownership-checked `DbApi` instead of the raw connection, so every
 * statement is validated against the manifest. This repository touches exactly one
 * table - `class_battles`, which battles owns under its legacy name (`data.adopted`) -
 * and nothing else; `students`, `classes` and `records` all moved behind
 * `classroom.public` (see battles.types.ts).
 *
 * Relocated from `api/modules/battles/battles.repository.sqlite.ts`; the three
 * statements that read classroom's tables were replaced by port calls in
 * battles.service.ts rather than copied.
 */

import type { ClassBattle, InitiateBattlePayload } from '@thinkclass/contracts/domains/battles';
import type { DbApi } from '@thinkclass/plugin-sdk';

import type { BattlesRepository } from './battles.types.js';

export function createBattlesRepository(db: DbApi): BattlesRepository {
  return {
    listBattles(classId) {
      // The pre-migration query joined `classes` twice, which meant an INNER JOIN: a
      // battle pointing at a deleted class disappeared from the list. The service
      // reproduces that by resolving names through the port and skipping such rows.
      return db.query<ClassBattle>(
        `SELECT * FROM class_battles
          WHERE initiator_class_id = ? OR target_class_id = ?
          ORDER BY id DESC`,
        [classId, classId],
      );
    },

    getBattle(battleId) {
      return db.get<ClassBattle>(`SELECT * FROM class_battles WHERE id = ?`, [battleId]) ?? null;
    },

    findActiveBattleForClass(classId) {
      return (
        db.get<ClassBattle>(
          `SELECT * FROM class_battles
            WHERE status IN ('pending', 'active')
              AND (initiator_class_id = ? OR target_class_id = ?)`,
          [classId, classId],
        ) ?? null
      );
    },

    createBattle(input: InitiateBattlePayload) {
      const result = db.run(
        `INSERT INTO class_battles (initiator_class_id, target_class_id, status) VALUES (?, ?, 'pending')`,
        [input.initiator_class_id, input.target_class_id],
      );
      return Number(result.lastInsertRowid);
    },

    acceptBattle(battleId, startTime, endTime) {
      db.run(
        `UPDATE class_battles SET status = 'active', start_time = ?, end_time = ? WHERE id = ? AND status = 'pending'`,
        [startTime, endTime, battleId],
      );
    },

    rejectBattle(battleId) {
      db.run(`UPDATE class_battles SET status = 'rejected' WHERE id = ? AND status = 'pending'`, [battleId]);
    },

    endBattle(battleId, winnerClassId) {
      db.run(`UPDATE class_battles SET status = 'ended', winner_class_id = ? WHERE id = ? AND status = 'active'`, [
        winnerClassId || null,
        battleId,
      ]);
    },
  };
}
