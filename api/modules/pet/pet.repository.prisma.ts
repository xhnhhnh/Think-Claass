import { ApiError } from '../../utils/asyncHandler.js';
import type { PetRepository } from './pet.types.js';

export class PrismaPetRepository implements PetRepository {
  private unavailable(): never {
    throw new ApiError(501, 'Prisma Pet repository is not wired yet');
  }

  transaction<T>(_fn: () => T): T { return this.unavailable(); }
  getStudent() { return this.unavailable(); }
  getPet() { return this.unavailable(); }
  listClassPets() { return this.unavailable(); }
  listClassmatePets() { return this.unavailable(); }
  listLeaderboard() { return this.unavailable(); }
  listPraises() { return this.unavailable(); }
  listRecords() { return this.unavailable(); }
  hasParentBuff() { return this.unavailable(); }
  createPet() { return this.unavailable(); }
  upsertPet() { return this.unavailable(); }
  updatePetProgress() { return this.unavailable(); }
  touchPetFedAt() { return this.unavailable(); }
  deductStudentPoints() { return this.unavailable(); }
  insertRecord() { return this.unavailable(); }
  addPetExperience() { return this.unavailable(); }
}

