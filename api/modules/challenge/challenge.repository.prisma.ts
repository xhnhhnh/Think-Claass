import { ApiError } from '../../utils/asyncHandler.js';
import type { ChallengeRepository } from './challenge.types.js';

export class PrismaChallengeRepository implements ChallengeRepository {
  private unavailable(): never {
    throw new ApiError(501, 'Prisma Challenge repository is not wired yet');
  }

  transaction<T>(_fn: () => T): T { return this.unavailable(); }
  listQuestions() { return this.unavailable(); }
  getQuestion() { return this.unavailable(); }
  getStudent() { return this.unavailable(); }
  addStudentPoints() { return this.unavailable(); }
  insertRecord() { return this.unavailable(); }
  insertChallengeRecord() { return this.unavailable(); }
  listBosses() { return this.unavailable(); }
  getActiveBoss() { return this.unavailable(); }
  getBoss() { return this.unavailable(); }
  createBoss() { return this.unavailable(); }
  updateBossHp() { return this.unavailable(); }
  deleteBoss() { return this.unavailable(); }
  getPetAttackPower() { return this.unavailable(); }
  listStudentsInClass() { return this.unavailable(); }
}
