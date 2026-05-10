import db from '../../db.js';
import type { DungeonRepository, DungeonRunRow } from './dungeon.types.js';

export class SqliteDungeonRepository implements DungeonRepository {
  transaction<T>(fn: () => T): T {
    return db.transaction(fn)();
  }

  getActiveRun(studentId: number) {
    return db.prepare("SELECT * FROM dungeon_runs WHERE student_id = ? AND status = 'active'").get(studentId) as DungeonRunRow | null;
  }

  getBestFloor(studentId: number) {
    const row = db.prepare('SELECT MAX(max_floor) as best_floor FROM dungeon_runs WHERE student_id = ?').get(studentId) as
      | { best_floor: number | null }
      | undefined;
    return row?.best_floor ?? 0;
  }

  endActiveRuns(studentId: number) {
    db.prepare("UPDATE dungeon_runs SET status = 'died' WHERE student_id = ? AND status = 'active'").run(studentId);
  }

  createRun(studentId: number) {
    const info = db
      .prepare(
        `
        INSERT INTO dungeon_runs (student_id, current_floor, max_floor, active_buffs, current_hp, max_hp, status)
        VALUES (?, 1, 1, '[]', 100, 100, 'active')
      `,
      )
      .run(studentId);
    return Number(info.lastInsertRowid);
  }

  updateRun(runId: number, input: { currentFloor: number; maxFloor: number; currentHp: number; activeBuffs: string[]; status: string }) {
    db.prepare(
      `
        UPDATE dungeon_runs
        SET current_floor = ?, max_floor = ?, current_hp = ?, active_buffs = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
    ).run(input.currentFloor, input.maxFloor, input.currentHp, JSON.stringify(input.activeBuffs), input.status, runId);
  }

  addStudentPoints(studentId: number, amount: number) {
    db.prepare('UPDATE students SET available_points = available_points + ? WHERE id = ?').run(amount, studentId);
  }

  insertRecord(studentId: number, type: string, amount: number, description: string) {
    db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(studentId, type, amount, description);
  }
}
