import { ApiError } from '../../utils/asyncHandler.js';
import type { EconomyRepository } from './economy.types.js';

export class PrismaEconomyRepository implements EconomyRepository {
  private unavailable(): never {
    throw new ApiError(501, 'Prisma Economy repository is not wired yet');
  }

  transaction<T>(_fn: () => T): T { return this.unavailable(); }
  getStudent() { return this.unavailable(); }
  getOrCreateBankAccount() { return this.unavailable(); }
  listStocks() { return this.unavailable(); }
  getStock() { return this.unavailable(); }
  listPortfolio() { return this.unavailable(); }
  updateStudentPoints() { return this.unavailable(); }
  updateStudentAvailablePoints() { return this.unavailable(); }
  updateBankDeposit() { return this.unavailable(); }
  getHolding() { return this.unavailable(); }
  upsertHolding() { return this.unavailable(); }
  updateHoldingShares() { return this.unavailable(); }
  insertRecord() { return this.unavailable(); }
  triggerInterest() { return this.unavailable(); }
  createStock() { return this.unavailable(); }
  updateStock() { return this.unavailable(); }
  deleteStock() { return this.unavailable(); }
}
