import type { ApiSuccess } from '../core/contracts';

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

export interface BidPayload {
  studentId: number;
  bid_amount: number;
}

export interface PurchasePayload {
  studentId: number;
  itemId: number;
}

export interface BlindBoxPurchasePayload {
  studentId: number;
  blindBoxId: number;
}

export type ShopItemsResponse = ApiSuccess<{ items: ShopItem[] }> & { items: ShopItem[] };
export type AuctionsResponse = ApiSuccess<{ auctions: Auction[] }> & { auctions: Auction[] };
export type BlindBoxesResponse = ApiSuccess<{ boxes: BlindBox[] }> & { boxes: BlindBox[] };
export type PurchaseResponse = ApiSuccess<Record<string, never>>;
export type BlindBoxPurchaseResponse = ApiSuccess<{ reward: string; message: string }> & { reward: string; message: string };
