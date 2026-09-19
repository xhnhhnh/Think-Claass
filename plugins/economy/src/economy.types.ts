/**
 * Economy domain types.
 *
 * The DTOs are re-exported from `@thinkclass/contracts` so the plugin and any future
 * consumer share one definition; only what describes this plugin's own tables is
 * declared here.
 *
 * Two details are load-bearing for the HTTP contract, because the repository returns
 * raw rows and the controller passes them straight through:
 *
 *   - column names ARE the response field names (`deposit_amount`, `interest_rate`,
 *     `average_buy_price`, ...) and the frontend reads them directly;
 *   - `trend_history` is a JSON *string*, not an array, and the client parses it.
 *
 * So `SELECT *` must keep returning exactly these columns - adding a column would
 * leak into the response.
 */

import type {
  BankAccountDto,
  BankTransferInput,
  EconomyOverviewDto,
  PortfolioItemDto,
  StockDto,
  StockPayload,
  StockPricePayload,
  StockTradeInput,
} from '@thinkclass/contracts/domains/economy';

export interface EconomyHoldingRow {
  id: number;
  shares: number;
  average_buy_price: number;
}

export interface EconomyRepository {
  /** Read-and-insert: three GET endpoints create an account on first read. */
  getOrCreateBankAccount(studentId: number): BankAccountDto;
  listStocks(classId: number): StockDto[];
  getStock(stockId: number): StockDto | null;
  listPortfolio(studentId: number): PortfolioItemDto[];
  updateBankDeposit(studentId: number, depositAmount: number): void;
  getHolding(studentId: number, stockId: number): EconomyHoldingRow | null;
  upsertHolding(studentId: number, stockId: number, shares: number, averageBuyPrice: number): void;
  /**
   * Remove a holding row.
   *
   * Needed for compensation: when a purchase is rolled back because the credit
   * transfer was refused, a brand-new holding must vanish rather than be left at
   * `shares = 0`. The original code was one transaction, so a rollback removed the row
   * entirely; a zero-share row would be new debris that did not exist before.
   */
  deleteHolding(studentId: number, stockId: number): void;
  updateHoldingShares(holdingId: number, shares: number): void;
  /** Global sweep over every account with a positive balance. */
  triggerInterest(): void;
  createStock(input: StockPayload): number;
  updateStock(stockId: number, input: Partial<StockPayload> | StockPricePayload): void;
  /** Deletes holdings and the stock together; must stay one transaction. */
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
