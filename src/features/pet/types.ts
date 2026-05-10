export type {
  AdoptPetInput,
  ClassPetStudentDto,
  PetActionInput,
  PetActionResult,
  PetBattleInput,
  PetBattleResult,
  PetDto,
  PetElementType,
  PetPraiseDto,
  PetRecordDto,
  PetStageImages,
  StudentPetDashboardDto,
  UpdatePetInput,
} from '@/shared/pet/contracts';

export interface AdoptPetMutationInput {
  type: 'adopt';
  elementType: string;
  customImage?: string | null;
}

export interface InteractPetMutationInput {
  type: 'interact';
  actionType: string;
  cost: number;
  expGain: number;
  actionLogType?: string;
}

export interface UpdatePetMutationInput {
  type: 'update';
  data: Record<string, unknown>;
}

export type StudentPetMutationInput = AdoptPetMutationInput | InteractPetMutationInput | UpdatePetMutationInput;
