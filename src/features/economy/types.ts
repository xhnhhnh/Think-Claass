import type { StockPayload } from '@/shared/economy/contracts';

export type {
  BankAccountDto,
  BankTransferInput,
  EconomyOverviewDto,
  PortfolioItemDto,
  StockDto,
  StockPayload,
  StockPricePayload,
  StockTradeInput,
} from '@/shared/economy/contracts';

export type BankMutationInput =
  | { action: 'deposit'; amount: number }
  | { action: 'withdraw'; amount: number };

export type TradeMutationInput =
  | { action: 'buy'; stockId: number; shares: number }
  | { action: 'sell'; stockId: number; shares: number };

export type TeacherStockMutationInput =
  | { type: 'create'; data: StockPayload }
  | { type: 'update'; stockId: number; data: StockPayload }
  | { type: 'delete'; stockId: number };
