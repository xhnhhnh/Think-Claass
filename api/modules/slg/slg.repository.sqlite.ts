import db from '../../db.js';
import type { ClassResources, CreateTerritoryPayload, SlgRepository, SlgStudentRow, Territory } from './slg.types.js';

export class SqliteSlgRepository implements SlgRepository {
  transaction<T>(fn: () => T): T {
    return db.transaction(fn)();
  }

  listTerritories(classId: number) {
    return db.prepare('SELECT * FROM territories WHERE class_id = ?').all(classId) as Territory[];
  }

  getOrCreateResources(classId: number) {
    db.prepare('INSERT OR IGNORE INTO class_resources (class_id) VALUES (?)').run(classId);
    return db.prepare('SELECT * FROM class_resources WHERE class_id = ?').get(classId) as ClassResources;
  }

  getStudent(studentId: number) {
    return db.prepare('SELECT available_points FROM students WHERE id = ?').get(studentId) as SlgStudentRow | null;
  }

  getTerritory(territoryId: number) {
    return db.prepare('SELECT * FROM territories WHERE id = ?').get(territoryId) as Territory | null;
  }

  updateStudentAvailablePoints(studentId: number, amount: number) {
    db.prepare('UPDATE students SET available_points = ? WHERE id = ?').run(amount, studentId);
  }

  insertRecord(studentId: number, type: string, amount: number, description: string) {
    db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(studentId, type, amount, description);
  }

  updateTerritoryContribution(territoryId: number, contribution: number, status: string) {
    db.prepare('UPDATE territories SET current_contribution = ?, status = ? WHERE id = ?').run(contribution, status, territoryId);
  }

  createTerritory(input: Required<CreateTerritoryPayload>) {
    const info = db
      .prepare(
        `
      INSERT INTO territories (class_id, name, type, cost_to_unlock, x_pos, y_pos)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(input.class_id, input.name, input.type, input.cost_to_unlock, input.x_pos, input.y_pos);
    return Number(info.lastInsertRowid);
  }

  listOwnedTerritoryYields(classId: number) {
    return db.prepare("SELECT type, level FROM territories WHERE class_id = ? AND status = 'owned'").all(classId) as Array<Pick<Territory, 'type' | 'level'>>;
  }

  addResources(classId: number, yieldInput: Omit<ClassResources, 'id' | 'class_id'>) {
    db.prepare(
      `
      UPDATE class_resources
      SET wood = wood + ?, stone = stone + ?, magic_dust = magic_dust + ?, gold = gold + ?
      WHERE class_id = ?
    `,
    ).run(yieldInput.wood, yieldInput.stone, yieldInput.magic_dust, yieldInput.gold, classId);
  }
}
