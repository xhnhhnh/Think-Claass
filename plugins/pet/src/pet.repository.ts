/**
 * Pet repository.
 *
 * Takes the plugin's namespaced `DbApi` rather than a raw connection, so every
 * statement is checked against the plugin's declared table ownership. The
 * repository has no idea whether it is talking to SQLite, and it cannot reach a
 * table the manifest did not claim.
 */

import type { PetElementType, PetSnapshot } from '@thinkclass/contracts/domains/pet';
import type { DbApi } from '@thinkclass/plugin-sdk';

export interface PetRow {
  id: number;
  student_id: number;
  name: string;
  element: string;
  level: number;
  experience: number;
  stage: number;
  created_at: string;
  updated_at: string;
}

export function toPetSnapshot(row: PetRow): PetSnapshot {
  return {
    id: row.id,
    studentId: row.student_id,
    name: row.name,
    level: row.level,
    element: row.element as PetElementType,
    stage: row.stage,
  };
}

export interface PetRepository {
  findByStudentId(studentId: number): PetRow | null;
  findById(id: number): PetRow | null;
  insert(input: { studentId: number; name: string; element: PetElementType }): PetRow;
  updateProgress(id: number, level: number, experience: number, stage: number): PetRow;
  logPraise(input: { petId: number; actorId: number; message: string }): void;
  countPraise(petId: number): number;
}

export function createPetRepository(db: DbApi, now: () => string = () => new Date().toISOString()): PetRepository {
  return {
    findByStudentId(studentId) {
      return db.get<PetRow>(`SELECT * FROM p_pet_pets WHERE student_id = ?`, [studentId]) ?? null;
    },

    findById(id) {
      return db.get<PetRow>(`SELECT * FROM p_pet_pets WHERE id = ?`, [id]) ?? null;
    },

    insert({ studentId, name, element }) {
      const timestamp = now();
      const result = db.run(
        `INSERT INTO p_pet_pets (student_id, name, element, level, experience, stage, created_at, updated_at)
         VALUES (?, ?, ?, 1, 0, 1, ?, ?)`,
        [studentId, name, element, timestamp, timestamp],
      );
      const row = db.get<PetRow>(`SELECT * FROM p_pet_pets WHERE id = ?`, [Number(result.lastInsertRowid)]);
      if (!row) throw new Error('pet insert succeeded but the row could not be read back');
      return row;
    },

    updateProgress(id, level, experience, stage) {
      db.run(`UPDATE p_pet_pets SET level = ?, experience = ?, stage = ?, updated_at = ? WHERE id = ?`, [
        level,
        experience,
        stage,
        now(),
        id,
      ]);
      const row = db.get<PetRow>(`SELECT * FROM p_pet_pets WHERE id = ?`, [id]);
      if (!row) throw new Error(`pet ${id} disappeared during update`);
      return row;
    },

    logPraise({ petId, actorId, message }) {
      db.run(`INSERT INTO p_pet_praise_log (pet_id, actor_id, message, created_at) VALUES (?, ?, ?, ?)`, [
        petId,
        actorId,
        message,
        now(),
      ]);
    },

    countPraise(petId) {
      const row = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM p_pet_praise_log WHERE pet_id = ?`, [petId]);
      return row?.n ?? 0;
    },
  };
}
