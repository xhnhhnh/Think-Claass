import db from '../../db.js';
import type { BattleClassSummary, BattlesRepository, ClassBattle, InitiateBattlePayload } from './battles.types.js';

export class SqliteBattlesRepository implements BattlesRepository {
  listBattles(classId: number) {
    return db
      .prepare(
        `
      SELECT cb.*,
             c1.name as initiator_class_name,
             c2.name as target_class_name
      FROM class_battles cb
      JOIN classes c1 ON cb.initiator_class_id = c1.id
      JOIN classes c2 ON cb.target_class_id = c2.id
      WHERE cb.initiator_class_id = ? OR cb.target_class_id = ?
      ORDER BY cb.id DESC
    `,
      )
      .all(classId, classId) as ClassBattle[];
  }

  getBattle(battleId: number) {
    return db
      .prepare(
        `
      SELECT cb.*,
             c1.name as initiator_class_name,
             c2.name as target_class_name
      FROM class_battles cb
      JOIN classes c1 ON cb.initiator_class_id = c1.id
      JOIN classes c2 ON cb.target_class_id = c2.id
      WHERE cb.id = ?
    `,
      )
      .get(battleId) as ClassBattle | null;
  }

  findActiveBattleForClass(classId: number) {
    return db
      .prepare(
        `
      SELECT * FROM class_battles
      WHERE status IN ('pending', 'active')
      AND (initiator_class_id = ? OR target_class_id = ?)
    `,
      )
      .get(classId, classId) as ClassBattle | null;
  }

  createBattle(input: InitiateBattlePayload) {
    const info = db
      .prepare(
        `
      INSERT INTO class_battles (initiator_class_id, target_class_id, status)
      VALUES (?, ?, 'pending')
    `,
      )
      .run(input.initiator_class_id, input.target_class_id);
    return Number(info.lastInsertRowid);
  }

  acceptBattle(battleId: number, startTime: string, endTime: string) {
    db.prepare("UPDATE class_battles SET status = 'active', start_time = ?, end_time = ? WHERE id = ? AND status = 'pending'").run(
      startTime,
      endTime,
      battleId,
    );
  }

  rejectBattle(battleId: number) {
    db.prepare("UPDATE class_battles SET status = 'rejected' WHERE id = ? AND status = 'pending'").run(battleId);
  }

  endBattle(battleId: number, winnerClassId?: number | null) {
    db.prepare("UPDATE class_battles SET status = 'ended', winner_class_id = ? WHERE id = ? AND status = 'active'").run(winnerClassId || null, battleId);
  }

  sumPointsAfter(classId: number, startTime: string) {
    const row = db
      .prepare(
        `
        SELECT SUM(amount) as total FROM records
        JOIN students s ON records.student_id = s.id
        WHERE s.class_id = ? AND records.created_at >= ? AND type = 'ADD_POINTS'
      `,
      )
      .get(classId, startTime) as { total: number | null } | undefined;
    return row?.total ?? 0;
  }

  searchClasses(query: string | undefined, excludeClassId: number) {
    if (query) {
      return db.prepare('SELECT id, name FROM classes WHERE name LIKE ? AND id != ?').all(`%${query}%`, excludeClassId) as BattleClassSummary[];
    }
    return db.prepare('SELECT id, name FROM classes WHERE id != ? LIMIT 10').all(excludeClassId) as BattleClassSummary[];
  }
}
