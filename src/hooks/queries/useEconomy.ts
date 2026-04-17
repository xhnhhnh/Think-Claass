import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { economyApi } from '@/api/economy';

export function useEconomyData(studentId: number | null, classId: number | null) {
  return useQuery({
    queryKey: ['economy-data', studentId, classId],
    queryFn: async () => {
      if (!studentId || !classId) return null;
      const [bankData, stocksData, portfolioData] = await Promise.all([
        economyApi.getBank(studentId),
        economyApi.getStocks(classId),
        economyApi.getPortfolio(studentId),
      ]);
      return {
        bank: bankData.account,
        stocks: stocksData.stocks,
        portfolio: portfolioData.portfolio,
      };
    },
    enabled: !!studentId && !!classId,
    refetchInterval: 15000,
  });
}

export function useEconomyBankMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { action: 'deposit' | 'withdraw'; amount: number }) => {
      if (!studentId) throw new Error('学生信息不存在');
      if (payload.action === 'deposit') return economyApi.deposit(studentId, payload.amount);
      return economyApi.withdraw(studentId, payload.amount);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['economy-data'] });
    },
  });
}

export function useEconomyTradeMutation(studentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { action: 'buy' | 'sell'; stockId: number; shares: number }) => {
      if (!studentId) throw new Error('学生信息不存在');
      if (payload.action === 'buy') return economyApi.buyStock(studentId, payload);
      return economyApi.sellStock(studentId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['economy-data'] });
    },
  });
}
