/**
 * Domain HTTP error translation.
 *
 * Moved from `api/modules/game/game.errors.ts` in P4.3, when the `game` folder was
 * dissolved and its six domains became independent modules.
 */

import { HttpException, HttpStatus } from '@nestjs/common';

import { ApiError } from './apiError.js';

export function gameHttpError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  if (error instanceof ApiError) {
    return new HttpException({ success: false, message: error.message }, error.statusCode);
  }

  const message = error instanceof Error ? error.message : 'Internal Server Error';
  return new HttpException({ success: false, message }, HttpStatus.INTERNAL_SERVER_ERROR);
}

export function throwGameError(error: unknown): never {
  throw gameHttpError(error);
}
