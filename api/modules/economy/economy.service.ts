import { ApiError } from '../../utils/asyncHandler.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled } from '../../utils/classFeatures.js';
import type { BankTransferInput, EconomyRepository, StockPayload, StockPricePayload, StockTradeInput } from './economy.types.js';

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

export class EconomyService {
  constructor(private readonly repository: EconomyRepository) {}

  getStudentOverview(studentIdInput: unknown, classIdInput?: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const student = this.getStudentOrThrow(studentId);
    const classId = classIdInput ? positiveInteger(classIdInput, 'Class id') : student.class_id;
    assertStudentFeatureEnabled(studentId, 'enable_economy');

    return {
      bank: this.repository.getOrCreateBankAccount(studentId),
      stocks: this.repository.listStocks(classId),
      portfolio: this.repository.listPortfolio(studentId),
    };
  }

  getBankAccount(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    this.getStudentOrThrow(studentId);
    assertStudentFeatureEnabled(studentId, 'enable_economy');
    return this.repository.getOrCreateBankAccount(studentId);
  }

  listStocks(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    assertClassFeatureEnabled(classId, 'enable_economy');
    return this.repository.listStocks(classId);
  }

  listPortfolio(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    this.getStudentOrThrow(studentId);
    assertStudentFeatureEnabled(studentId, 'enable_economy');
    return this.repository.listPortfolio(studentId);
  }

  deposit(studentIdInput: unknown, input: BankTransferInput) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const amount = positiveInteger(input.amount, 'Amount');
    assertStudentFeatureEnabled(studentId, 'enable_economy');

    return this.repository.transaction(() => {
      const student = this.getStudentOrThrow(studentId);
      const account = this.repository.getOrCreateBankAccount(studentId);
      if (student.available_points < amount) {
        throw new ApiError(400, '余额不足');
      }

      this.repository.updateStudentAvailablePoints(studentId, student.available_points - amount);
      this.repository.updateBankDeposit(studentId, account.deposit_amount + amount);
      this.repository.insertRecord(studentId, 'BANK_DEPOSIT', -amount, 'Deposited into Bank');
      return { account: this.repository.getOrCreateBankAccount(studentId) };
    });
  }

  withdraw(studentIdInput: unknown, input: BankTransferInput) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const amount = positiveInteger(input.amount, 'Amount');
    assertStudentFeatureEnabled(studentId, 'enable_economy');

    return this.repository.transaction(() => {
      const student = this.getStudentOrThrow(studentId);
      const account = this.repository.getOrCreateBankAccount(studentId);
      if (account.deposit_amount < amount) {
        throw new ApiError(400, '存款不足');
      }

      this.repository.updateBankDeposit(studentId, account.deposit_amount - amount);
      this.repository.updateStudentAvailablePoints(studentId, student.available_points + amount);
      this.repository.insertRecord(studentId, 'BANK_WITHDRAW', amount, 'Withdrew from Bank');
      return { account: this.repository.getOrCreateBankAccount(studentId) };
    });
  }

  buyStock(studentIdInput: unknown, input: StockTradeInput) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const stockId = positiveInteger(input.stockId, 'Stock id');
    const shares = positiveInteger(input.shares, 'Shares');
    assertStudentFeatureEnabled(studentId, 'enable_economy');

    return this.repository.transaction(() => {
      const student = this.getStudentOrThrow(studentId);
      const stock = this.getStockOrThrow(stockId);
      const totalCost = stock.current_price * shares;
      if (student.available_points < totalCost) {
        throw new ApiError(400, '积分不足');
      }

      const holding = this.repository.getHolding(studentId, stockId);
      const nextShares = (holding?.shares ?? 0) + shares;
      const nextAverage =
        holding && holding.shares > 0
          ? (holding.shares * holding.average_buy_price + totalCost) / nextShares
          : stock.current_price;

      this.repository.updateStudentAvailablePoints(studentId, student.available_points - totalCost);
      this.repository.upsertHolding(studentId, stockId, nextShares, nextAverage);
      this.repository.insertRecord(studentId, 'STOCK_BUY', -totalCost, `Bought ${shares} shares of ${stock.symbol}`);
      return { portfolio: this.repository.listPortfolio(studentId) };
    });
  }

  sellStock(studentIdInput: unknown, input: StockTradeInput) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const stockId = positiveInteger(input.stockId, 'Stock id');
    const shares = positiveInteger(input.shares, 'Shares');
    assertStudentFeatureEnabled(studentId, 'enable_economy');

    return this.repository.transaction(() => {
      const student = this.getStudentOrThrow(studentId);
      const stock = this.getStockOrThrow(stockId);
      const holding = this.repository.getHolding(studentId, stockId);
      if (!holding || holding.shares < shares) {
        throw new ApiError(400, '持仓不足');
      }

      const totalValue = stock.current_price * shares;
      this.repository.updateStudentAvailablePoints(studentId, student.available_points + totalValue);
      this.repository.updateHoldingShares(holding.id, holding.shares - shares);
      this.repository.insertRecord(studentId, 'STOCK_SELL', totalValue, `Sold ${shares} shares of ${stock.symbol}`);
      return { portfolio: this.repository.listPortfolio(studentId) };
    });
  }

  triggerInterest() {
    this.repository.triggerInterest();
    return { applied: true };
  }

  createStock(input: StockPayload) {
    const classId = positiveInteger(input.class_id, 'Class id');
    const currentPrice = positiveNumber(input.current_price, 'Current price');
    if (!String(input.name || '').trim() || !String(input.symbol || '').trim()) {
      throw new ApiError(400, 'Stock name and symbol are required');
    }

    assertClassFeatureEnabled(classId, 'enable_economy');
    const id = this.repository.createStock({
      class_id: classId,
      name: input.name.trim(),
      symbol: input.symbol.trim().toUpperCase(),
      current_price: currentPrice,
    });
    return { id };
  }

  updateStock(stockIdInput: unknown, input: Partial<StockPayload> | StockPricePayload) {
    const stockId = positiveInteger(stockIdInput, 'Stock id');
    const stock = this.getStockOrThrow(stockId);
    assertClassFeatureEnabled(stock.class_id, 'enable_economy');

    if ('new_price' in input) {
      positiveNumber(input.new_price, 'Current price');
    } else if (input.current_price !== undefined) {
      positiveNumber(input.current_price, 'Current price');
    }

    this.repository.updateStock(stockId, input);
    return { stock: this.getStockOrThrow(stockId) };
  }

  deleteStock(stockIdInput: unknown) {
    const stockId = positiveInteger(stockIdInput, 'Stock id');
    const stock = this.getStockOrThrow(stockId);
    assertClassFeatureEnabled(stock.class_id, 'enable_economy');
    this.repository.deleteStock(stockId);
    return { deleted: true };
  }

  private getStudentOrThrow(studentId: number) {
    const student = this.repository.getStudent(studentId);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }
    return student;
  }

  private getStockOrThrow(stockId: number) {
    const stock = this.repository.getStock(stockId);
    if (!stock) {
      throw new ApiError(404, 'Stock not found');
    }
    return stock;
  }
}
