import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  Auction,
  AuctionPayload,
  AuctionsResponse,
  BidPayload,
  BlindBox,
  BlindBoxPayload,
  BlindBoxesResponse,
  BlindBoxPurchasePayload,
  BlindBoxPurchaseResponse,
  PurchasePayload,
  PurchaseResponse,
  ShopItemPayload,
  ShopItemsResponse,
} from '@/shared/marketplace/contracts';

export const shopApi = {
  getAllItems: () => apiGet<ShopItemsResponse>('/api/shop/all'),

  getTeacherItems: (teacherId?: number) =>
    apiGet<ShopItemsResponse>(`/api/shop/all${teacherId ? `?teacherId=${teacherId}` : ''}`),

  getStudentItems: () => apiGet<ShopItemsResponse>('/api/shop/items'),

  getBlindBoxes: () => apiGet<BlindBoxesResponse>('/api/shop/blind_boxes'),

  buyItem: (payload: PurchasePayload) => apiPost<PurchaseResponse>('/api/shop/buy', payload),

  buyBlindBox: (payload: BlindBoxPurchasePayload) =>
    apiPost<BlindBoxPurchaseResponse>('/api/shop/blind_box', payload),

  updateStatus: (itemId: number, isActive: number) =>
    apiPut<PurchaseResponse>(`/api/shop/${itemId}/status`, { is_active: isActive }),

  updateItem: (itemId: number, payload: Partial<ShopItemPayload>) =>
    apiPut<PurchaseResponse>(`/api/shop/${itemId}`, payload),

  createItem: (payload: Partial<ShopItemPayload>) => apiPost<PurchaseResponse>('/api/shop', payload),

  getAuctions: () => apiGet<AuctionsResponse>('/api/shop/auctions'),

  createAuction: (payload: AuctionPayload) => apiPost<{ success: true; id: number }>('/api/shop/auctions', payload),

  updateAuction: (auctionId: number, payload: AuctionPayload) =>
    apiPut<PurchaseResponse>(`/api/shop/auctions/${auctionId}`, payload),

  deleteAuction: (auctionId: number) => apiDelete<PurchaseResponse>(`/api/shop/auctions/${auctionId}`),

  bidAuction: (auctionId: number, payload: BidPayload) =>
    apiPost<{ success: true; message?: string }>(`/api/shop/auctions/${auctionId}/bid`, payload),

  createBlindBox: (payload: BlindBoxPayload) => apiPost<{ success: true; id: number }>('/api/shop/blind_boxes', payload),

  updateBlindBox: (boxId: number, payload: BlindBoxPayload) =>
    apiPut<PurchaseResponse>(`/api/shop/blind_boxes/${boxId}`, payload),

  toggleBlindBox: (box: BlindBox) =>
    apiPut<PurchaseResponse>(`/api/shop/blind_boxes/${box.id}`, { ...box, is_active: box.is_active === 1 ? false : true }),

  deleteBlindBox: (boxId: number) => apiDelete<PurchaseResponse>(`/api/shop/blind_boxes/${boxId}`),
};

export type { Auction, AuctionPayload, BlindBox, BlindBoxPayload, ShopItem, ShopItemPayload } from '@/shared/marketplace/contracts';
