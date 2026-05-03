import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  BankAccountDto,
  EconomyOverviewDto,
  PortfolioItemDto,
  StockDto,
  StockPayload,
  StockTradeInput,
} from '../types';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export const economyApi = {
  getOverview: (studentId: number, classId: number) =>
    apiGet<ApiSuccess<EconomyOverviewDto>>(`/api/economy/students/${studentId}/overview?classId=${classId}`),

  getBank: (studentId: number) =>
    apiGet<ApiSuccess<{ account: BankAccountDto }> & { account: BankAccountDto }>(`/api/economy/students/${studentId}/bank`),

  getStocks: (classId: number) =>
    apiGet<ApiSuccess<{ stocks: StockDto[] }> & { stocks: StockDto[] }>(`/api/economy/classes/${classId}/stocks`),

  getPortfolio: (studentId: number) =>
    apiGet<ApiSuccess<{ portfolio: PortfolioItemDto[] }> & { portfolio: PortfolioItemDto[] }>(`/api/economy/students/${studentId}/portfolio`),

  deposit: (studentId: number, amount: number) =>
    apiPost<ApiSuccess<{ account: BankAccountDto }>>(`/api/economy/students/${studentId}/bank/deposits`, { amount }),

  withdraw: (studentId: number, amount: number) =>
    apiPost<ApiSuccess<{ account: BankAccountDto }>>(`/api/economy/students/${studentId}/bank/withdrawals`, { amount }),

  buyStock: (studentId: number, payload: StockTradeInput) =>
    apiPost<ApiSuccess<{ portfolio: PortfolioItemDto[] }>>(`/api/economy/students/${studentId}/stocks/buy`, payload),

  sellStock: (studentId: number, payload: StockTradeInput) =>
    apiPost<ApiSuccess<{ portfolio: PortfolioItemDto[] }>>(`/api/economy/students/${studentId}/stocks/sell`, payload),

  createStock: (payload: StockPayload) =>
    apiPost<ApiSuccess<{ id: number }>>('/api/economy/teacher/stocks', payload),

  updateStock: (stockId: number, payload: StockPayload) =>
    apiPut<ApiSuccess<{ stock: StockDto }>>(`/api/economy/teacher/stocks/${stockId}`, payload),

  deleteStock: (stockId: number) =>
    apiDelete<ApiSuccess<{ deleted: boolean }>>(`/api/economy/teacher/stocks/${stockId}`),
};
