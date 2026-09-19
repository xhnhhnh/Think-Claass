import { apiGet, apiPost } from '@/lib/api';
import type { CertificateDto, IssueCertificatePayload } from '@thinkclass/contracts/domains/engagement';

export const certificatesApi = {
  getCertificates: () => apiGet<{ success: true; certificates: CertificateDto[] }>('/api/certificates'),
  getStudentCertificates: (studentId: number) =>
    apiGet<{ success: true; certificates: CertificateDto[] }>(`/api/certificates?studentId=${studentId}`),
  issueCertificate: (payload: IssueCertificatePayload | Record<string, unknown>) =>
    apiPost<{ success: true; message?: string }>('/api/certificates', payload),
};
