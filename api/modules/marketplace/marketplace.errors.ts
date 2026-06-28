import { HttpException, HttpStatus } from '@nestjs/common';

import { ApiError } from '../../utils/apiError.js';

export function marketplaceHttpError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  if (error instanceof ApiError) {
    return new HttpException({ success: false, message: error.message }, error.statusCode);
  }

  return new HttpException({ success: false, message: 'Internal Server Error' }, HttpStatus.INTERNAL_SERVER_ERROR);
}

export function throwMarketplaceError(error: unknown): never {
  throw marketplaceHttpError(error);
}
