/**
 * Error translation for the classroom routes.
 *
 * The legacy module translated the application's own `ApiError` (`api/utils/apiError.ts`)
 * into a Nest `HttpException` carrying `{ success: false, message }`. Inside the plugin the
 * service throws the *kernel's* `ApiError` (`@thinkclass/kernel`) - a different class, which
 * the kernel's global filter renders into exactly the same body:
 *
 *     { success: false, message }        status = error.status
 *
 * So this helper no longer builds the envelope; it only decides what an *unexpected* error
 * becomes. The fallback strings stay per-controller, because the legacy controllers chose
 * different ones: `'Server error'` for groups/presets, the error's own `message` for
 * attendance/leaves, and `'Internal Server Error'` everywhere else.
 *
 * The kernel `ApiError` is constructed without `code`/`details` on purpose: those would add
 * keys to the body, and the envelope is part of the endpoint contract.
 */

import { HttpException } from '@nestjs/common';

import { ApiError } from '@thinkclass/kernel';

export type FallbackMessage = string | ((error: unknown) => string);

export function throwClassroomError(error: unknown, fallbackMessage: FallbackMessage = 'Internal Server Error'): never {
  // Nest exceptions already carry their own envelope through the global filter.
  if (error instanceof HttpException) throw error;
  // Kernel ApiError: 400/403/404/409/500 with the domain's own message.
  if (error instanceof ApiError) throw error;

  const message = typeof fallbackMessage === 'function' ? fallbackMessage(error) : fallbackMessage;
  throw new ApiError(500, message);
}
