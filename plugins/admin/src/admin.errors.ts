/**
 * Error translation for the admin console's routes.
 *
 * The pre-migration version (`api/modules/admin/admin.errors.ts`) turned anything that was not
 * already a Nest `HttpException` into one, because the legacy composition had no global filter that
 * understood the application's own `ApiError`. Both compositions now install the kernel's filter,
 * which renders `ApiError` *and* Nest exceptions into the same envelope - so the plugin throws the
 * kernel's `ApiError` directly and only passes through what Nest itself raised.
 *
 * Nest's exceptions still pass through untouched on purpose: `FileInterceptor` (the database import
 * route) raises `PayloadTooLargeException`, and re-wrapping it into a 500 would change a status the
 * frontend already handles.
 */

import { HttpException } from '@nestjs/common';

import { ApiError } from '@thinkclass/kernel';

type FallbackMessage = string | ((error: unknown) => string);

export function throwAdminError(error: unknown, fallbackMessage: FallbackMessage = 'Internal Server Error'): never {
  if (error instanceof HttpException || error instanceof ApiError) throw error;

  const message = typeof fallbackMessage === 'function' ? fallbackMessage(error) : fallbackMessage;
  throw new ApiError(500, message);
}
