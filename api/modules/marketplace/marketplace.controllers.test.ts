import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';
import { MarketplaceController } from './marketplace.controllers';

function mockReq(): Request {
  return {
    header: () => undefined,
  } as unknown as Request;
}

function expectHttpError(error: unknown, status: number, message: string) {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  expect((error as HttpException).getResponse()).toEqual({ success: false, message });
}

describe('Marketplace Nest controller', () => {
  it('keeps shop item, purchase, auction, and blind box legacy response shapes', () => {
    const service = {
      listItems: vi.fn().mockReturnValue([{ id: 1 }]),
      listAllItems: vi.fn().mockReturnValue([{ id: 2 }]),
      createItem: vi.fn().mockReturnValue({ id: 3 }),
      updateItemStatus: vi.fn(),
      updateItem: vi.fn(),
      buyItem: vi.fn().mockReturnValue({ points: 90 }),
      listAuctions: vi.fn().mockReturnValue([{ id: 4 }]),
      bidAuction: vi.fn().mockReturnValue({ points: 80 }),
      buyBlindBox: vi.fn().mockReturnValue({ points: 70, reward: '普通碎片 x2' }),
      createAuction: vi.fn().mockReturnValue({ id: 5 }),
      updateAuction: vi.fn(),
      deleteAuction: vi.fn(),
      listBlindBoxes: vi.fn().mockReturnValue([{ id: 6 }]),
      createBlindBox: vi.fn().mockReturnValue({ id: 7 }),
      updateBlindBox: vi.fn(),
      deleteBlindBox: vi.fn(),
    };
    const controller = new MarketplaceController(service as any);
    const req = mockReq();

    expect(controller.listItems(req, { studentId: '1' })).toEqual({ success: true, items: [{ id: 1 }] });
    expect(controller.listAllItems({ teacherId: '2' })).toEqual({ success: true, items: [{ id: 2 }] });
    expect(controller.createItem({ name: 'A', price: 1, stock: 1 })).toEqual({ success: true, id: 3 });
    expect(controller.updateItemStatus('3', { is_active: 1 })).toEqual({ success: true });
    expect(controller.updateItem('3', {})).toEqual({ success: true });
    expect(controller.buyItem({ studentId: 1, itemId: 3 })).toEqual({ success: true, points: 90 });
    expect(controller.listAuctions(req)).toEqual({ success: true, auctions: [{ id: 4 }] });
    expect(controller.bidAuction('4', { studentId: 1, bid_amount: 20 })).toEqual({ success: true, points: 80 });
    expect(controller.buyBlindBox({ studentId: 1 })).toEqual({ success: true, points: 70, reward: '普通碎片 x2' });
    expect(controller.createAuction({ item_name: 'A' })).toEqual({ success: true, id: 5 });
    expect(controller.updateAuction('5', {})).toEqual({ success: true });
    expect(controller.deleteAuction('5')).toEqual({ success: true });
    expect(controller.listBlindBoxes(req)).toEqual({ success: true, boxes: [{ id: 6 }] });
    expect(controller.createBlindBox({ name: 'A', price: 10 })).toEqual({ success: true, id: 7 });
    expect(controller.updateBlindBox('7', {})).toEqual({ success: true });
    expect(controller.deleteBlindBox('7')).toEqual({ success: true });
  });

  it('maps legacy ApiError responses', () => {
    const controller = new MarketplaceController({
      buyItem: vi.fn().mockImplementation(() => {
        throw new ApiError(400, 'Item out of stock');
      }),
    } as any);

    try {
      controller.buyItem({ studentId: 1, itemId: 99 });
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 400, 'Item out of stock');
    }
  });
});
