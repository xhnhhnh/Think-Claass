import type {
  BankAccountDto,
  BankTransferInput,
  EconomyOverviewDto,
  PortfolioItemDto,
  StockDto,
  StockPayload,
  StockPricePayload,
  StockTradeInput,
} from '../../../src/shared/economy/contracts.js';

export interface EconomyStudentRow {
  id: number;
  class_id: number;
  total_points: number;
  available_points: number;
}

export interface EconomyRepository {
  transaction<T>(fn: () => T): T;
  getStudent(studentId: number): EconomyStudentRow | null;
  getOrCreateBankAccount(studentId: number): BankAccountDto;
  listStocks(classId: number): StockDto[];
  getStock(stockId: number): StockDto | null;
  listPortfolio(studentId: number): PortfolioItemDto[];
  updateStudentPoints(studentId: number, totalPoints: number, availablePoints: number): void;
  updateStudentAvailablePoints(studentId: number, availablePoints: number): void;
  updateBankDeposit(studentId: number, depositAmount: number): void;
  getHolding(studentId: number, stockId: number): { id: number; shares: number; average_buy_price: number } | null;
  upsertHolding(studentId: number, stockId: number, shares: number, averageBuyPrice: number): void;
  updateHoldingShares(holdingId: number, shares: number): void;
  insertRecord(studentId: number, type: string, amount: number, description: string): void;
  triggerInterest(): void;
  createStock(input: StockPayload): number;
  updateStock(stockId: number, input: Partial<StockPayload> | StockPricePayload): void;
  deleteStock(stockId: number): void;
}

export type {
  BankAccountDto,
  BankTransferInput,
  EconomyOverviewDto,
  PortfolioItemDto,
  StockDto,
  StockPayload,
  StockPricePayload,
  StockTradeInput,
};
