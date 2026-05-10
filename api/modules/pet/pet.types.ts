import type {
  AdoptPetInput,
  ClassPetStudentDto,
  PetActionInput,
  PetBattleInput,
  PetDto,
  PetPraiseDto,
  PetRecordDto,
  UpdatePetInput,
} from '../../../src/shared/pet/contracts.js';

export type PetRow = Omit<PetDto, 'is_dead' | 'has_parent_buff'>;

export interface StudentPointsRow {
  id: number;
  class_id: number;
  name: string;
  available_points: number;
}

export interface ClassPetRow {
  student_id: number;
  student_name: string;
  pet_id: number | null;
  element_type: string | null;
  custom_image: string | null;
  image_stage1: string | null;
  image_stage2: string | null;
  image_stage3: string | null;
  image_stage4: string | null;
  image_stage5: string | null;
  image_stage6: string | null;
  level: number | null;
  experience: number | null;
  attack_power: number | null;
  mood: string | null;
  last_fed_at: string | null;
}

export interface PetRepository {
  transaction<T>(fn: () => T): T;
  getStudent(studentId: number): StudentPointsRow | null;
  getPet(studentId: number): PetRow | null;
  listClassPets(classId: number): ClassPetStudentDto[];
  listClassmatePets(studentId: number, classId: number): Array<PetDto & { student_name: string }>;
  listLeaderboard(classId: number): Array<PetDto & { student_name: string }>;
  listPraises(studentId: number): PetPraiseDto[];
  listRecords(studentId: number): PetRecordDto[];
  hasParentBuff(studentId: number, classId: number): boolean;
  createPet(studentId: number, input: AdoptPetInput): number;
  upsertPet(studentId: number, input: UpdatePetInput): void;
  updatePetProgress(petId: number, experience: number, level: number, attackPower: number): void;
  touchPetFedAt(petId: number): void;
  deductStudentPoints(studentId: number, cost: number): number;
  insertRecord(studentId: number, type: string, amount: number, description: string): void;
  addPetExperience(petId: number, expGain: number): void;
}

export interface PetRandom {
  roll(maxInclusive: number): number;
}

export type { AdoptPetInput, PetActionInput, PetBattleInput, UpdatePetInput };

