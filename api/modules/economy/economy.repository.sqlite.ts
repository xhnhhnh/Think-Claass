import db from '../../db.js';
import type {
  BankAccountDto,
  EconomyRepository,
  EconomyStudentRow,
  PortfolioItemDto,
  StockDto,
  StockPayload,
  StockPricePayload,
} from './economy.types.js';

function parseTrendHistory(history: string | null | undefined, fallbackPrice: number) {
  if (!history) return [fallbackPrice];
  try {
    const parsed = JSON.parse(history);
    return Array.isArray(parsed) ? parsed : [fallbackPrice];
  } catch {
    return [fallbackPrice];
  }
}

export class SqliteEconomyRepository implements EconomyRepository {
  transaction<T>(fn: () => T): T {
    return db.transaction(fn)();
  }

  getStudent(studentId: number) {
    return db
      .prepare('SELECT id, class_id, total_points, available_points FROM students WHERE id = ?')
      .get(studentId) as EconomyStudentRow | null;
  }

  getOrCreateBankAccount(studentId: number) {
    const existing = db.prepare('SELECT * FROM bank_accounts WHERE student_id = ?').get(studentId) as BankAccountDto | undefined;
    if (existing) return existing;

    db.prepare('INSERT INTO bank_accounts (student_id) VALUES (?)').run(studentId);
    return db.prepare('SELECT * FROM bank_accounts WHERE student_id = ?').get(studentId) as BankAccountDto;
  }

  listStocks(classId: number) {
    return db.prepare('SELECT * FROM stocks WHERE class_id = ? ORDER BY id DESC').all(classId) as StockDto[];
  }

  getStock(stockId: number) {
    return db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId) as StockDto | null;
  }

  listPortfolio(studentId: number) {
    return db
      .prepare(
        `
        SELECT ss.*, s.name, s.symbol, s.current_price
        FROM student_stocks ss
        JOIN stocks s ON ss.stock_id = s.id
        WHERE ss.student_id = ? AND ss.shares > 0
      `,
      )
      .all(studentId) as PortfolioItemDto[];
  }

  updateStudentPoints(studentId: number, totalPoints: number, availablePoints: number) {
    db.prepare('UPDATE students SET total_points = ?, available_points = ? WHERE id = ?').run(totalPoints, availablePoints, studentId);
  }

  updateStudentAvailablePoints(studentId: number, availablePoints: number) {
    db.prepare('UPDATE students SET available_points = ? WHERE id = ?').run(availablePoints, studentId);
  }

  updateBankDeposit(studentId: number, depositAmount: number) {
    db.prepare('UPDATE bank_accounts SET deposit_amount = ? WHERE student_id = ?').run(depositAmount, studentId);
  }

  getHolding(studentId: number, stockId: number) {
    return db
      .prepare('SELECT id, shares, average_buy_price FROM student_stocks WHERE student_id = ? AND stock_id = ?')
      .get(studentId, stockId) as { id: number; shares: number; average_buy_price: number } | null;
  }

  upsertHolding(studentId: number, stockId: number, shares: number, averageBuyPrice: number) {
    const existing = this.getHolding(studentId, stockId);
    if (existing) {
      db.prepare('UPDATE student_stocks SET shares = ?, average_buy_price = ? WHERE id = ?').run(shares, averageBuyPrice, existing.id);
      return;
    }

    db.prepare('INSERT INTO student_stocks (student_id, stock_id, shares, average_buy_price) VALUES (?, ?, ?, ?)').run(
      studentId,
      stockId,
      shares,
      averageBuyPrice,
    );
  }

  updateHoldingShares(holdingId: number, shares: number) {
    db.prepare('UPDATE student_stocks SET shares = ? WHERE id = ?').run(shares, holdingId);
  }

  insertRecord(studentId: number, type: string, amount: number, description: string) {
    db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(studentId, type, amount, description);
  }

  triggerInterest() {
    db.prepare(
      `
      UPDATE bank_accounts
      SET deposit_amount = deposit_amount + CAST(deposit_amount * interest_rate AS INTEGER),
          last_interest_date = CURRENT_TIMESTAMP
      WHERE deposit_amount > 0
    `,
    ).run();
  }

  createStock(input: StockPayload) {
    const result = db
      .prepare('INSERT INTO stocks (class_id, name, symbol, current_price, trend_history) VALUES (?, ?, ?, ?, ?)')
      .run(input.class_id, input.name, input.symbol, input.current_price, JSON.stringify([input.current_price]));
    return Number(result.lastInsertRowid);
  }

  updateStock(stockId: number, input: Partial<StockPayload> | StockPricePayload) {
    const stock = this.getStock(stockId);
    if (!stock) return;

    const nextPrice = 'new_price' in input ? Number(input.new_price) : input.current_price ?? stock.current_price;
    const history = parseTrendHistory(stock.trend_history, stock.current_price);
    if (nextPrice !== stock.current_price) {
      history.push(nextPrice);
      if (history.length > 20) history.shift();
    }

    db.prepare('UPDATE stocks SET name = ?, symbol = ?, current_price = ?, trend_history = ? WHERE id = ?').run(
      'name' in input && input.name !== undefined ? input.name : stock.name,
      'symbol' in input && input.symbol !== undefined ? input.symbol : stock.symbol,
      nextPrice,
      JSON.stringify(history),
      stockId,
    );
  }

  deleteStock(stockId: number) {
    db.prepare('DELETE FROM student_stocks WHERE stock_id = ?').run(stockId);
    db.prepare('DELETE FROM stocks WHERE id = ?').run(stockId);
  }
}
