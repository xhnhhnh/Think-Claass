import { HttpException, HttpStatus } from '@nestjs/common';

import { ApiError } from '../../utils/apiError.js';

type FallbackMessage = string | ((error: unknown) => string);

export function classroomHttpError(error: unknown, fallbackMessage: FallbackMessage = 'Internal Server Error'): HttpException {
  if (error instanceof HttpException) return error;
  if (error instanceof ApiError) {
    return new HttpException({ success: false, message: error.message }, error.statusCode);
  }

  const message = typeof fallbackMessage === 'function'
    ? fallbackMessage(error)
    : fallbackMessage;
  return new HttpException({ success: false, message }, HttpStatus.INTERNAL_SERVER_ERROR);
}

export function throwClassroomError(error: unknown, fallbackMessage?: FallbackMessage): never {
  throw classroomHttpError(error, fallbackMessage);
}
