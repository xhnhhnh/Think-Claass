/**
 * Uniform error and response envelope.
 *
 * The baseline throws a mix of `ApiError`, Nest's `HttpException`, plain `Error`
 * and raw `{ success: false }` literals, and each module has its own
 * `xxxHttpError()` translator. The kernel owns one shape and one translator; a
 * plugin throws `ApiError` and the kernel renders it.
 */

import type { NextFunction, Request, Response } from 'express';

/** Error carrying an HTTP status. Compatible with the legacy `api/utils/apiError.ts`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  /** Extra fields merged into the response body (validation details, etc). */
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, message: string, options: { code?: string; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code;
    this.details = options.details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Alias for `status`. The legacy `api/utils/apiError.ts` (and every module that
   * throws it) uses `statusCode`; supporting both lets migrated and unmigrated code
   * coexist without a flag day.
   */
  get statusCode(): number {
    return this.status;
  }
}

export function badRequest(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(400, message, { code: 'BAD_REQUEST', details });
}

export function unauthorized(message = '未登录或登录已过期'): ApiError {
  return new ApiError(401, message, { code: 'UNAUTHORIZED' });
}

export function forbidden(message = '无权限执行该操作'): ApiError {
  return new ApiError(403, message, { code: 'FORBIDDEN' });
}

export function notFound(message = '资源不存在'): ApiError {
  return new ApiError(404, message, { code: 'NOT_FOUND' });
}

export function conflict(message: string): ApiError {
  return new ApiError(409, message, { code: 'CONFLICT' });
}

/** Render an error into the shared envelope. */
export function renderError(error: unknown, fallbackStatus = 500): { status: number; body: Record<string, unknown> } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        success: false,
        message: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }

  // Legacy `api/utils/apiError.ts` throws `{ statusCode }`; Nest throws
  // `HttpException` with `getStatus()`. Both must render into the shared envelope.
  const maybeHttp = error as {
    getStatus?: () => number;
    getResponse?: () => unknown;
    status?: number;
    statusCode?: number;
  };
  if (typeof maybeHttp?.getStatus === 'function') {
    const status = maybeHttp.getStatus() || fallbackStatus;
    const response = maybeHttp.getResponse?.();
    const message =
      typeof response === 'string'
        ? response
        : ((response as { message?: string } | undefined)?.message ?? '请求处理失败');
    return { status, body: { success: false, message } };
  }
  const explicitStatus = maybeHttp?.status ?? maybeHttp?.statusCode;
  if (typeof explicitStatus === 'number' && explicitStatus >= 400 && explicitStatus < 600) {
    return { status: explicitStatus, body: { success: false, message: (error as Error).message } };
  }

  return { status: fallbackStatus, body: { success: false, message: '服务器内部错误' } };
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export interface ErrorMiddlewareOptions {
  logger?: { error(message: string, fields?: Record<string, unknown>): void };
  /** Include the stack/message for unexpected errors. Off in production. */
  exposeInternalErrors?: boolean;
}

/** Terminal error middleware. Must be registered last. */
export function createErrorMiddleware(options: ErrorMiddlewareOptions = {}) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = renderError(error);
    const requestId = (req as Request & { requestId?: string }).requestId;

    if (status >= 500) {
      options.logger?.error('request failed', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (options.exposeInternalErrors && error instanceof Error) {
        body.message = error.message;
      }
    }

    if (res.headersSent) return;
    res.status(status).json(body);
  };
}
