import { apiGet, apiPost } from '@/lib/api';

export const certificatesApi = {
  getStudentCertificates: (studentId: number) =>
    apiGet<{ success: true; certificates: any[] }>(`/api/certificates/student/${studentId}`),

  issueCertificate: (payload: Record<string, unknown>) => apiPost<{ success: true }>('/api/certificates/issue', payload),
};
