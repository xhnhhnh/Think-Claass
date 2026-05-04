import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

export interface ShopItem {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  is_active: number;
  teacher_id?: number;
  is_holiday_limited?: number;
  holiday_start_time?: string | null;
  holiday_end_time?: string | null;
}

export interface Auction {
  id: number;
  item_name: string;
  description: string;
  starting_price: number;
  current_price: number;
  highest_bidder_id: number | null;
  status: 'active' | 'ended';
  end_time: string;
}

export interface BlindBox {
  id: number;
  name: string;
  description: string;
  price: number;
  is_active: number;
  created_at?: string;
}

export type ShopItemPayload = Omit<ShopItem, 'id'>;
export type AuctionPayload = Pick<Auction, 'item_name' | 'description' | 'starting_price' | 'end_time'> & Partial<Pick<Auction, 'status'>>;
export type BlindBoxPayload = Pick<BlindBox, 'name' | 'description' | 'price'> & { is_active: boolean | number };

export const shopApi = {
  getAllItems: () => apiGet<{ success: true; items: ShopItem[] }>('/api/shop/all'),

  getTeacherItems: (teacherId?: number) =>
    apiGet<{ success: true; items: ShopItem[] }>(`/api/shop/all${teacherId ? `?teacherId=${teacherId}` : ''}`),

  getStudentItems: () => apiGet<{ success: true; items: ShopItem[] }>('/api/shop/items'),

  getBlindBoxes: () => apiGet<{ success: true; boxes: BlindBox[] }>('/api/shop/blind_boxes'),

  buyItem: (payload: { studentId: number; itemId: number }) =>
    apiPost<{ success: true }>('/api/shop/buy', payload),

  buyBlindBox: (payload: { studentId: number; blindBoxId: number }) =>
    apiPost<{ success: true; reward: string; message: string }>('/api/shop/blind_box', payload),

  updateStatus: (itemId: number, isActive: number) =>
    apiPut<{ success: true }>(`/api/shop/${itemId}/status`, { is_active: isActive }),

  updateItem: (itemId: number, payload: Partial<ShopItemPayload>) =>
    apiPut<{ success: true }>(`/api/shop/${itemId}`, payload),

  createItem: (payload: Partial<ShopItemPayload>) => apiPost<{ success: true }>('/api/shop', payload),

  getAuctions: () => apiGet<{ success: true; auctions: Auction[] }>('/api/shop/auctions'),

  createAuction: (payload: AuctionPayload) => apiPost<{ success: true; id: number }>('/api/shop/auctions', payload),

  updateAuction: (auctionId: number, payload: AuctionPayload) => apiPut<{ success: true }>(`/api/shop/auctions/${auctionId}`, payload),

  deleteAuction: (auctionId: number) => apiDelete<{ success: true }>(`/api/shop/auctions/${auctionId}`),

  bidAuction: (auctionId: number, payload: { studentId: number; bid_amount: number }) =>
    apiPost<{ success: true; message?: string }>(`/api/shop/auctions/${auctionId}/bid`, payload),

  createBlindBox: (payload: BlindBoxPayload) => apiPost<{ success: true; id: number }>('/api/shop/blind_boxes', payload),

  updateBlindBox: (boxId: number, payload: BlindBoxPayload) => apiPut<{ success: true }>(`/api/shop/blind_boxes/${boxId}`, payload),

  toggleBlindBox: (box: BlindBox) =>
    apiPut<{ success: true }>(`/api/shop/blind_boxes/${box.id}`, { ...box, is_active: box.is_active === 1 ? false : true }),

  deleteBlindBox: (boxId: number) => apiDelete<{ success: true }>(`/api/shop/blind_boxes/${boxId}`),
};
