import { HttpException, HttpStatus } from '@nestjs/common';

import { ApiError } from '../../utils/apiError.js';

export class TaskTreeLegacyError extends Error {}

export function collaborationHttpError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  if (error instanceof ApiError) {
    return new HttpException({ success: false, message: error.message }, error.statusCode);
  }

  return new HttpException({ success: false, message: 'Internal Server Error' }, HttpStatus.INTERNAL_SERVER_ERROR);
}

export function taskTreeHttpError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  if (error instanceof ApiError) {
    return new HttpException({ success: false, message: error.message }, error.statusCode);
  }

  const message = error instanceof Error ? error.message : 'Internal Server Error';
  return new HttpException({ success: false, message }, HttpStatus.INTERNAL_SERVER_ERROR);
}

export function throwCollaborationError(error: unknown): never {
  throw collaborationHttpError(error);
}

export function throwTaskTreeError(error: unknown): never {
  throw taskTreeHttpError(error);
}

export function asTaskTreeLegacyError(error: unknown): never {
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  throw new TaskTreeLegacyError(message);
}
