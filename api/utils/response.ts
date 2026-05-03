import type { Response } from 'express';

type JsonObject = Record<string, unknown>;

export function sendSuccess(res: Response, payload: JsonObject = {}) {
  return res.json({ success: true, ...payload });
}

