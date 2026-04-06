import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { toast } from 'sonner';

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
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    // 预留：如果有 Token 可以从 localStorage 或 useStore 中取出并添加到 headers 中
    // const token = localStorage.getItem('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
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
    // 为了向下兼容现有的组件逻辑（直接处理 error.response.data 中的 { success: false, message: "..." }），
    // 只要有 response.data，我们就让 Promise resolve 并返回它，而不是 reject 触发 catch 块。
    if (error.response && error.response.data) {
      // 相当于欺骗调用方，把 4xx/5xx 错误当作正常响应返回（只要里面有 data）
      return Promise.resolve(error.response);
    }
    return Promise.reject(error);
  }
);

export const api = async <T = any>(config: ApiOptions): Promise<T> => {
  const { showError = true, ...axiosConfig } = config;
  
  try {
    const response = await axiosInstance(axiosConfig);
    const data = response.data;
    
    // 向下兼容：原来部分代码使用了 api.ts，如果 data.success === false，原 api.ts 会抛出异常
    // 但为了这次大规模替换 fetch，我们选择不在这里强制抛出错误，而是直接返回 data。
    // 让各个页面的 if (data.success) 逻辑自己去处理。
    
    return data as T;
  } catch (error: any) {
    // 处理未授权错误 (401/403)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      if (showError) showErrorToast('登录已过期或无权限，请重新登录');
      // 可在此处加入重定向逻辑：window.location.href = '/login';
    } else if (showError) {
      showErrorToast(error.message || '网络请求错误，请重试');
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
