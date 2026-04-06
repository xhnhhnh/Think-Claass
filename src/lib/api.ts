import { toast } from 'sonner';

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

export interface ApiOptions extends RequestInit {
  showError?: boolean;
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

export const api = async <T = any>(url: string, options: ApiOptions = {}): Promise<T> => {
  const { showError = true, ...fetchOptions } = options;
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }

    if (!response.ok || data.success === false) {
      throw new FetchError(response.status, data);
    }

    return data as T;
  } catch (error: any) {
    // 处理未授权错误 (401/403)
    if (error instanceof FetchError && (error.status === 401 || error.status === 403)) {
      if (showError) showErrorToast('登录已过期或无权限，请重新登录');
      // 可在此处加入重定向逻辑：window.location.href = '/login';
    } else if (showError) {
      showErrorToast(error.message || '网络请求错误，请重试');
    }
    throw error;
  }
};

export const apiGet = <T>(url: string, options?: ApiOptions) => api<T>(url, { ...options, method: 'GET' });
export const apiPost = <T>(url: string, body: any, options?: ApiOptions) => api<T>(url, { ...options, method: 'POST', body: JSON.stringify(body) });
export const apiPut = <T>(url: string, body: any, options?: ApiOptions) => api<T>(url, { ...options, method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = <T>(url: string, options?: ApiOptions) => api<T>(url, { ...options, method: 'DELETE' });
