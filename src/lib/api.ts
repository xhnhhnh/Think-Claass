import axios, { AxiosError, AxiosHeaders, AxiosRequestConfig } from 'axios';
import { toast } from 'sonner';

import { ADMIN_PATH } from '@/constants';
import { useStore } from '@/store/useStore';

/**
 * What a 401 means for this request.
 *
 * `session` is the default: the token is gone and the browser has to sign in again. `credential`
 * is for the sign-in calls themselves - a 401 there is "wrong username/password/role", not an
 * expired session, and treating it as the latter used to show 「登录已过期」 to somebody who had
 * simply mistyped a password.
 */
export type AuthFailure = 'session' | 'credential';

interface ApiOptions extends AxiosRequestConfig {
  showError?: boolean;
  authFailure?: AuthFailure;
}

export class FetchError extends Error {
  status: number;
  data: any;

  constructor(status: number, data: any) {
    super(data?.message || '请求失败');
    this.status = status;
    this.data = data;
    this.name = 'FetchError';
  }
}

// 简单的防抖机制，避免相同错误信息在短时间内疯狂弹窗
let lastErrorMsg = '';
let lastErrorTime = 0;
const TOAST_DEBOUNCE_MS = 2000;

const showErrorToast = (message: string) => {
  const now = Date.now();
  if (message === lastErrorMsg && now - lastErrorTime < TOAST_DEBOUNCE_MS) {
    return; // 短时间内相同错误不再弹出
  }
  lastErrorMsg = message;
  lastErrorTime = now;
  toast.error(message);
};

/** The server's own 中文解释, when it sent one. */
function serverMessageOf(error: any): string | undefined {
  const message = error?.response?.data?.message ?? error?.data?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : undefined;
}

/**
 * Turn any thrown request failure into the sentence a person should read.
 *
 * The rule the audit found broken: a page used to substitute 「网络错误」 for every refusal,
 * including 400/403 answers that explained exactly what was wrong. This helper is the one
 * translator; pages use it when they own an inline error, and `api()` uses it for its toast.
 * An Axios internal message ("Request failed with status code 403") is never returned.
 */
export function apiErrorMessage(error: unknown, fallback = '请求失败，请重试'): string {
  if (error instanceof FetchError) {
    return error.message || fallback;
  }

  const anyError = error as any;
  const serverMessage = serverMessageOf(error);
  if (serverMessage) return serverMessage;

  const code = String(anyError?.code ?? '');
  const raw = typeof anyError?.message === 'string' ? anyError.message : '';
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(raw)) {
    return '请求超时，请检查网络后重试';
  }
  // An Axios error with no response never reached the server. A plain Error (a client-side
  // guard such as 「学生信息不存在」) has no `isAxiosError`, so its message is already user copy.
  if (anyError?.isAxiosError && !anyError?.response) {
    return '网络连接失败，请检查网络后重试';
  }
  if (error instanceof Error && raw && !/^Request failed with status code \d+$/.test(raw)) {
    return raw;
  }
  return fallback;
}

/**
 * Send the browser back to the right login page after a 401.
 *
 * Which one depends on where the user was: an expired session in the admin console must land on
 * the admin login, not the student one. `ADMIN_PATH` is the runtime-injected value, so a
 * deployment that renamed the console still gets the right target.
 *
 * Guarded against a redirect loop - a 401 raised *by* the login route must not bounce the page
 * that is already showing the login form.
 */
function redirectToLogin() {
  if (typeof window === 'undefined') return;

  const path = window.location.pathname;
  const target = path.startsWith(ADMIN_PATH) ? `${ADMIN_PATH}/login` : '/login';
  if (path === target) return;

  window.location.assign(target);
}

/**
 * 401 and 403 are different problems and used to share one message.
 *
 * `401` normally means the session is gone: clear it, and send the user to log in - the app
 * previously left the stale user in the store, so every subsequent request failed the same way
 * while the UI kept rendering as if signed in. The one exception is `authFailure: 'credential'`:
 * the sign-in endpoints answer 401 for a wrong password or a wrong role, and telling that person
 * their session expired is a false diagnosis.
 *
 * `403` means the session is perfectly valid and the account simply may not do this. Telling that
 * user "登录已过期或无权限，请重新登录" was actively misleading: it hid the real answer (a role or
 * ownership decision on the server) behind a symptom that never happens, and made authorization
 * defects look like a login problem. The server's own sentence is preferred when it sent one.
 */
function handleAuthError(
  status: number | undefined,
  showError: boolean,
  authFailure: AuthFailure,
  serverMessage?: string,
) {
  if (status === 401) {
    if (authFailure === 'credential') {
      if (showError) showErrorToast(serverMessage || '账号或密码错误，请重试');
      return true;
    }

    useStore.getState().logout();
    if (showError) showErrorToast('登录已过期，请重新登录');
    redirectToLogin();
    return true;
  }

  if (status === 403) {
    if (showError) showErrorToast(serverMessage || '当前账号无权访问该功能');
    return true;
  }

  return false;
}

const normalizeApiBaseUrl = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, '');
};

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

// 创建 axios 实例
const axiosInstance = axios.create({
  // 默认复用当前域名和 Vite 的 /api 代理；分离部署时可配置 VITE_API_BASE_URL。
  baseURL: apiBaseUrl,
  timeout: 15000,
});

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    const { user, token } = useStore.getState();
    const headers = new AxiosHeaders(config.headers);

    // Verified session first: the server resolves the actor from the token and
    // ignores any identity headers when the migration bridge is off.
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    } else if (user) {
      // Migration bridge only. Sessions persisted before tokens existed keep working
      // until the next login; the server honours these headers only while
      // ALLOW_LEGACY_HEADER_AUTH is on, and logs every use.
      headers.set('x-user-role', user.role);
      headers.set('x-user-id', String(user.id));
    }

    config.headers = headers;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    // 请求成功（HTTP 2xx），直接返回 data
    return response;
  },
  (error: AxiosError) => {
    // 处理 HTTP 错误（如 400, 401, 500 等）
    return Promise.reject(error);
  }
);

export const api = async <T = any>(config: ApiOptions): Promise<T> => {
  const { showError = true, authFailure = 'session', ...axiosConfig } = config;
  
  try {
    const response = await axiosInstance(axiosConfig);
    const data = response.data;
    
    if (data && data.success === false) {
      throw new FetchError(response.status || 200, data);
    }
    
    return data as T;
  } catch (error: any) {
    // 处理未授权错误 (401/403)
    const status = error.response?.status || error.status;
    if (!handleAuthError(status, showError, authFailure, serverMessageOf(error))) {
      if (showError) {
        showErrorToast(apiErrorMessage(error, '网络请求错误，请重试'));
      }
    }
    throw error;
  }
};

// 提供向下兼容的快捷方法，返回值直接就是 response.data
export const apiGet = <T = any>(url: string, options?: ApiOptions) => 
  api<T>({ url, method: 'GET', ...options });

export const apiPost = <T = any>(url: string, data?: any, options?: ApiOptions) => 
  api<T>({ url, method: 'POST', data, ...options });

export const apiPut = <T = any>(url: string, data?: any, options?: ApiOptions) => 
  api<T>({ url, method: 'PUT', data, ...options });

export const apiDelete = <T = any>(url: string, options?: ApiOptions) => 
  api<T>({ url, method: 'DELETE', ...options });
