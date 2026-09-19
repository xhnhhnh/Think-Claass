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
// Other domains (achievements, battles, classroom dashboards) need to know whether
// a student has a pet without owning the pet tables. They resolve this port.
// ---------------------------------------------------------------------------

export interface PetSnapshot {
  id: number;
  studentId: number;
  name: string;
  level: number;
  element: PetElementType;
  stage: number;
}

export interface PetPort {
  getPetForStudent(studentId: number): Promise<PetSnapshot | null>;
  hasPet(studentId: number): Promise<boolean>;
  /** Feed / play / train; returns the resulting state. */
  applyAction(input: {
    studentId: number;
    action: 'feed' | 'play' | 'train';
    actorId: number;
  }): Promise<{ pet: PetSnapshot; experienceGained: number; leveledUp: boolean }>;
}

