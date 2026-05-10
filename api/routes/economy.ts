import express from 'express';

import { EconomyService } from '../modules/economy/economy.service.js';
import { SqliteEconomyRepository } from '../modules/economy/economy.repository.sqlite.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
const service = new EconomyService(new SqliteEconomyRepository());

router.get(
  '/bank/:studentId',
  asyncHandler(async (req, res) => {
    const account = service.getBankAccount(req.params.studentId);
    res.json({ success: true, account });
  }),
);

router.post(
  '/bank/deposit/:studentId',
  asyncHandler(async (req, res) => {
    await service.deposit(req.params.studentId, req.body);
    res.json({ success: true });
  }),
);

router.post(
  '/bank/withdraw/:studentId',
  asyncHandler(async (req, res) => {
    await service.withdraw(req.params.studentId, req.body);
    res.json({ success: true });
  }),
);

router.post(
  '/bank/trigger-interest',
  asyncHandler(async (_req, res) => {
    service.triggerInterest();
    res.json({ success: true });
  }),
);

router.get(
  '/stocks/:classId',
  asyncHandler(async (req, res) => {
    const stocks = service.listStocks(req.params.classId);
    res.json({ success: true, stocks });
  }),
);

router.get(
  '/portfolio/:studentId',
  asyncHandler(async (req, res) => {
    const portfolio = service.listPortfolio(req.params.studentId);
    res.json({ success: true, portfolio });
  }),
);

router.post(
  '/stocks/buy/:studentId',
  asyncHandler(async (req, res) => {
    await service.buyStock(req.params.studentId, req.body);
    res.json({ success: true });
  }),
);

router.post(
  '/stocks/sell/:studentId',
  asyncHandler(async (req, res) => {
    await service.sellStock(req.params.studentId, req.body);
    res.json({ success: true });
  }),
);

router.post(
  '/teacher/stocks',
  asyncHandler(async (req, res) => {
    await service.createStock(req.body);
    res.json({ success: true });
  }),
);

router.put(
  '/teacher/stocks/:id',
  asyncHandler(async (req, res) => {
    await service.updateStock(req.params.id, req.body);
    res.json({ success: true });
  }),
);

router.delete(
  '/teacher/stocks/:id',
  asyncHandler(async (req, res) => {
    await service.deleteStock(req.params.id);
    res.json({ success: true });
  }),
);

export default router;
