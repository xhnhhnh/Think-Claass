/**
 * pet domain contracts.
 *
 * Moved from `src/shared/pet/contracts.ts` in P2 so the backend no longer imports
 * from the frontend source tree. Type-only: see guardrail G6.
 */

import type { ApiSuccess } from '@thinkclass/contracts';

export type PetElementType = 'fire' | 'water' | 'grass' | 'electric' | 'ice' | 'dragon' | 'normal';

export interface PetStageImages {
  custom_image?: string | null;
  image_stage1?: string | null;
  image_stage2?: string | null;
  image_stage3?: string | null;
  image_stage4?: string | null;
  image_stage5?: string | null;
  image_stage6?: string | null;
}

export interface PetDto extends PetStageImages {
  id: number;
  student_id: number;
  element_type: PetElementType | string;
  level: number;
  experience: number;
  attack_power: number;
  mood?: string | null;
  last_fed_at?: string | null;
  is_dead: boolean;
  has_parent_buff?: boolean;
}

export interface ClassPetStudentDto {
  student_id: number;
  student_name: string;
  has_pet: boolean;
  pet: PetDto | null;
}

export interface PetRecordDto {
  id: number;
  student_id: number;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

export interface PetPraiseDto {
  id: number;
  teacher_id: number;
  student_id: number;
  content: string;
  color?: string | null;
  created_at: string;
  student_name?: string;
}

export interface StudentPetDashboardDto {
  pet: PetDto | null;
  availablePoints: number;
  praises: PetPraiseDto[];
  records: PetRecordDto[];
}

export interface AdoptPetInput extends PetStageImages {
  elementType: PetElementType | string;
}

export interface UpdatePetInput extends PetStageImages {
  elementType?: PetElementType | string;
  element_type?: PetElementType | string;
  customImage?: string | null;
  level?: number;
  experience?: number;
  attack_power?: number;
}

export interface PetActionInput {
  actionType: string;
  cost: number;
  expGain: number;
  type?: string;
}

export interface PetActionResult {
  pet: PetDto;
  points: number;
}

export interface PetBattleInput {
  studentId: number;
  opponentId: number;
}

export interface PetBattleResult {
  isWin: boolean;
  isDraw: boolean;
  myRoll: number;
  opponentRoll: number;
  myTotalPower: number;
  opponentTotalPower: number;
}

export type StudentPetResponse = ApiSuccess<{ pet: PetDto | null; hasParentBuff: boolean }>;
export type StudentPetDashboardResponse = ApiSuccess<StudentPetDashboardDto>;
export type ClassPetsResponse = ApiSuccess<{ students: ClassPetStudentDto[] }>;
export type PetActionResponse = ApiSuccess<PetActionResult>;
export type PetBattleResponse = ApiSuccess<{ result: PetBattleResult }>;

// ---------------------------------------------------------------------------
// Cross-plugin port.
//
// Other domains (achievements, challenge, classroom dashboards) need to know about a
// student's pet without owning the `pets` table. They resolve this port.
//
// Reshaped in P4.3b.6, when the pet domain stopped being a reference implementation on
// invented tables (`name`, `element`, `stage`) and adopted the real one. The old shape
// described fields that do not exist in storage; the new one is a projection of `pets`.
// `applyAction` was dropped rather than adapted: mutation carries domain rules (death clock,
// level ceiling, point debit) and belongs behind the HTTP surface, not on a port. Nothing
// consumed either version, so the change is breaking in principle and free in practice.
// ---------------------------------------------------------------------------

export interface PetSnapshot {
  id: number;
  studentId: number;
  elementType: string;
  level: number;
  experience: number;
  attackPower: number;
  isDead: boolean;
}

/**
 * The three numbers the battle and world-boss domains need from a pet.
 *
 * `plugins/challenge` used to declare `data.reads: ["pets"]` and select `attack_power`
 * directly - a cross-plugin table read with no interface. This is that interface.
 */
export interface PetBattleProfile {
  attackPower: number;
  level: number;
  isDead: boolean;
}

export interface PetPort {
  getPetForStudent(studentId: number): Promise<PetSnapshot | null>;
  hasPet(studentId: number): Promise<boolean>;
  getBattleProfile(studentId: number): Promise<PetBattleProfile | null>;
  /**
   * Grow a pet by experience, using this domain's own level and attack-power rules.
   *
   * Added in P4.3b.10 for engagement's praise route, which used to `UPDATE pets SET experience,
   * level, attack_power, mood` **directly** - a cross-plugin write that `data.reads` could not even
   * describe, because it is a write.
   *
   * The growth formula stays here rather than being passed in: it is the pet domain's rule (level
   * only rises, ceiling 6, `Math.floor(experience * 0.1) || 10`), and a consumer that recomputed it
   * would be a second implementation of the thing this plugin owns. The consumer supplies only how
   * much experience and the mood to leave behind.
   *
   * Returns the pet after the change, or `null` when the student has none - the pre-migration code
   * skipped the update in that case rather than failing, and a praise must still be recorded.
   */
  grantPetExperience(input: {
    studentId: number;
    expGain: number;
    mood: string;
  }): Promise<PetSnapshot | null>;
}

