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
} from '@thinkclass/contracts/domains/pet';

interface AdoptPetMutationInput {
  type: 'adopt';
  elementType: string;
}

interface InteractPetMutationInput {
  type: 'interact';
  actionType: string;
  cost: number;
  expGain: number;
  actionLogType?: string;
}

export type StudentPetMutationInput = AdoptPetMutationInput | InteractPetMutationInput;
