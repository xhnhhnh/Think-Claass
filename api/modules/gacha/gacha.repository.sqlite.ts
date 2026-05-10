import db from '../../db.js';
import type { CreatePetDictionaryPayload, GachaPool, GachaRepository, GachaStudentRow, PetCollectionItem, PetDictionaryEntry } from './gacha.types.js';

export class SqliteGachaRepository implements GachaRepository {
  transaction<T>(fn: () => T): T {
    return db.transaction(fn)();
  }

  listDictionary() {
    return db.prepare('SELECT * FROM pet_dictionary').all() as PetDictionaryEntry[];
  }

  createDictionaryEntry(input: CreatePetDictionaryPayload) {
    const info = db
      .prepare('INSERT INTO pet_dictionary (name, element, rarity, base_power, description) VALUES (?, ?, ?, ?, ?)')
      .run(input.name, input.element, input.rarity, input.base_power, input.description || '');
    return Number(info.lastInsertRowid);
  }

  listPools(classId: number) {
    return db.prepare('SELECT * FROM gacha_pools WHERE class_id = ?').all(classId) as GachaPool[];
  }

  listActivePools(classId: number) {
    return db.prepare('SELECT * FROM gacha_pools WHERE class_id = ? AND is_active = 1').all(classId) as GachaPool[];
  }

  createDefaultPool(classId: number) {
    db.prepare(
      `
        INSERT INTO gacha_pools (class_id, name, cost_points, ssr_rate, sr_rate, r_rate, n_rate)
        VALUES (?, '限定召唤: 星空之约', 100, 0.01, 0.1, 0.3, 0.59)
      `,
    ).run(classId);
  }

  getStudent(studentId: number) {
    return db.prepare('SELECT available_points FROM students WHERE id = ?').get(studentId) as GachaStudentRow | null;
  }

  getPool(poolId: number) {
    return db.prepare('SELECT * FROM gacha_pools WHERE id = ?').get(poolId) as GachaPool | null;
  }

  updateStudentAvailablePoints(studentId: number, amount: number) {
    db.prepare('UPDATE students SET available_points = ? WHERE id = ?').run(amount, studentId);
  }

  insertRecord(studentId: number, type: string, amount: number, description: string) {
    db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(studentId, type, amount, description);
  }

  listDictionaryByRarity(rarity: string) {
    return db.prepare('SELECT id, name, rarity, element, base_power, description FROM pet_dictionary WHERE rarity = ?').all(rarity) as PetDictionaryEntry[];
  }

  insertStudentPet(studentId: number, petDictId: number) {
    db.prepare('INSERT INTO student_pets (student_id, pet_dict_id) VALUES (?, ?)').run(studentId, petDictId);
  }

  listCollection(studentId: number) {
    return db
      .prepare(
        `
        SELECT sp.id as instance_id, sp.level, sp.experience, sp.is_active,
               pd.*
        FROM student_pets sp
        JOIN pet_dictionary pd ON sp.pet_dict_id = pd.id
        WHERE sp.student_id = ?
        ORDER BY
          CASE pd.rarity
            WHEN 'SSR' THEN 1
            WHEN 'SR' THEN 2
            WHEN 'R' THEN 3
            ELSE 4
          END,
          sp.level DESC
      `,
      )
      .all(studentId) as PetCollectionItem[];
  }

  clearActivePet(studentId: number) {
    db.prepare('UPDATE student_pets SET is_active = 0 WHERE student_id = ?').run(studentId);
  }

  setActivePet(studentId: number, instanceId: number) {
    const info = db.prepare('UPDATE student_pets SET is_active = 1 WHERE student_id = ? AND id = ?').run(studentId, instanceId);
    return Number(info.changes);
  }
}
