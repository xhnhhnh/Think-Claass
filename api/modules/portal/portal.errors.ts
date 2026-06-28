import { HttpException, HttpStatus } from '@nestjs/common';

export function portalHttpError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  return new HttpException({ success: false, message }, HttpStatus.INTERNAL_SERVER_ERROR);
}

export function throwPortalError(error: unknown): never {
  throw portalHttpError(error);
}
