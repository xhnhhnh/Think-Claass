/**
 * Gacha domain types.
 *
 * The DTOs are re-exported from `@thinkclass/contracts` so the plugin and the
 * frontend share one definition; only what describes this plugin's own tables is
 * declared here.
 *
 * Two details are load-bearing for the HTTP contract, because the repository returns
 * raw rows and the controller passes them straight through:
 *
 *   - column names ARE the response field names (`cost_points`, `ssr_rate`,
 *     `instance_id`, `is_active`, ...) and the frontend reads them directly;
 *   - `listCollection` returns the union of `student_pets` and `pet_dictionary`
 *     columns (`pd.*`), so the shape of those two tables is the JSON contract too.
 *
 * The pre-migration interface also carried `getStudent`, `updateStudentAvailablePoints`
 * and `insertRecord`, i.e. direct access to `students` and `records`. Those are gone:
 * both tables belong to classroom and are reached through `classroom.public` in
 * gacha.service.ts. See gacha.repository.ts.
 */

import type {
  CreatePetDictionaryPayload,
  GachaDrawPayload,
  GachaPool,
  GachaRarity,
  PetCollectionItem,
  PetDictionaryEntry,
} from '@thinkclass/contracts/domains/gacha';

export interface GachaRepository {
  /** Synchronous better-sqlite3 transaction over this plugin's own tables. */
  transaction<T>(fn: () => T): T;
  listDictionary(): PetDictionaryEntry[];
  createDictionaryEntry(input: CreatePetDictionaryPayload): number;
  listPools(classId: number): GachaPool[];
  listActivePools(classId: number): GachaPool[];
  createDefaultPool(classId: number): void;
  getPool(poolId: number): GachaPool | null;
  listDictionaryByRarity(rarity: string): PetDictionaryEntry[];
  insertStudentPet(studentId: number, petDictId: number): void;
  listCollection(studentId: number): PetCollectionItem[];
  clearActivePet(studentId: number): void;
  setActivePet(studentId: number, instanceId: number): number;
}

export type {
  CreatePetDictionaryPayload,
  GachaDrawPayload,
  GachaPool,
  GachaRarity,
  PetCollectionItem,
  PetDictionaryEntry,
};
