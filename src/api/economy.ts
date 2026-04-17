import { apiGet, apiPost } from '@/lib/api';

export const economyApi = {
  getBank: (studentId: number) => apiGet<{ success: true; account: any }>(`/api/economy/bank/${studentId}`),

  getStocks: (classId: number) => apiGet<{ success: true; stocks: any[] }>(`/api/economy/stocks/${classId}`),

  getPortfolio: (studentId: number) =>
    apiGet<{ success: true; portfolio: any[] }>(`/api/economy/portfolio/${studentId}`),

  deposit: (studentId: number, amount: number) =>
    apiPost<{ success: true }>(`/api/economy/bank/deposit/${studentId}`, { amount }),

  withdraw: (studentId: number, amount: number) =>
    apiPost<{ success: true }>(`/api/economy/bank/withdraw/${studentId}`, { amount }),

  buyStock: (studentId: number, payload: { stockId: number; shares: number }) =>
    apiPost<{ success: true }>(`/api/economy/stocks/buy/${studentId}`, payload),

  sellStock: (studentId: number, payload: { stockId: number; shares: number }) =>
    apiPost<{ success: true }>(`/api/economy/stocks/sell/${studentId}`, payload),
};
