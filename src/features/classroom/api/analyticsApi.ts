import { apiGet } from '@/lib/api';
import type { ClassAnalyticsDto, StudentRadarDto, StudentReportDto } from '@/shared/classroom/contracts';

export type ClassAnalyticsResponse = { success: true } & ClassAnalyticsDto;
export type StudentReportResponse = { success: true } & StudentReportDto;
export type StudentRadarResponse = { success: true } & StudentRadarDto;

export const analyticsApi = {
  getClassOverview: (classId: number) => apiGet<ClassAnalyticsResponse>(`/api/analytics/classes/${classId}/overview`),
  getStudentReport: (studentId: number) => apiGet<StudentReportResponse>(`/api/analytics/students/${studentId}/report`),
  getStudentRadar: (studentId: number) => apiGet<StudentRadarResponse>(`/api/analytics/students/${studentId}/radar`),
};
