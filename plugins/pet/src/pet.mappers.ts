/**
 * Row -> DTO mappers.
 *
 * Moved from `api/modules/pet/pet.mappers.ts`, with one change: the legacy version called
 * `decrypt()` from `api/db.ts` on `students.name`. A plugin cannot import the application's
 * cipher, and should not hold the key, so names now arrive already decrypted from
 * `classroom.public` (`KernelConfig.decryptName`, injected by the host). Every other rule -
 * the three-day death clock, the level formula, the field set - is unchanged.
 */

import type { ClassPetStudentDto, PetDto } from '@thinkclass/contracts/domains/pet';

import type { PetRow } from './pet.types.js';

/**
 * A pet that has not been fed for three days is dead.
 *
 * `last_fed_at` is written by SQLite's `CURRENT_TIMESTAMP`, which is UTC but formatted
 * without a zone, so the `Z` is appended before parsing. Dropping it would shift every
 * timestamp by the local offset and make the death clock wrong by hours.
 */
export function isPetDead(pet: Pick<PetDto, 'last_fed_at'> | null, now = Date.now()): boolean {
  if (!pet?.last_fed_at) return false;
  const lastTime = new Date(`${pet.last_fed_at}Z`).getTime();
  return now - lastTime > 3 * 24 * 60 * 60 * 1000;
}

export function mapPetRow(row: PetRow | null, now = Date.now()): PetDto | null {
  if (!row) return null;
  return { ...row, is_dead: isPetDead(row, now) };
}

/**
 * One row of the class pet list: the student, and their pet if they have one.
 *
 * The pre-plugin query was a `LEFT JOIN`, so a student without a pet is present with
 * `pet: null` and `has_pet: false` - not omitted. The service reproduces that by iterating
 * the class roster from the port and looking each student up.
 */
export function mapClassPetStudent(
  student: { id: number; name: string },
  pet: PetRow | null,
  now = Date.now(),
): ClassPetStudentDto {
  return {
    student_id: student.id,
    student_name: student.name,
    has_pet: Boolean(pet),
    pet: mapPetRow(pet, now),
  };
}

/**
 * Level and attack power from accumulated experience.
 *
 * Two rules that look odd and are load-bearing:
 *
 *   * the level can only go UP (`calculatedLevel > currentLevel`) and never past 6, so
 *     spending experience on an action cannot demote a pet;
 *   * `Math.floor(experience * 0.1) || 10` keeps the minimum attack power at 10, because
 *     `0 || 10` is 10 - the `||` is doing arithmetic, not defaulting a missing value.
 */
export function getNextPetStats(currentExperience: number, currentLevel: number, expGain: number) {
  const experience = currentExperience + expGain;
  const calculatedLevel = Math.floor(experience / 100) + 1;
  const level = calculatedLevel > currentLevel && calculatedLevel <= 6 ? calculatedLevel : currentLevel;
  const attackPower = Math.floor(experience * 0.1) || 10;

  return { experience, level, attackPower };
}
