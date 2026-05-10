import type {
  CreatePetDictionaryPayload,
  GachaDrawPayload,
  GachaPool,
  GachaRarity,
  PetCollectionItem,
  PetDictionaryEntry,
} from '../../../src/shared/gacha/contracts.js';

export interface GachaStudentRow {
  available_points: number;
}

export interface GachaRepository {
  transaction<T>(fn: () => T): T;
  listDictionary(): PetDictionaryEntry[];
  createDictionaryEntry(input: CreatePetDictionaryPayload): number;
  listPools(classId: number): GachaPool[];
  listActivePools(classId: number): GachaPool[];
  createDefaultPool(classId: number): void;
  getStudent(studentId: number): GachaStudentRow | null;
  getPool(poolId: number): GachaPool | null;
  updateStudentAvailablePoints(studentId: number, amount: number): void;
  insertRecord(studentId: number, type: string, amount: number, description: string): void;
  listDictionaryByRarity(rarity: string): PetDictionaryEntry[];
  insertStudentPet(studentId: number, petDictId: number): void;
  listCollection(studentId: number): PetCollectionItem[];
  clearActivePet(studentId: number): void;
  setActivePet(studentId: number, instanceId: number): number;
}

export type { CreatePetDictionaryPayload, GachaDrawPayload, GachaPool, GachaRarity, PetCollectionItem, PetDictionaryEntry };
