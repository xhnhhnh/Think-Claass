import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { economyApi } from '../api/economyApi';
import type { BankMutationInput, TeacherStockMutationInput, TradeMutationInput } from '../types';

export const economyQueryKeys = {
  overview: (studentId: number | null, classId: number | null) => ['economy', 'overview', studentId, classId] as const,
  stocks: (classId: number | string | null) => ['economy', 'stocks', classId] as const,
  legacyData: ['economy-data'] as const,
};

export function useEconomyData(studentId: number | null, classId: number | null) {
  return useQuery({
    queryKey: economyQueryKeys.overview(studentId, classId),
    queryFn: async () => {
      if (!studentId || !classId) return null;
      const response = await economyApi.getOverview(studentId, classId);
      return response.data;
    },
    enabled: !!studentId && !!classId,
    refetchInterval: 15000,
  });
}

export function useEconomyBankMutation(studentId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: BankMutationInput) => {
      if (!studentId) throw new Error('学生信息不存在');
      if (payload.action === 'deposit') return economyApi.deposit(studentId, payload.amount);
      return economyApi.withdraw(studentId, payload.amount);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['economy'] });
      await queryClient.invalidateQueries({ queryKey: economyQueryKeys.legacyData });
    },
  });
}

export function useEconomyTradeMutation(studentId: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: TradeMutationInput) => {
      if (!studentId) throw new Error('学生信息不存在');
      const tradePayload = { stockId: payload.stockId, shares: payload.shares };
      if (payload.action === 'buy') return economyApi.buyStock(studentId, tradePayload);
      return economyApi.sellStock(studentId, tradePayload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['economy'] });
      await queryClient.invalidateQueries({ queryKey: economyQueryKeys.legacyData });
    },
  });
}

export function useTeacherStocks(classId: number | string | null) {
  return useQuery({
    queryKey: economyQueryKeys.stocks(classId),
    queryFn: async () => {
      if (!classId) return [];
      const response = await economyApi.getStocks(Number(classId));
      return response.data.stocks;
    },
    enabled: !!classId,
  });
}

export function useTeacherStockMutation(classId: number | string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: TeacherStockMutationInput) => {
      if (payload.type === 'create') return economyApi.createStock(payload.data);
      if (payload.type === 'update') return economyApi.updateStock(payload.stockId, payload.data);
      return economyApi.deleteStock(payload.stockId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: economyQueryKeys.stocks(classId) });
      await queryClient.invalidateQueries({ queryKey: ['economy'] });
    },
  });
}
