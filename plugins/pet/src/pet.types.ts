/**
 * Pet domain types.
 *
 * The DTOs come from `@thinkclass/contracts/domains/pet` - the same shapes the pre-plugin
 * `api/modules/pet` served and the deployed frontend parses. They are imported rather than
 * redeclared on purpose: `src/features/pet/types.ts` on the frontend reads the same file, so
 * a field cannot drift on one side of the wire.
 */

import type {
  AdoptPetInput,
  ClassPetStudentDto,
  PetActionInput,
  PetBattleInput,
  PetDto,
  PetPraiseDto,
  PetRecordDto,
  UpdatePetInput,
} from '@thinkclass/contracts/domains/pet';

/**
 * A `pets` row as stored: a `PetDto` minus the two fields that are computed per request
 * (`is_dead` from `last_fed_at`, `has_parent_buff` from `classes` + `parent_activity`).
 */
export type PetRow = Omit<PetDto, 'is_dead' | 'has_parent_buff'>;

/** A `praises` row; `student_name` is attached by the service from the classroom port. */
export interface PraiseRow {
  id: number;
  teacher_id: number;
  student_id: number;
  content: string;
  color?: string | null;
  created_at: string;
}

/**
 * The plugin's own storage.
 *
 * Only `pets` is owned here. `praises` and `parent_activity` appear as reads because the
 * legacy queries joined them, and neither has a port or an owning plugin yet - see the
 * `_reads_note` in plugin.json. Nothing in this interface writes a table it does not own;
 * `ctx.db` would refuse anyway.
 */
export interface PetRepository {
  getPet(studentId: number): PetRow | null;
  /** Pets of the given students, in one query. Empty input means "do not query". */
  listPetsFor(studentIds: number[]): PetRow[];
  /** Most experienced pets of the given students, `LIMIT` applied in SQL to keep the order. */
  listLeaderboardPets(studentIds: number[], limit: number): PetRow[];
  createPet(studentId: number, input: AdoptPetInput): number;
  upsertPet(studentId: number, input: UpdatePetInput): void;
  updatePetProgress(petId: number, experience: number, level: number, attackPower: number): void;
  addPetExperience(petId: number, expGain: number): void;
  /** Praises for a student, newest first. */
  listPraises(studentId: number): PraiseRow[];
  /** Whether `parent_activity` has a row for this student dated today. */
  hasTodayParentActivity(studentId: number): boolean;
}

export interface PetRandom {
  roll(maxInclusive: number): number;
}

export type { AdoptPetInput, ClassPetStudentDto, PetActionInput, PetBattleInput, PetPraiseDto, PetRecordDto, UpdatePetInput };
