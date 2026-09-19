/**
 * Economy service.
 *
 * Two storage boundaries meet here, and the difference is the whole point of the
 * migration:
 *
 *   bank_accounts / stocks / student_stocks   owned by this plugin -> `ctx.db`
 *   students.available_points, records        owned by classroom    -> `classroom.public`
 *
 * Rust-checked: the plugin cannot write `students` even though the pre-migration code
 * did, because a second writer would invalidate classroom's ownership declaration.
 *
 * ## Atomicity, stated honestly
 *
 * The original code mutated all four tables in one better-sqlite3 transaction. That
 * is no longer possible: the port writes through the classroom plugin, and a
 * synchronous better-sqlite3 transaction cannot span an `await`. So a money operation
 * is a short sequence of individually-atomic steps rather than one transaction.
 *
 * The ordering is chosen so the failure that can actually happen is the harmless one:
 *
 *   debit   -> platform tables written by this plugin (can fail) -> credit back
 *   credit  -> platform tables written by this plugin (can fail) -> no compensation needed
 *
 * A debit therefore never silently loses points, and a failed write never leaves the
 * student short. The remaining exposure is a process death between two steps, which
 * the `records` ledger makes visible. Restoring true cross-plugin atomicity needs a
 * kernel-level unit of work, which is P6/P7 work.
 */

import type { ClassroomPort, ClassroomRefusal } from '@thinkclass/contracts/domains/classroom';
import { ApiError } from '@thinkclass/kernel';

import type { EconomyRepository, StockPayload, StockPricePayload, StockTradeInput } from './economy.types.js';

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

function positiveNumber(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

/**
 * Map a refusal from the classroom port onto this domain's HTTP status.
 *
 * The port cannot throw the kernel's `ApiError` (contracts are type-only, guardrail
 * G6), so it returns a code and each caller decides. These are exactly the statuses
 * the pre-migration service produced, so the HTTP contract does not move.
 */
function toApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal.code) {
    case 'feature-disabled':
      return new ApiError(403, '该功能当前已关闭');
    case 'insufficient-credits':
      return new ApiError(400, '积分不足');
    case 'student-not-found':
      return new ApiError(404, 'Student not found');
    case 'class-not-found':
      return new ApiError(404, '班级未找到');
    default:
      return new ApiError(400, refusal.message);
  }
}

export class EconomyService {
  constructor(
    private readonly repository: EconomyRepository,
    private readonly classroom: ClassroomPort,
  ) {}

  /**
   * Resolve a student through the port, then reject when the class has economy off.
   *
   * Order matters and is preserved from the pre-migration implementation: the student
   * lookup (404) runs before the feature check (403), so a request naming a missing
   * student still answers 404.
   */
  private async requireEconomyStudent(studentId: number): Promise<{ classId: number; availablePoints: number }> {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, 'Student not found');

    const gate = await this.classroom.checkStudentFeature(studentId, 'enable_economy');
    if (gate.refusal) throw toApiError(gate.refusal);

