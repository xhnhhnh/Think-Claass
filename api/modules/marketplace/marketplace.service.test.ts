import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';

const dbMocks = vi.hoisted(() => ({
  all: vi.fn(),
  get: vi.fn(),
  prepare: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn((fn: () => unknown) => fn),
}));

const featureMocks = vi.hoisted(() => ({
  assertActorFeatureEnabled: vi.fn(),
  assertStudentFeatureEnabled: vi.fn(),
}));

const pointsMocks = vi.hoisted(() => ({
  addStudentPoints: vi.fn(),
  spendStudentPoints: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  default: {
    prepare: dbMocks.prepare,
    transaction: dbMocks.transaction,
  },
}));

vi.mock('../../services/featureService.js', () => ({
  assertActorFeatureEnabled: featureMocks.assertActorFeatureEnabled,
  assertStudentFeatureEnabled: featureMocks.assertStudentFeatureEnabled,
}));

vi.mock('../../services/pointsService.js', () => ({
  addStudentPoints: pointsMocks.addStudentPoints,
  spendStudentPoints: pointsMocks.spendStudentPoints,
}));

vi.mock('../../services/studentService.js', () => ({
  getStudentOrThrow: vi.fn(),
}));

import { MarketplaceService } from './marketplace.service';

function mockPreparedStatement() {
  dbMocks.prepare.mockImplementation((sql: string) => ({
    all: (...args: unknown[]) => dbMocks.all(sql, ...args),
    get: (...args: unknown[]) => dbMocks.get(sql, ...args),
    run: (...args: unknown[]) => dbMocks.run(sql, ...args),
  }));
}

function mockReq(role = 'student', id: number | null = 1): Request {
  return {
    header(name: string) {
      if (name === 'x-user-role') return role;
      if (name === 'x-user-id') return id === null ? undefined : String(id);
      return undefined;
    },
  } as unknown as Request;
}

function expectApiError(fn: () => unknown, statusCode: number, message: string) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(statusCode);
    expect((error as ApiError).message).toBe(message);
  }
}

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(dbMocks).forEach((mock) => mock.mockReset());
    Object.values(featureMocks).forEach((mock) => mock.mockReset());
    Object.values(pointsMocks).forEach((mock) => mock.mockReset());
    dbMocks.transaction.mockImplementation((fn: () => unknown) => fn);
    mockPreparedStatement();
    service = new MarketplaceService();
  });

  it('keeps shop item student feature guard and teacher-filtered lists', () => {
    dbMocks.all.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([{ id: 2 }]);

    expect(service.listItems(mockReq(), { studentId: '3' })).toEqual([{ id: 1 }]);
    expect(featureMocks.assertActorFeatureEnabled).toHaveBeenCalledWith(1, 'student', 'enable_shop');
    expect(dbMocks.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE s.id = ?'));

    expect(service.listAllItems({ teacherId: '8' })).toEqual([{ id: 2 }]);
    expect(dbMocks.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE teacher_id = ?'));
  });

  it('keeps shop item validation and purchase ticket side effects', () => {
    expectApiError(() => service.createItem({ name: 'A', price: 5 }), 400, 'Invalid input');

    dbMocks.get.mockReturnValueOnce({ id: 4, name: 'Prize', price: 10, stock: 1, is_active: 1, is_holiday_limited: 0 });
    pointsMocks.spendStudentPoints.mockReturnValueOnce({ available_points: 90 });
    expect(service.buyItem({ studentId: 2, itemId: 4 })).toEqual({ points: 90 });
    expect(featureMocks.assertStudentFeatureEnabled).toHaveBeenCalledWith(2, 'enable_shop');
    expect(dbMocks.run).toHaveBeenCalledWith('UPDATE shop_items SET stock = stock - 1 WHERE id = ?', 4);
    expect(dbMocks.run).toHaveBeenCalledWith(
      'INSERT INTO redemption_tickets (student_id, item_id, code, status) VALUES (?, ?, ?, ?)',
      2,
      4,
      expect.stringMatching(/^RED-/),
      'pending',
    );
  });

  it('rejects unavailable items and keeps blind-box consolation points', () => {
    dbMocks.get.mockReturnValueOnce({ id: 4, stock: 0, is_active: 1 });
    expectApiError(() => service.buyItem({ studentId: 2, itemId: 4 }), 400, 'Item out of stock');

    pointsMocks.spendStudentPoints.mockReturnValueOnce({ available_points: 0 });
    pointsMocks.addStudentPoints.mockReturnValueOnce({ available_points: 10 });
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9);

    expect(service.buyBlindBox({ studentId: 2 })).toEqual({
      points: 10,
      reward: '谢谢参与 (获得安慰奖 10积分)',
    });
    expect(pointsMocks.addStudentPoints).toHaveBeenCalledWith(2, 10, 'BLIND_BOX_CONSOLATION', 'Blind box consolation prize');
  });
});
