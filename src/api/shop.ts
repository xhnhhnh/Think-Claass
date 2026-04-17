import { apiGet, apiPost, apiPut } from '@/lib/api';

export const shopApi = {
  getAllItems: () => apiGet<{ success: true; items: any[] }>('/api/shop/all'),

  getTeacherItems: (teacherId?: number) =>
    apiGet<{ success: true; items: any[] }>(`/api/shop/all${teacherId ? `?teacherId=${teacherId}` : ''}`),

  getStudentItems: () => apiGet<{ success: true; items: any[] }>('/api/shop/items'),

  getBlindBoxes: () => apiGet<{ success: true; boxes: any[] }>('/api/shop/blind_boxes'),

  buyItem: (payload: { studentId: number; itemId: number }) =>
    apiPost<{ success: true }>('/api/shop/buy', payload),

  buyBlindBox: (payload: { studentId: number; blindBoxId: number }) =>
    apiPost<{ success: true; reward: string; message: string }>('/api/shop/blind_box', payload),

  updateStatus: (itemId: number, isActive: number) =>
    apiPut<{ success: true }>(`/api/shop/${itemId}/status`, { is_active: isActive }),

  updateItem: (itemId: number, payload: Record<string, unknown>) =>
    apiPut<{ success: true }>(`/api/shop/${itemId}`, payload),

  createItem: (payload: Record<string, unknown>) => apiPost<{ success: true }>('/api/shop', payload),
};
