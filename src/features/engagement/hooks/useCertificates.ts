import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { certificatesApi } from '../api/certificatesApi';
import { engagementQueryKeys } from './useMessages';

export function useCertificates() {
  return useQuery({
    queryKey: engagementQueryKeys.certificates,
    queryFn: async () => {
      const data = await certificatesApi.getCertificates();
      return data.certificates;
    },
  });
}

export function useStudentCertificates(studentId: number | null) {
  return useQuery({
    queryKey: engagementQueryKeys.studentCertificates(studentId),
    queryFn: async () => {
      if (!studentId) return [];
      const data = await certificatesApi.getStudentCertificates(studentId);
      return data.certificates;
    },
    enabled: !!studentId,
  });
}

export function useIssueCertificateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: certificatesApi.issueCertificate,
    onSuccess: async (_data, payload) => {
      await queryClient.invalidateQueries({ queryKey: engagementQueryKeys.certificates });
      const studentId = Number((payload as { student_id?: number }).student_id);
      if (studentId) await queryClient.invalidateQueries({ queryKey: engagementQueryKeys.studentCertificates(studentId) });
    },
  });
}
