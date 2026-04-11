import { apiGet } from '@/lib/api';

export interface ClassAnalyticsSummary {
  total_students: number;
  average_points: number;
  max_points: number;
  min_points: number;
  average_exam_score: number;
  assignment_completion_rate: number;
  attendance_rate: number;
  praise_count: number;
  leave_count: number;
}

export interface ClassAnalyticsResponse {
  success: true;
  class: {
    id: number;
    name: string;
    teacher_id: number;
  };
  summary: ClassAnalyticsSummary;
  distributions: Array<{ label: string; value: number }>;
  exam_trend: Array<{ id: number; title: string; exam_date: string | null; average_score: number }>;
  assignment_trend: Array<{
    id: number;
    title: string;
    due_date: string | null;
    total_students: number;
    submitted_students: number;
    completion_rate: number;
  }>;
  top_students: Array<{ id: number; name: string; total_points: number }>;
}

export interface StudentReportResponse {
  success: true;
  student: {
    id: number;
    class_id: number;
    name: string;
    total_points: number;
  };
  summary: {
    weekly_earned: number;
    weekly_spent: number;
    total_earned: number;
    total_spent: number;
    average_exam_score: number;
    assignment_completion_rate: number;
    attendance_rate: number;
    praise_count: number;
  };
  records: Array<{ id: number; type: string; amount: number; description: string | null; created_at: string }>;
  recent_exams: Array<{ title: string; exam_date: string | null; total_score: number; score: number; feedback: string | null }>;
  assignments: Array<{ title: string; due_date: string | null; status: string; score: number | null; teacher_feedback: string | null }>;
  attendance: {
    total_records: number;
    present_count: number;
    late_count: number;
    absent_count: number;
  };
  praises: Array<{ title: string; message: string; created_at: string }>;
  leaves: Array<{
    start_date: string;
    end_date: string;
    reason: string;
    status: string;
    review_comment: string | null;
    created_at: string;
  }>;
}

export interface StudentRadarResponse {
  success: true;
  report: {
    studentName: string;
    metrics: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    advice: string[];
  };
}

export const analyticsApi = {
  getClassOverview: (classId: number) =>
    apiGet<ClassAnalyticsResponse>(`/api/analytics/classes/${classId}/overview`),
  getStudentReport: (studentId: number) =>
    apiGet<StudentReportResponse>(`/api/analytics/students/${studentId}/report`),
  getStudentRadar: (studentId: number) =>
    apiGet<StudentRadarResponse>(`/api/analytics/students/${studentId}/radar`),
};
