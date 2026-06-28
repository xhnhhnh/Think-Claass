import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiError } from '../../utils/apiError.js';

export function learningHttpError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  if (error instanceof ApiError) {
    return new HttpException(
      { success: false, message: error.message },
      error.statusCode,
    );
  }

  const message = error instanceof Error ? error.message : 'Internal Server Error';
  return new HttpException(
    { success: false, message },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

export function throwLearningError(error: unknown): never {
  throw learningHttpError(error);
}

