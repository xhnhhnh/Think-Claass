import { toast } from 'sonner';

interface ApiOptions extends RequestInit {
  showError?: boolean;
}

export class FetchError extends Error {
  status: number;
  data: any;

  constructor(status: number, data: any) {
    super(data?.message || '请求失败');
    this.status = status;
    this.data = data;
  }
}

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

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new FetchError(response.status, data);
    }

    return data as T;
  } catch (error: any) {
    if (showError) {
      toast.error(error.message || '网络请求错误，请重试');
    }
    throw error;
  }
};

export const apiGet = <T>(url: string, options?: ApiOptions) => api<T>(url, { ...options, method: 'GET' });
export const apiPost = <T>(url: string, body: any, options?: ApiOptions) => api<T>(url, { ...options, method: 'POST', body: JSON.stringify(body) });
export const apiPut = <T>(url: string, body: any, options?: ApiOptions) => api<T>(url, { ...options, method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = <T>(url: string, options?: ApiOptions) => api<T>(url, { ...options, method: 'DELETE' });
