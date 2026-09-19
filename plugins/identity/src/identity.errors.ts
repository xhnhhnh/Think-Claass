/**
 * Error translation for the identity routes.
 *
 * The legacy module translated its own `ApiError` (`api/utils/apiError.ts`) into a Nest
 * `HttpException` carrying `{ success: false, message }`. Inside the plugin the service throws the
 * *kernel's* `ApiError` - a different class - which the composition's global filter renders into
 * exactly the same body, so there is nothing left to build here.
 *
 * What remains is the fallback for an *unexpected* error. The legacy `throwAuthError` used
 * `'Internal Server Error'` for anything that was not an `ApiError`/`HttpException`, and that
 * string is part of the endpoint contract, so it is reproduced rather than "improved".
 */

import { HttpException } from '@nestjs/common';

import { ApiError } from '@thinkclass/kernel';

export function throwIdentityError(error: unknown): never {
  if (error instanceof HttpException) throw error;
  if (error instanceof ApiError) throw error;

  throw new ApiError(500, 'Internal Server Error');
}
