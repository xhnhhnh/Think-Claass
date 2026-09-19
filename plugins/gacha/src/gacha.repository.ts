/**
 * Gacha repository.
 *
 * Takes the plugin's ownership-checked `DbApi` instead of the raw connection, so
 * every statement is validated against `data.adopted` in the manifest. The three
 * tables carry their legacy names (declared as `adopted`, not `tables`) because
 * renaming them would change the JSON the frontend reads - see gacha.types.ts.
 *
 * `students` and `records` are deliberately absent: the spendable balance and the
 * shared point ledger live behind `classroom.public`, because a second writer would
 * make classroom's ownership of those tables a lie. The pre-migration repository read
 * `students.available_points` and inserted into `records` here; both call sites moved
 * into the service, where the port is available.
 */

import type {
  CreatePetDictionaryPayload,
  GachaPool,
  PetCollectionItem,
  PetDictionaryEntry,
} from '@thinkclass/contracts/domains/gacha';
import type { DbApi } from '@thinkclass/plugin-sdk';

import type { GachaRepository } from './gacha.types.js';

export function createGachaRepository(db: DbApi): GachaRepository {
  return {
    transaction(fn) {
      return db.tx(() => fn());
    },

    listDictionary() {
      return db.query<PetDictionaryEntry>('SELECT * FROM pet_dictionary');
    },

    createDictionaryEntry(input: CreatePetDictionaryPayload) {
      const info = db.run(
        'INSERT INTO pet_dictionary (name, element, rarity, base_power, description) VALUES (?, ?, ?, ?, ?)',
        [input.name, input.element, input.rarity, input.base_power, input.description || ''],
      );
      return Number(info.lastInsertRowid);
    },

    listPools(classId) {
      return db.query<GachaPool>('SELECT * FROM gacha_pools WHERE class_id = ?', [classId]);
    },

    listActivePools(classId) {
      return db.query<GachaPool>('SELECT * FROM gacha_pools WHERE class_id = ? AND is_active = 1', [classId]);
    },

    createDefaultPool(classId) {
      db.run(
        `
          INSERT INTO gacha_pools (class_id, name, cost_points, ssr_rate, sr_rate, r_rate, n_rate)
          VALUES (?, '限定召唤: 星空之约', 100, 0.01, 0.1, 0.3, 0.59)
        `,
        [classId],
      );
    },

    getPool(poolId) {
      return db.get<GachaPool>('SELECT * FROM gacha_pools WHERE id = ?', [poolId]) ?? null;
    },

    listDictionaryByRarity(rarity) {
      return db.query<PetDictionaryEntry>(
        'SELECT id, name, rarity, element, base_power, description FROM pet_dictionary WHERE rarity = ?',
        [rarity],
      );
    },

    insertStudentPet(studentId, petDictId) {
      db.run('INSERT INTO student_pets (student_id, pet_dict_id) VALUES (?, ?)', [studentId, petDictId]);
    },

    listCollection(studentId) {
      return db.query<PetCollectionItem>(
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
        [studentId],
      );
    },

    clearActivePet(studentId) {
      db.run('UPDATE student_pets SET is_active = 0 WHERE student_id = ?', [studentId]);
    },

    setActivePet(studentId, instanceId) {
      const info = db.run('UPDATE student_pets SET is_active = 1 WHERE student_id = ? AND id = ?', [
        studentId,
        instanceId,
      ]);
      return Number(info.changes);
    },
  };
}
