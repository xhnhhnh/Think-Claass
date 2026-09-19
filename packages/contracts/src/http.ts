/**
 * HTTP envelope shared by every endpoint in the system.
 *
 * Migrated from `src/shared/core/contracts.ts`, which was reachable only from the
 * frontend source tree while the backend imported it through relative
 * `../../../src/...` paths (16 such imports). This package becomes the single
 * neutral home for that vocabulary.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailure {
  success: false;
  message: string;
  code?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export interface PageRequest {
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Health payload returned by `/api/health`. */
export interface HealthStatus {
  success: true;
  message: string;
  kernel: {
    version: string;
    apiVersion: number;
    uptimeMs: number;
    plugins: { total: number; active: number; degraded: number };
  };
}
