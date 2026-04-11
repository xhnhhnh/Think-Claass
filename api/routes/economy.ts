import express, { Request, Response } from 'express';
import db from '../db.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled } from '../utils/classFeatures.js';

const router = express.Router();

// ========================
// BANK ENDPOINTS
// ========================

// Get bank account info
router.get('/bank/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_economy');
    let account = db.prepare('SELECT * FROM bank_accounts WHERE student_id = ?').get(studentId);
    
    if (!account) {
      db.prepare('INSERT INTO bank_accounts (student_id) VALUES (?)').run(studentId);
      account = db.prepare('SELECT * FROM bank_accounts WHERE student_id = ?').get(studentId);
    }
    
    res.json({ success: true, account });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Deposit points
router.post('/bank/deposit/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_economy');
    const tx = db.transaction(() => {
      const student = db.prepare('SELECT available_points FROM students WHERE id = ?').get(studentId) as any;
      if (!student || student.available_points < amount) throw new Error('余额不足');

      db.prepare('UPDATE students SET available_points = available_points - ? WHERE id = ?').run(amount, studentId);
      db.prepare('UPDATE bank_accounts SET deposit_amount = deposit_amount + ? WHERE student_id = ?').run(amount, studentId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'BANK_DEPOSIT', -amount, `Deposited into Bank`);
    });
    tx();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Withdraw points
router.post('/bank/withdraw/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_economy');
    const tx = db.transaction(() => {
      const account = db.prepare('SELECT deposit_amount FROM bank_accounts WHERE student_id = ?').get(studentId) as any;
      if (!account || account.deposit_amount < amount) throw new Error('存款不足');

      db.prepare('UPDATE bank_accounts SET deposit_amount = deposit_amount - ? WHERE student_id = ?').run(amount, studentId);
      db.prepare('UPDATE students SET available_points = available_points + ? WHERE id = ?').run(amount, studentId);
      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'BANK_WITHDRAW', amount, `Withdrew from Bank`);
    });
    tx();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Trigger daily interest (Simulated or Cron)
router.post('/bank/trigger-interest', (req: Request, res: Response) => {
  try {
    db.prepare(`
      UPDATE bank_accounts 
      SET deposit_amount = deposit_amount + CAST(deposit_amount * interest_rate AS INTEGER),
          last_interest_date = CURRENT_TIMESTAMP
      WHERE deposit_amount > 0
    `).run();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================
// STOCK MARKET ENDPOINTS
// ========================

// Get all stocks for a class
router.get('/stocks/:classId', (req: Request, res: Response) => {
  const { classId } = req.params;
  try {
    assertClassFeatureEnabled(Number(classId), 'enable_economy');
    const stocks = db.prepare('SELECT * FROM stocks WHERE class_id = ?').all(classId);
    res.json({ success: true, stocks });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get student portfolio
router.get('/portfolio/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_economy');
    const portfolio = db.prepare(`
      SELECT ss.*, s.name, s.symbol, s.current_price 
      FROM student_stocks ss
      JOIN stocks s ON ss.stock_id = s.id
      WHERE ss.student_id = ? AND ss.shares > 0
    `).all(studentId);
    res.json({ success: true, portfolio });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Buy stock
router.post('/stocks/buy/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { stockId, shares } = req.body;
  if (!stockId || !shares || shares <= 0) return res.status(400).json({ success: false, message: 'Invalid request' });

  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_economy');
    const tx = db.transaction(() => {
      const student = db.prepare('SELECT available_points FROM students WHERE id = ?').get(studentId) as any;
      const stock = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId) as any;
      if (!stock) throw new Error('Stock not found');
      
      const totalCost = stock.current_price * shares;
      if (student.available_points < totalCost) throw new Error('积分不足');

      db.prepare('UPDATE students SET available_points = available_points - ? WHERE id = ?').run(totalCost, studentId);
      
      const existing = db.prepare('SELECT * FROM student_stocks WHERE student_id = ? AND stock_id = ?').get(studentId, stockId) as any;
      if (existing) {
        const newShares = existing.shares + shares;
        const newAvg = ((existing.shares * existing.average_buy_price) + totalCost) / newShares;
        db.prepare('UPDATE student_stocks SET shares = ?, average_buy_price = ? WHERE id = ?').run(newShares, newAvg, existing.id);
      } else {
        db.prepare('INSERT INTO student_stocks (student_id, stock_id, shares, average_buy_price) VALUES (?, ?, ?, ?)')
          .run(studentId, stockId, shares, stock.current_price);
      }

      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'STOCK_BUY', -totalCost, `Bought ${shares} shares of ${stock.symbol}`);
    });
    tx();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Sell stock
router.post('/stocks/sell/:studentId', (req: Request, res: Response) => {
  const { studentId } = req.params;
  const { stockId, shares } = req.body;
  if (!stockId || !shares || shares <= 0) return res.status(400).json({ success: false, message: 'Invalid request' });

  try {
    assertStudentFeatureEnabled(Number(studentId), 'enable_economy');
    const tx = db.transaction(() => {
      const stock = db.prepare('SELECT * FROM stocks WHERE id = ?').get(stockId) as any;
      const holding = db.prepare('SELECT * FROM student_stocks WHERE student_id = ? AND stock_id = ?').get(studentId, stockId) as any;
      
      if (!holding || holding.shares < shares) throw new Error('持仓不足');
      
      const totalValue = stock.current_price * shares;

      db.prepare('UPDATE students SET available_points = available_points + ? WHERE id = ?').run(totalValue, studentId);
      db.prepare('UPDATE student_stocks SET shares = shares - ? WHERE id = ?').run(shares, holding.id);

      db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
        .run(studentId, 'STOCK_SELL', totalValue, `Sold ${shares} shares of ${stock.symbol}`);
    });
    tx();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Teacher manipulate stock prices
router.post('/teacher/stocks', (req: Request, res: Response) => {
  const { class_id, name, symbol, current_price } = req.body;
  try {
    assertClassFeatureEnabled(Number(class_id), 'enable_economy');
    db.prepare('INSERT INTO stocks (class_id, name, symbol, current_price, trend_history) VALUES (?, ?, ?, ?, ?)')
      .run(class_id, name, symbol, current_price, JSON.stringify([current_price]));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/teacher/stocks/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { new_price } = req.body;
  try {
    const stock = db.prepare('SELECT class_id, trend_history FROM stocks WHERE id = ?').get(id) as any;
    if (!stock) {
      return res.status(404).json({ success: false, message: 'Stock not found' });
    }
    assertClassFeatureEnabled(Number(stock.class_id), 'enable_economy');
    let history = [];
    if (stock && stock.trend_history) {
      try { history = JSON.parse(stock.trend_history); } catch(e){}
    }
    history.push(new_price);
    if (history.length > 20) history.shift(); // Keep last 20 points
    
    db.prepare('UPDATE stocks SET current_price = ?, trend_history = ? WHERE id = ?').run(new_price, JSON.stringify(history), id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
