import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/classFeatures.js', () => ({
  assertClassFeatureEnabled: vi.fn(),
  assertStudentFeatureEnabled: vi.fn(),
}));

import { ApiError } from '../../utils/asyncHandler';
import { EconomyService } from './economy.service';
import type { BankAccountDto, EconomyRepository, EconomyStudentRow, PortfolioItemDto, StockDto, StockPayload, StockPricePayload } from './economy.types';

class FakeEconomyRepository implements EconomyRepository {
  students = new Map<number, EconomyStudentRow>();
  accounts = new Map<number, BankAccountDto>();
  stocks = new Map<number, StockDto>();
  holdings = new Map<string, { id: number; student_id: number; stock_id: number; shares: number; average_buy_price: number }>();
  records: Array<{ studentId: number; type: string; amount: number; description: string }> = [];
  nextStockId = 10;
  nextHoldingId = 20;

  transaction<T>(fn: () => T): T { return fn(); }
  getStudent(studentId: number) { return this.students.get(studentId) ?? null; }
  getOrCreateBankAccount(studentId: number) {
    const existing = this.accounts.get(studentId);
    if (existing) return existing;
    const account = { student_id: studentId, deposit_amount: 0, interest_rate: 0.05, last_interest_date: null };
    this.accounts.set(studentId, account);
    return account;
  }
  listStocks(classId: number) { return [...this.stocks.values()].filter((stock) => stock.class_id === classId); }
  getStock(stockId: number) { return this.stocks.get(stockId) ?? null; }
  listPortfolio(studentId: number) {
    return [...this.holdings.values()]
      .filter((holding) => holding.student_id === studentId && holding.shares > 0)
      .map((holding) => {
        const stock = this.stocks.get(holding.stock_id)!;
        return { ...holding, name: stock.name, symbol: stock.symbol, current_price: stock.current_price } as PortfolioItemDto;
      });
  }
  updateStudentPoints(studentId: number, totalPoints: number, availablePoints: number) {
    const student = this.students.get(studentId)!;
    this.students.set(studentId, { ...student, total_points: totalPoints, available_points: availablePoints });
  }
  updateStudentAvailablePoints(studentId: number, availablePoints: number) {
    const student = this.students.get(studentId)!;
    this.students.set(studentId, { ...student, available_points: availablePoints });
  }
  updateBankDeposit(studentId: number, depositAmount: number) {
    const account = this.getOrCreateBankAccount(studentId);
    this.accounts.set(studentId, { ...account, deposit_amount: depositAmount });
  }
  getHolding(studentId: number, stockId: number) { return this.holdings.get(`${studentId}:${stockId}`) ?? null; }
  upsertHolding(studentId: number, stockId: number, shares: number, averageBuyPrice: number) {
    const key = `${studentId}:${stockId}`;
    const existing = this.holdings.get(key);
    this.holdings.set(key, {
      id: existing?.id ?? this.nextHoldingId++,
      student_id: studentId,
      stock_id: stockId,
      shares,
      average_buy_price: averageBuyPrice,
    });
  }
  updateHoldingShares(holdingId: number, shares: number) {
    for (const [key, holding] of this.holdings) {
      if (holding.id === holdingId) this.holdings.set(key, { ...holding, shares });
    }
  }
  insertRecord(studentId: number, type: string, amount: number, description: string) {
    this.records.push({ studentId, type, amount, description });
  }
  triggerInterest() {}
  createStock(input: StockPayload) {
    const id = this.nextStockId++;
    this.stocks.set(id, { id, trend_history: JSON.stringify([input.current_price]), ...input });
    return id;
  }
  updateStock(stockId: number, input: Partial<StockPayload> | StockPricePayload) {
    const stock = this.stocks.get(stockId)!;
    const current_price = 'new_price' in input ? input.new_price : input.current_price ?? stock.current_price;
    this.stocks.set(stockId, { ...stock, ...('new_price' in input ? {} : input), current_price });
  }
  deleteStock(stockId: number) {
    this.stocks.delete(stockId);
    for (const [key, holding] of this.holdings) {
      if (holding.stock_id === stockId) this.holdings.delete(key);
    }
  }
}

function setup() {
  const repository = new FakeEconomyRepository();
  repository.students.set(1, { id: 1, class_id: 3, total_points: 500, available_points: 200 });
  repository.accounts.set(1, { student_id: 1, deposit_amount: 80, interest_rate: 0.05, last_interest_date: null });
  repository.stocks.set(2, { id: 2, class_id: 3, name: '课堂之星', symbol: 'STAR', current_price: 20, trend_history: '[20]' });
  return { repository, service: new EconomyService(repository) };
}

describe('EconomyService', () => {
  let repository: FakeEconomyRepository;
  let service: EconomyService;

  beforeEach(() => {
    ({ repository, service } = setup());
  });

  it('auto-creates bank accounts for new students', () => {
    repository.students.set(4, { id: 4, class_id: 3, total_points: 0, available_points: 0 });
    expect(service.getBankAccount(4).deposit_amount).toBe(0);
    expect(repository.accounts.has(4)).toBe(true);
  });

  it('rejects deposits and withdrawals with insufficient balance', () => {
    expect(() => service.deposit(1, { amount: 500 })).toThrow(ApiError);
    expect(() => service.withdraw(1, { amount: 500 })).toThrow(ApiError);
  });

  it('buys stock and recalculates average price', () => {
    service.buyStock(1, { stockId: 2, shares: 2 });
    repository.stocks.set(2, { ...repository.stocks.get(2)!, current_price: 40 });
    service.buyStock(1, { stockId: 2, shares: 2 });

    const holding = repository.getHolding(1, 2)!;
    expect(holding.shares).toBe(4);
    expect(holding.average_buy_price).toBe(30);
    expect(repository.students.get(1)?.available_points).toBe(80);
  });

  it('rejects stock sales above the current holding', () => {
    service.buyStock(1, { stockId: 2, shares: 1 });
    expect(() => service.sellStock(1, { stockId: 2, shares: 2 })).toThrow(ApiError);
  });

  it('supports teacher stock CRUD', () => {
    const created = service.createStock({ class_id: 3, name: '阅读之星', symbol: 'read', current_price: 100 });
    service.updateStock(created.id, { class_id: 3, name: '阅读之星', symbol: 'READ', current_price: 120 });

    expect(repository.getStock(created.id)?.symbol).toBe('READ');
    expect(repository.getStock(created.id)?.current_price).toBe(120);

    service.deleteStock(created.id);
    expect(repository.getStock(created.id)).toBeNull();
  });
});
