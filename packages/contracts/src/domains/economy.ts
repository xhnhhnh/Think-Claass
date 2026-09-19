/**
 * economy domain contracts.
 *
 * Moved from `src/shared/economy/contracts.ts` in P2 so the backend no longer imports
 * from the frontend source tree. Type-only: see guardrail G6.
 */

import type { ApiSuccess } from '@thinkclass/contracts';

export interface BankAccountDto {
  student_id: number;
  deposit_amount: number;
  interest_rate: number;
  last_interest_date: string | null;
  created_at?: string;
}

export interface StockDto {
  id: number;
  class_id: number;
  name: string;
  symbol: string;
  current_price: number;
  trend_history: string | null;
  volatility?: number;
  created_at?: string;
}

export interface PortfolioItemDto {
  id: number;
  student_id: number;
  stock_id: number;
  shares: number;
  average_buy_price: number;
  name: string;
  symbol: string;
  current_price: number;
}

export interface EconomyOverviewDto {
  bank: BankAccountDto;
  stocks: StockDto[];
  portfolio: PortfolioItemDto[];
}

export interface BankTransferInput {
  amount: number;
}

export interface StockTradeInput {
  stockId: number;
  shares: number;
}

export interface StockPayload {
  class_id: number;
  name: string;
  symbol: string;
  current_price: number;
}

export interface StockPricePayload {
  new_price: number;
}

export type EconomyOverviewResponse = ApiSuccess<EconomyOverviewDto>;
export type BankAccountResponse = ApiSuccess<{ account: BankAccountDto }>;
export type StocksResponse = ApiSuccess<{ stocks: StockDto[] }>;
export type PortfolioResponse = ApiSuccess<{ portfolio: PortfolioItemDto[] }>;
