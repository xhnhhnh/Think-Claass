import { useQuery } from '@tanstack/react-query';

import { analyticsApi, type ClassAnalyticsResponse, type StudentRadarResponse, type StudentReportResponse } from '@/api/analytics';

export function useClassOverview(classId: number | null) {
  return useQuery({
    queryKey: ['analytics', 'class-overview', classId],
    queryFn: async () => {
      if (!classId) return null as ClassAnalyticsResponse | null;
      return analyticsApi.getClassOverview(classId);
    },
    enabled: !!classId,
  });
}

export function useStudentReport(studentId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'student-report', studentId],
    queryFn: async () => {
      if (!studentId) return null as StudentReportResponse | null;
      return analyticsApi.getStudentReport(studentId);
    },
    enabled: enabled && !!studentId,
  });
}

export function useStudentRadar(studentId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'student-radar', studentId],
    queryFn: async () => {
      if (!studentId) return null as StudentRadarResponse | null;
      return analyticsApi.getStudentRadar(studentId);
    },
    enabled: enabled && !!studentId,
  });
}
