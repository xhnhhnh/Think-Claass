/**
 * Pet repository.
 *
 * Takes the plugin's namespaced `DbApi` rather than a raw connection, so every statement is
 * checked against the plugin's declared data ownership. `pets` is *adopted* (it still carries
 * its legacy name; P7 renames it to `p_pet_pets`), so `ctx.db` allows reads and writes on it.
 * `praises` and `parent_activity` are declared reads: a write to either is refused at the call
 * site, which is exactly what the pre-plugin code would have done silently through Prisma or
 * the shared connection.
 *
 * The legacy repository also owned `students` queries (points, names) and the `records`
 * ledger append. Those are not here: `students` and `records` belong to the classroom plugin,
 * so they go through `classroom.public` in the service instead.
 */

import type { AdoptPetInput, UpdatePetInput } from '@thinkclass/contracts/domains/pet';
import type { DbApi } from '@thinkclass/plugin-sdk';

import type { PetRepository, PetRow, PraiseRow } from './pet.types.js';

/** Explicit column list: `SELECT *` would silently start returning columns added later. */
const PET_COLUMNS = `
  id, student_id, element_type, custom_image,
  image_stage1, image_stage2, image_stage3, image_stage4, image_stage5, image_stage6,
  level, experience, attack_power, mood, last_fed_at
`;

export function createPetRepository(db: DbApi): PetRepository {
  return {
    getPet(studentId) {
      return db.get<PetRow>(`SELECT ${PET_COLUMNS} FROM pets WHERE student_id = ?`, [studentId]) ?? null;
    },

    listPetsFor(studentIds) {
      if (studentIds.length === 0) return [];
      const placeholders = studentIds.map(() => '?').join(', ');
      return db.query<PetRow>(`SELECT ${PET_COLUMNS} FROM pets WHERE student_id IN (${placeholders})`, studentIds);
    },

    listLeaderboardPets(studentIds, limit) {
      if (studentIds.length === 0) return [];
      const placeholders = studentIds.map(() => '?').join(', ');
      // The ORDER BY and LIMIT stay in SQL, exactly as the pre-plugin JOIN had them: sorting
      // the same rows in JavaScript would be equal for distinct values and arbitrary for ties,
      // and the class leaderboard is full of ties.
      return db.query<PetRow>(
        `SELECT ${PET_COLUMNS} FROM pets WHERE student_id IN (${placeholders})
          ORDER BY level DESC, experience DESC LIMIT ?`,
        [...studentIds, limit],
      );
    },

    createPet(studentId, input: AdoptPetInput) {
      const result = db.run(
        `INSERT INTO pets (
           student_id, element_type, custom_image,
           image_stage1, image_stage2, image_stage3,
           image_stage4, image_stage5, image_stage6
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          studentId,
          input.elementType,
          input.custom_image ?? null,
          input.image_stage1 ?? null,
          input.image_stage2 ?? null,
          input.image_stage3 ?? null,
          input.image_stage4 ?? null,
          input.image_stage5 ?? null,
          input.image_stage6 ?? null,
        ],
      );

      return Number(result.lastInsertRowid);
    },

    upsertPet(studentId, input: UpdatePetInput) {
      const finalElementType = input.elementType ?? input.element_type;
      const finalCustomImage = input.customImage ?? input.custom_image;
      const existing = this.getPet(studentId);

      if (existing) {
        // `COALESCE(?, column)` is what makes a partial update partial: level, experience and
        // attack_power keep their stored value when the body omits them. The artwork columns
        // do NOT coalesce - they are overwritten, including with NULL, which is the legacy
        // behaviour this route is pinned to.
        db.run(
          `UPDATE pets SET
             element_type = COALESCE(?, element_type),
             custom_image = ?,
             image_stage1 = ?, image_stage2 = ?, image_stage3 = ?,
             image_stage4 = ?, image_stage5 = ?, image_stage6 = ?,
             level = COALESCE(?, level),
             experience = COALESCE(?, experience),
             attack_power = COALESCE(?, attack_power)
           WHERE student_id = ?`,
          [
            finalElementType ?? null,
            finalCustomImage ?? null,
            input.image_stage1 ?? null,
            input.image_stage2 ?? null,
            input.image_stage3 ?? null,
            input.image_stage4 ?? null,
            input.image_stage5 ?? null,
            input.image_stage6 ?? null,
            input.level ?? null,
            input.experience ?? null,
            input.attack_power ?? null,
            studentId,
          ],
        );
        return;
      }

      db.run(
        `INSERT INTO pets (
           student_id, element_type, custom_image,
           image_stage1, image_stage2, image_stage3,
           image_stage4, image_stage5, image_stage6,
           level, experience, attack_power
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          studentId,
          finalElementType || 'normal',
          finalCustomImage ?? null,
          input.image_stage1 ?? null,
          input.image_stage2 ?? null,
          input.image_stage3 ?? null,
          input.image_stage4 ?? null,
          input.image_stage5 ?? null,
          input.image_stage6 ?? null,
          input.level ?? 1,
          input.experience ?? 0,
          input.attack_power ?? 10,
        ],
      );
    },

    updatePetProgress(petId, experience, level, attackPower) {
      db.run(`UPDATE pets SET experience = ?, level = ?, attack_power = ?, last_fed_at = CURRENT_TIMESTAMP WHERE id = ?`, [
        experience,
        level,
        attackPower,
        petId,
      ]);
    },

    addPetExperience(petId, expGain) {
      db.run(`UPDATE pets SET experience = experience + ? WHERE id = ?`, [expGain, petId]);
    },

    listPraises(studentId) {
      // No JOIN: the legacy query joined `students` only to decrypt the name, which the
      // classroom port does now. A missing student therefore drops the rows, matching the
      // INNER JOIN it replaces - the service filters them out.
      return db.query<PraiseRow>(
        `SELECT id, teacher_id, student_id, content, color, created_at
           FROM praises WHERE student_id = ? ORDER BY created_at DESC`,
        [studentId],
      );
    },

    hasTodayParentActivity(studentId) {
      // `last_active_date` (not `created_at`): it is the column the parent-login path writes,
      // and the pet domain's "parent buff" has always meant "a parent was active today".
      // `parent_activity` reaches both compositions' schema through
      // `0000c_legacy_compat_columns` - before that migration the kernel composition did not
      // have the column at all, which this query would have reported as a 500.
      const row = db.get<{ present: number }>(
        `SELECT 1 AS present FROM parent_activity
          WHERE student_id = ? AND last_active_date = DATE('now') LIMIT 1`,
        [studentId],
      );
      return Boolean(row);
    },
  };
}
