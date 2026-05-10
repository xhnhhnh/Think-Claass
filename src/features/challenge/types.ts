import type { WorldBossPayload } from '@/shared/challenge/contracts';

export type {
  BossAttackInput,
  BossAttackResultDto,
  ChallengeAnswerInput,
  ChallengeAnswerResultDto,
  ChallengeAnswersInput,
  ChallengeQuestionDto,
  ChallengeQuestionType,
  ChallengeSubmissionDto,
  ChallengeSubmitInput,
  WorldBossDto,
  WorldBossPayload,
} from '@/shared/challenge/contracts';

export type WorldBossMutationInput =
  | { type: 'create'; data: WorldBossPayload }
  | { type: 'delete'; id: number };