    return { classId: student.classId, availablePoints: student.availablePoints };
  }

  async getStudentOverview(studentIdInput: unknown, classIdInput?: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const student = await this.requireEconomyStudent(studentId);
    const classId = classIdInput ? positiveInteger(classIdInput, 'Class id') : student.classId;

    return {
      bank: this.repository.getOrCreateBankAccount(studentId),
      stocks: this.repository.listStocks(classId),
      portfolio: this.repository.listPortfolio(studentId),
    };
  }

  async getBankAccount(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    await this.requireEconomyStudent(studentId);
    return this.repository.getOrCreateBankAccount(studentId);
  }

  async listStocks(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    const classRow = await this.classroom.getClassById(classId);
    if (!classRow) throw new ApiError(404, '班级未找到');

    // `enable_economy` is a class-scope flag, so the class itself is the subject.
    await this.assertClassFeatureEnabled(classId);
    return this.repository.listStocks(classId);
  }

  async listPortfolio(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    await this.requireEconomyStudent(studentId);
    return this.repository.listPortfolio(studentId);
  }

  async deposit(studentIdInput: unknown, input: { amount?: unknown }) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const amount = positiveInteger(input.amount, 'Amount');
    const student = await this.requireEconomyStudent(studentId);

    const account = this.repository.getOrCreateBankAccount(studentId);
    if (student.availablePoints < amount) {
      throw new ApiError(400, '余额不足');
    }

    this.repository.updateBankDeposit(studentId, account.deposit_amount + amount);

    const moved = await this.classroom.transferStudentCredits({
      studentId,
      delta: -amount,
      reason: 'bank.deposit',
      actorId: 0,
    });
    if (moved.refusal) {
      // The bank write is already committed; undo it so the two sides agree again.
      this.repository.updateBankDeposit(studentId, account.deposit_amount);
      throw toApiError(moved.refusal);
    }

    await this.ledger(studentId, 'BANK_DEPOSIT', -amount, 'Deposited into Bank');
    return { account: this.repository.getOrCreateBankAccount(studentId) };
  }

  async withdraw(studentIdInput: unknown, input: { amount?: unknown }) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const amount = positiveInteger(input.amount, 'Amount');
    await this.requireEconomyStudent(studentId);

    const account = this.repository.getOrCreateBankAccount(studentId);
    if (account.deposit_amount < amount) {
      throw new ApiError(400, '存款不足');
    }

    this.repository.updateBankDeposit(studentId, account.deposit_amount - amount);

    const moved = await this.classroom.transferStudentCredits({
      studentId,
      delta: amount,
      reason: 'bank.withdraw',
      actorId: 0,
    });
    if (moved.refusal) {
      this.repository.updateBankDeposit(studentId, account.deposit_amount);
      throw toApiError(moved.refusal);
    }

    await this.ledger(studentId, 'BANK_WITHDRAW', amount, 'Withdrew from Bank');
    return { account: this.repository.getOrCreateBankAccount(studentId) };
  }

  async buyStock(studentIdInput: unknown, input: StockTradeInput) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const stockId = positiveInteger(input.stockId, 'Stock id');
    const shares = positiveInteger(input.shares, 'Shares');
    const student = await this.requireEconomyStudent(studentId);

    const stock = this.getStockOrThrow(stockId);
    const totalCost = stock.current_price * shares;
    if (student.availablePoints < totalCost) {
      throw new ApiError(400, '积分不足');
    }

    const holding = this.repository.getHolding(studentId, stockId);
    const nextShares = (holding?.shares ?? 0) + shares;
    const nextAverage =
      holding && holding.shares > 0
        ? (holding.shares * holding.average_buy_price + totalCost) / nextShares
        : stock.current_price;

    this.repository.upsertHolding(studentId, stockId, nextShares, nextAverage);

    const moved = await this.classroom.transferStudentCredits({
      studentId,
      delta: -totalCost,
      reason: 'stocks.buy',
      actorId: 0,
    });
    if (moved.refusal) {
      // Restore the previous holding rather than guessing at a partial state. A
      // brand-new holding has to be removed outright - leaving it at shares = 0 would
      // be debris the original single-transaction version never produced.
      if (holding) {
        this.repository.upsertHolding(studentId, stockId, holding.shares, holding.average_buy_price);
      } else {
        this.repository.deleteHolding(studentId, stockId);
      }
      throw toApiError(moved.refusal);
    }

    await this.ledger(studentId, 'STOCK_BUY', -totalCost, `Bought ${shares} shares of ${stock.symbol}`);
    return { portfolio: this.repository.listPortfolio(studentId) };
  }

  async sellStock(studentIdInput: unknown, input: StockTradeInput) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const stockId = positiveInteger(input.stockId, 'Stock id');
    const shares = positiveInteger(input.shares, 'Shares');
    await this.requireEconomyStudent(studentId);

    const stock = this.getStockOrThrow(stockId);
    const holding = this.repository.getHolding(studentId, stockId);
    if (!holding || holding.shares < shares) {
      throw new ApiError(400, '持仓不足');
    }

    const totalValue = stock.current_price * shares;
    this.repository.updateHoldingShares(holding.id, holding.shares - shares);

    const moved = await this.classroom.transferStudentCredits({
      studentId,
      delta: totalValue,
      reason: 'stocks.sell',
      actorId: 0,
    });
    if (moved.refusal) {
      this.repository.updateHoldingShares(holding.id, holding.shares);
      throw toApiError(moved.refusal);
    }

    await this.ledger(studentId, 'STOCK_SELL', totalValue, `Sold ${shares} shares of ${stock.symbol}`);
    return { portfolio: this.repository.listPortfolio(studentId) };
  }

  triggerInterest() {
    this.repository.triggerInterest();
    return { applied: true };
  }

  async createStock(input: StockPayload) {
    const classId = positiveInteger(input.class_id, 'Class id');
    const currentPrice = positiveNumber(input.current_price, 'Current price');
    if (!String(input.name || '').trim() || !String(input.symbol || '').trim()) {
      throw new ApiError(400, 'Stock name and symbol are required');
    }

    await this.assertClassFeatureEnabled(classId);
    const id = this.repository.createStock({
      class_id: classId,
      name: input.name.trim(),
      symbol: input.symbol.trim().toUpperCase(),
      current_price: currentPrice,
    });
    return { id };
  }

  async updateStock(stockIdInput: unknown, input: Partial<StockPayload> | StockPricePayload) {
    const stockId = positiveInteger(stockIdInput, 'Stock id');
    const stock = this.getStockOrThrow(stockId);
    await this.assertClassFeatureEnabled(stock.class_id);

    if ('new_price' in input) {
      positiveNumber(input.new_price, 'Current price');
    } else if (input.current_price !== undefined) {
      positiveNumber(input.current_price, 'Current price');
    }

    this.repository.updateStock(stockId, input);
    return { stock: this.getStockOrThrow(stockId) };
  }

  async deleteStock(stockIdInput: unknown) {
    const stockId = positiveInteger(stockIdInput, 'Stock id');
    const stock = this.getStockOrThrow(stockId);
    await this.assertClassFeatureEnabled(stock.class_id);
    this.repository.deleteStock(stockId);
    return { deleted: true };
  }

  /**
   * Reject when a *class* has economy off.
   *
   * Four call sites in the pre-migration service were class-scoped (they hold a class
   * id through a stock, not a student id), so the port exposes both forms rather than
   * this plugin re-deriving the flag semantics.
   */
  private async assertClassFeatureEnabled(classId: number): Promise<void> {
    const gate = await this.classroom.checkClassFeature(classId, 'enable_economy');
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /**
   * Append to the shared point ledger.
   *
   * Not fatal: the balance has already moved, and a missing history row is a smaller
   * problem than a money operation reporting failure after it succeeded. It is logged
   * by the boundary, so a failure is visible rather than silent.
   */
  private async ledger(studentId: number, type: string, amount: number, description: string): Promise<void> {
    await this.classroom.recordStudentLedgerEntry({ studentId, type, amount, description });
  }

  private getStockOrThrow(stockId: number) {
    const stock = this.repository.getStock(stockId);
    if (!stock) {
      throw new ApiError(404, 'Stock not found');
    }
    return stock;
  }
}
