import { decrypt } from '../../db.js';
import type { ClassPetStudentDto, PetDto } from '../../../src/shared/pet/contracts.js';
import type { ClassPetRow, PetRow } from './pet.types.js';

export function isPetDead(pet: Pick<PetDto, 'last_fed_at'> | null, now = Date.now()) {
  if (!pet?.last_fed_at) return false;
  const lastTime = new Date(`${pet.last_fed_at}Z`).getTime();
  return now - lastTime > 3 * 24 * 60 * 60 * 1000;
}

export function mapPetRow(row: PetRow | null, now = Date.now()): PetDto | null {
  if (!row) return null;
  return {
    ...row,
    is_dead: isPetDead(row, now),
  };
}

export function mapClassPetRow(row: ClassPetRow, now = Date.now()): ClassPetStudentDto {
  const pet =
    row.pet_id === null
      ? null
      : mapPetRow(
          {
            id: row.pet_id,
            student_id: row.student_id,
            element_type: row.element_type ?? 'normal',
            custom_image: row.custom_image,
            image_stage1: row.image_stage1,
            image_stage2: row.image_stage2,
            image_stage3: row.image_stage3,
            image_stage4: row.image_stage4,
            image_stage5: row.image_stage5,
            image_stage6: row.image_stage6,
            level: row.level ?? 1,
            experience: row.experience ?? 0,
            attack_power: row.attack_power ?? 10,
            mood: row.mood,
            last_fed_at: row.last_fed_at,
          },
          now,
        );

  return {
    student_id: row.student_id,
    student_name: decrypt(row.student_name),
    has_pet: Boolean(pet),
    pet,
  };
}

export function getNextPetStats(currentExperience: number, currentLevel: number, expGain: number) {
  const experience = currentExperience + expGain;
  const calculatedLevel = Math.floor(experience / 100) + 1;
  const level = calculatedLevel > currentLevel && calculatedLevel <= 6 ? calculatedLevel : currentLevel;
  const attackPower = Math.floor(experience * 0.1) || 10;

  return { experience, level, attackPower };
}

