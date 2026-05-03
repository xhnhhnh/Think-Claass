import db, { decrypt } from '../../db.js';
import { ApiError } from '../../utils/asyncHandler.js';
import type { AdoptPetInput, PetDto, PetPraiseDto, PetRecordDto, UpdatePetInput } from '../../../src/shared/pet/contracts.js';
import { mapClassPetRow, mapPetRow } from './pet.mappers.js';
import type { ClassPetRow, PetRepository, PetRow, StudentPointsRow } from './pet.types.js';

function toPetRow(row: any): PetRow {
  return {
    id: row.id,
    student_id: row.student_id,
    element_type: row.element_type,
    custom_image: row.custom_image,
    image_stage1: row.image_stage1,
    image_stage2: row.image_stage2,
    image_stage3: row.image_stage3,
    image_stage4: row.image_stage4,
    image_stage5: row.image_stage5,
    image_stage6: row.image_stage6,
    level: row.level,
    experience: row.experience,
    attack_power: row.attack_power,
    mood: row.mood,
    last_fed_at: row.last_fed_at,
  };
}

export class SqlitePetRepository implements PetRepository {
  transaction<T>(fn: () => T): T {
    return db.transaction(fn)();
  }

  getStudent(studentId: number) {
    return db.prepare('SELECT id, class_id, name, available_points FROM students WHERE id = ?').get(studentId) as StudentPointsRow | null;
  }

  getPet(studentId: number) {
    const row = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(studentId);
    return row ? toPetRow(row) : null;
  }

  listClassPets(classId: number) {
    const rows = db
      .prepare(
        `
        SELECT 
          s.id as student_id,
          s.name as student_name,
          p.id as pet_id,
          p.element_type,
          p.custom_image,
          p.image_stage1,
          p.image_stage2,
          p.image_stage3,
          p.image_stage4,
          p.image_stage5,
          p.image_stage6,
          p.level,
          p.experience,
          p.attack_power,
          p.mood,
          p.last_fed_at
        FROM students s
        LEFT JOIN pets p ON s.id = p.student_id
        WHERE s.class_id = ?
        ORDER BY s.id ASC
      `,
      )
      .all(classId) as ClassPetRow[];

    return rows.map((row) => mapClassPetRow(row));
  }

  listClassmatePets(studentId: number, classId: number) {
    const rows = db
      .prepare(
        `
        SELECT p.*, s.name as student_name
        FROM pets p
        JOIN students s ON p.student_id = s.id
        WHERE s.class_id = ? AND s.id != ?
      `,
      )
      .all(classId, studentId) as Array<any & { student_name: string }>;

    return rows.map((row) => ({ ...(mapPetRow(toPetRow(row)) as PetDto), student_name: decrypt(row.student_name) }));
  }

  listLeaderboard(classId: number) {
    const rows = db
      .prepare(
        `
        SELECT p.*, s.name as student_name
        FROM pets p
        JOIN students s ON p.student_id = s.id
        WHERE s.class_id = ?
        ORDER BY p.level DESC, p.experience DESC
        LIMIT 10
      `,
      )
      .all(classId) as Array<any & { student_name: string }>;

    return rows.map((row) => ({ ...(mapPetRow(toPetRow(row)) as PetDto), student_name: decrypt(row.student_name) }));
  }

  listPraises(studentId: number) {
    return db
      .prepare(
        `
        SELECT p.*, s.name as student_name
        FROM praises p
        JOIN students s ON p.student_id = s.id
        WHERE p.student_id = ?
        ORDER BY p.created_at DESC
      `,
      )
      .all(studentId)
      .map((row: any) => ({
        ...row,
        student_name: decrypt(row.student_name),
      })) as PetPraiseDto[];
  }

  listRecords(studentId: number) {
    return db
      .prepare('SELECT * FROM records WHERE student_id = ? ORDER BY created_at DESC')
      .all(studentId) as PetRecordDto[];
  }

  hasParentBuff(studentId: number, classId: number) {
    const cls = db.prepare('SELECT enable_parent_buff FROM classes WHERE id = ?').get(classId) as { enable_parent_buff: number } | undefined;
    if (!cls || cls.enable_parent_buff !== 1) {
      return false;
    }

    return Boolean(
      db
        .prepare(
          `
          SELECT 1 FROM parent_activity
          WHERE student_id = ? AND last_active_date = DATE('now')
          LIMIT 1
        `,
        )
        .get(studentId),
    );
  }

  createPet(studentId: number, input: AdoptPetInput) {
    const result = db
      .prepare(
        `
        INSERT INTO pets (
          student_id, element_type, custom_image,
          image_stage1, image_stage2, image_stage3,
          image_stage4, image_stage5, image_stage6
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        studentId,
        input.elementType,
        input.custom_image ?? null,
        input.image_stage1 ?? null,
        input.image_stage2 ?? null,
        input.image_stage3 ?? null,
        input.image_stage4 ?? null,
        input.image_stage5 ?? null,
        input.image_stage6 ?? null,
      );

    return Number(result.lastInsertRowid);
  }

  upsertPet(studentId: number, input: UpdatePetInput) {
    const finalElementType = input.elementType ?? input.element_type;
    const finalCustomImage = input.customImage ?? input.custom_image;
    const existing = this.getPet(studentId);

    if (existing) {
      db.prepare(
        `
        UPDATE pets SET
          element_type = COALESCE(?, element_type),
          custom_image = ?,
          image_stage1 = ?,
          image_stage2 = ?,
          image_stage3 = ?,
          image_stage4 = ?,
          image_stage5 = ?,
          image_stage6 = ?,
          level = COALESCE(?, level),
          experience = COALESCE(?, experience),
          attack_power = COALESCE(?, attack_power)
        WHERE student_id = ?
      `,
      ).run(
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
      );
      return;
    }

    db.prepare(
      `
      INSERT INTO pets (
        student_id, element_type, custom_image,
        image_stage1, image_stage2, image_stage3,
        image_stage4, image_stage5, image_stage6,
        level, experience, attack_power
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
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
    );
  }

  updatePetProgress(petId: number, experience: number, level: number, attackPower: number) {
    db.prepare('UPDATE pets SET experience = ?, level = ?, attack_power = ?, last_fed_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      experience,
      level,
      attackPower,
      petId,
    );
  }

  touchPetFedAt(petId: number) {
    db.prepare('UPDATE pets SET last_fed_at = CURRENT_TIMESTAMP WHERE id = ?').run(petId);
  }

  deductStudentPoints(studentId: number, cost: number) {
    const student = this.getStudent(studentId);
    if (!student || student.available_points < cost) {
      throw new ApiError(400, 'Not enough points');
    }

    const nextPoints = student.available_points - cost;
    db.prepare('UPDATE students SET available_points = ? WHERE id = ?').run(nextPoints, studentId);
    return nextPoints;
  }

  insertRecord(studentId: number, type: string, amount: number, description: string) {
    db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(studentId, type, amount, description);
  }

  addPetExperience(petId: number, expGain: number) {
    db.prepare('UPDATE pets SET experience = experience + ? WHERE id = ?').run(expGain, petId);
  }
}

