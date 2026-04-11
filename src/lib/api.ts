import axios, { AxiosError, AxiosHeaders, AxiosRequestConfig } from 'axios';
import { toast } from 'sonner';

import { useStore } from '@/store/useStore';

interface ApiOptions extends AxiosRequestConfig {
  showError?: boolean;
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

// 创建 axios 实例
const axiosInstance = axios.create({
  // baseURL 默认为空，复用当前的域名和 /api 前缀代理配置
  timeout: 15000,
});

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    const user = useStore.getState().user;
    if (user) {
      const headers = new AxiosHeaders(config.headers);
      headers.set('x-user-role', user.role);
      headers.set('x-user-id', String(user.id));
      config.headers = headers;
    }
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
  const { showError = true, ...axiosConfig } = config;
  
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
    if (status === 401 || status === 403) {
      if (showError) showErrorToast('登录已过期或无权限，请重新登录');
      // 可在此处加入重定向逻辑：window.location.href = '/login';
    } else if (showError) {
      const message = error.response?.data?.message || error.data?.message || error.message || '网络请求错误，请重试';
      showErrorToast(message);
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
