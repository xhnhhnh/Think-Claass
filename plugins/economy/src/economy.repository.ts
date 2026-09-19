/**
 * Economy repository.
 *
 * Takes the plugin's ownership-checked `DbApi` instead of the raw connection, so
 * every statement is validated against `data.adopted` in the manifest. The three
 * tables carry their legacy names (declared as `adopted`, not `tables`) because
 * renaming them would change the JSON the frontend reads - see economy.types.ts.
 *
 * The `students` table is deliberately absent: the balance lives behind
 * `classroom.public`, because a second writer would make classroom's ownership of
 * `students` a lie.
 */

import type { BankAccountDto, PortfolioItemDto, StockDto } from '@thinkclass/contracts/domains/economy';
import type { DbApi } from '@thinkclass/plugin-sdk';

import type { EconomyHoldingRow, EconomyRepository, StockPayload, StockPricePayload } from './economy.types.js';

/** `trend_history` is a JSON string; a malformed one must not break the chart. */
function parseTrendHistory(history: string | null | undefined, fallbackPrice: number): number[] {
  if (!history) return [fallbackPrice];
  try {
    const parsed = JSON.parse(history);
    return Array.isArray(parsed) ? (parsed as number[]) : [fallbackPrice];
  } catch {
    return [fallbackPrice];
  }
}

export function createEconomyRepository(db: DbApi): EconomyRepository {
  return {
    getOrCreateBankAccount(studentId) {
      const existing = db.get<BankAccountDto>(`SELECT * FROM bank_accounts WHERE student_id = ?`, [studentId]);
      if (existing) return existing;

      db.run(`INSERT INTO bank_accounts (student_id) VALUES (?)`, [studentId]);
      return db.get<BankAccountDto>(`SELECT * FROM bank_accounts WHERE student_id = ?`, [studentId]) as BankAccountDto;
    },

    listStocks(classId) {
      return db.query<StockDto>(`SELECT * FROM stocks WHERE class_id = ? ORDER BY id DESC`, [classId]);
    },

    getStock(stockId) {
      return db.get<StockDto>(`SELECT * FROM stocks WHERE id = ?`, [stockId]) ?? null;
    },

    listPortfolio(studentId) {
      return db.query<PortfolioItemDto>(
        `SELECT ss.*, s.name, s.symbol, s.current_price
           FROM student_stocks ss
           JOIN stocks s ON ss.stock_id = s.id
          WHERE ss.student_id = ? AND ss.shares > 0`,
        [studentId],
      );
    },

    updateBankDeposit(studentId, depositAmount) {
      db.run(`UPDATE bank_accounts SET deposit_amount = ? WHERE student_id = ?`, [depositAmount, studentId]);
    },

    getHolding(studentId, stockId) {
      return (
        db.get<EconomyHoldingRow>(
          `SELECT id, shares, average_buy_price FROM student_stocks WHERE student_id = ? AND stock_id = ?`,
          [studentId, stockId],
        ) ?? null
      );
    },

    upsertHolding(studentId, stockId, shares, averageBuyPrice) {
      const existing = this.getHolding(studentId, stockId);
      if (existing) {
        db.run(`UPDATE student_stocks SET shares = ?, average_buy_price = ? WHERE id = ?`, [
          shares,
          averageBuyPrice,
          existing.id,
        ]);
        return;
      }

      db.run(`INSERT INTO student_stocks (student_id, stock_id, shares, average_buy_price) VALUES (?, ?, ?, ?)`, [
        studentId,
        stockId,
        shares,
        averageBuyPrice,
      ]);
    },

    deleteHolding(studentId, stockId) {
      db.run(`DELETE FROM student_stocks WHERE student_id = ? AND stock_id = ?`, [studentId, stockId]);
    },

    updateHoldingShares(holdingId, shares) {
      db.run(`UPDATE student_stocks SET shares = ? WHERE id = ?`, [shares, holdingId]);
    },

    triggerInterest() {
      db.run(
        `UPDATE bank_accounts
            SET deposit_amount = deposit_amount + CAST(deposit_amount * interest_rate AS INTEGER),
                last_interest_date = CURRENT_TIMESTAMP
          WHERE deposit_amount > 0`,
      );
    },

    createStock(input) {
      const result = db.run(
        `INSERT INTO stocks (class_id, name, symbol, current_price, trend_history) VALUES (?, ?, ?, ?, ?)`,
        [input.class_id, input.name, input.symbol, input.current_price, JSON.stringify([input.current_price])],
      );
      return Number(result.lastInsertRowid);
    },

    updateStock(stockId, input) {
      const stock = this.getStock(stockId);
      if (!stock) return;

      const nextPrice = 'new_price' in input ? Number(input.new_price) : (input.current_price ?? stock.current_price);
      const history = parseTrendHistory(stock.trend_history, stock.current_price);
      if (nextPrice !== stock.current_price) {
        history.push(nextPrice);
        if (history.length > 20) history.shift();
      }

      db.run(`UPDATE stocks SET name = ?, symbol = ?, current_price = ?, trend_history = ? WHERE id = ?`, [
        'name' in input && input.name !== undefined ? input.name : stock.name,
        'symbol' in input && input.symbol !== undefined ? input.symbol : stock.symbol,
        nextPrice,
        JSON.stringify(history),
        stockId,
      ]);
    },

    deleteStock(stockId) {
      // Both statements in one transaction: a half-deleted stock would leave
      // holdings pointing at a row that no longer exists.
      db.tx((tx) => {
        tx.run(`DELETE FROM student_stocks WHERE stock_id = ?`, [stockId]);
        tx.run(`DELETE FROM stocks WHERE id = ?`, [stockId]);
      });
    },
  };
}
