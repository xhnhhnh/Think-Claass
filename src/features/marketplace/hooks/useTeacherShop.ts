import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { shopApi, type AuctionPayload, type BlindBox, type BlindBoxPayload, type ShopItemPayload } from '../api/shopApi';

export const teacherMarketplaceKeys = {
  shopItems: ['teacher-shop-items'] as const,
  auctions: ['teacher-auctions'] as const,
  blindBoxes: ['teacher-blind-boxes'] as const,
  studentShopData: ['student-shop-data'] as const,
};

export function useTeacherShopItems() {
  return useQuery({
    queryKey: teacherMarketplaceKeys.shopItems,
    queryFn: async () => {
      const data = await shopApi.getAllItems();
      return data.items;
    },
  });
}

export function useTeacherShopMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload:
        | { type: 'status'; itemId: number; isActive: number }
        | { type: 'update'; itemId: number; data: Partial<ShopItemPayload> }
        | { type: 'create'; data: Partial<ShopItemPayload> },
    ) => {
      if (payload.type === 'status') return shopApi.updateStatus(payload.itemId, payload.isActive);
      if (payload.type === 'update') return shopApi.updateItem(payload.itemId, payload.data);
      return shopApi.createItem(payload.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teacherMarketplaceKeys.shopItems });
      await queryClient.invalidateQueries({ queryKey: teacherMarketplaceKeys.studentShopData });
    },
  });
}

export function useTeacherAuctions() {
  return useQuery({
    queryKey: teacherMarketplaceKeys.auctions,
    queryFn: async () => {
      const data = await shopApi.getAuctions();
      return data.auctions;
    },
  });
}

export function useTeacherAuctionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload:
        | { type: 'create'; data: AuctionPayload }
        | { type: 'update'; auctionId: number; data: AuctionPayload }
        | { type: 'delete'; auctionId: number },
    ) => {
      if (payload.type === 'create') return shopApi.createAuction(payload.data);
      if (payload.type === 'update') return shopApi.updateAuction(payload.auctionId, payload.data);
      return shopApi.deleteAuction(payload.auctionId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teacherMarketplaceKeys.auctions });
      await queryClient.invalidateQueries({ queryKey: teacherMarketplaceKeys.studentShopData });
    },
  });
}

export function useTeacherBlindBoxes() {
  return useQuery({
    queryKey: teacherMarketplaceKeys.blindBoxes,
    queryFn: async () => {
      const data = await shopApi.getBlindBoxes();
      return data.boxes;
    },
  });
}

export function useTeacherBlindBoxMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload:
        | { type: 'create'; data: BlindBoxPayload }
        | { type: 'update'; boxId: number; data: BlindBoxPayload }
        | { type: 'toggle'; box: BlindBox }
        | { type: 'delete'; boxId: number },
    ) => {
      if (payload.type === 'create') return shopApi.createBlindBox(payload.data);
      if (payload.type === 'update') return shopApi.updateBlindBox(payload.boxId, payload.data);
      if (payload.type === 'toggle') return shopApi.toggleBlindBox(payload.box);
      return shopApi.deleteBlindBox(payload.boxId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teacherMarketplaceKeys.blindBoxes });
      await queryClient.invalidateQueries({ queryKey: teacherMarketplaceKeys.studentShopData });
    },
  });
}
