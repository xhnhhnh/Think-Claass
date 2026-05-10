import { Router, type Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import type { EconomyService } from './economy.service.js';

function ok<T>(res: Response, data: T, legacyPayload: Record<string, unknown> = {}) {
  res.json({ success: true, data, ...legacyPayload });
}

export function createEconomyRouter(service: EconomyService) {
  const router = Router();

  router.get(
    '/students/:studentId/overview',
    asyncHandler(async (req, res) => {
      const data = service.getStudentOverview(req.params.studentId, req.query.classId);
      ok(res, data);
    }),
  );

  router.get(
    '/students/:studentId/bank',
    asyncHandler(async (req, res) => {
      const account = service.getBankAccount(req.params.studentId);
      ok(res, { account }, { account });
    }),
  );

  router.post(
    '/students/:studentId/bank/deposits',
    asyncHandler(async (req, res) => {
      ok(res, service.deposit(req.params.studentId, req.body));
    }),
  );

  router.post(
    '/students/:studentId/bank/withdrawals',
    asyncHandler(async (req, res) => {
      ok(res, service.withdraw(req.params.studentId, req.body));
    }),
  );

  router.get(
    '/classes/:classId/stocks',
    asyncHandler(async (req, res) => {
      const stocks = service.listStocks(req.params.classId);
      ok(res, { stocks }, { stocks });
    }),
  );

  router.get(
    '/students/:studentId/portfolio',
    asyncHandler(async (req, res) => {
      const portfolio = service.listPortfolio(req.params.studentId);
      ok(res, { portfolio }, { portfolio });
    }),
  );

  router.post(
    '/students/:studentId/stocks/buy',
    asyncHandler(async (req, res) => {
      ok(res, service.buyStock(req.params.studentId, req.body));
    }),
  );

  router.post(
    '/students/:studentId/stocks/sell',
    asyncHandler(async (req, res) => {
      ok(res, service.sellStock(req.params.studentId, req.body));
    }),
  );

  router.post(
    '/bank/interest',
    asyncHandler(async (_req, res) => {
      ok(res, service.triggerInterest());
    }),
  );

  router.post(
    '/teacher/stocks',
    asyncHandler(async (req, res) => {
      ok(res, service.createStock(req.body));
    }),
  );

  router.put(
    '/teacher/stocks/:id',
    asyncHandler(async (req, res) => {
      ok(res, service.updateStock(req.params.id, req.body));
    }),
  );

  router.delete(
    '/teacher/stocks/:id',
    asyncHandler(async (req, res) => {
      ok(res, service.deleteStock(req.params.id));
    }),
  );

  return router;
}
