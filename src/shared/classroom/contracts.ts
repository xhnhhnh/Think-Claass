export interface StudentDto {
  id: number;
  user_id?: number | null;
  class_id: number;
  group_id?: number | null;
  username?: string;
  name: string;
  total_points: number;
  available_points: number;
  group_name?: string | null;
  last_checkin_date?: string | null;
}

export interface ClassDto {
  id: number;
  name: string;
  teacher_id?: number | null;
  invite_code: string;
  pet_selection_mode?: string;
}

export interface GroupDto {
  id: number;
  name: string;
  class_id?: number;
}

export interface PresetDto {
  id: number;
  label: string;
  amount: number;
  teacher_id?: number | null;
}

export interface PointRecordDto {
  id: number;
  student_id: number;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
  student_name: string;
}

export interface AttendanceDto {
  id: number;
  class_id: number;
  student_id?: number | null;
  status: string;
  record_date?: string | null;
  created_at?: string;
}

export interface LeaveDto {
  id: number;
  student_id: number;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  review_comment?: string | null;
  created_at: string;
}

export interface CreateStudentPayload {
  username: string;
  name: string;
  class_id?: number | string;
}

export interface BatchImportStudentPayload {
  students: Array<{ name: string; username: string }>;
  class_id: number | string;
}

export interface BatchPointsPayload {
  studentIds: number[];
  amount: number;
  reason: string;
}

export interface ClassAnalyticsSummaryDto {
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

export interface ClassAnalyticsDto {
  class: ClassDto;
  summary: ClassAnalyticsSummaryDto;
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

export interface StudentReportDto {
  student: Pick<StudentDto, 'id' | 'class_id' | 'name' | 'total_points'>;
  summary: Record<string, number>;
  records: PointRecordDto[];
  recent_exams: Array<{ title: string; exam_date: string | null; total_score: number; score: number; feedback?: string | null }>;
  assignments: Array<{ title: string; due_date: string | null; status: string; score?: number | null; teacher_feedback?: string | null }>;
  attendance: Record<string, number>;
  praises: Array<{ title: string; message: string; created_at: string }>;
  leaves: LeaveDto[];
}

export interface StudentRadarDto {
  report: {
    studentName: string;
    metrics: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    advice: string[];
  };
}
