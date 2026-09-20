import { apiGet, apiPost } from '@/lib/api';

/**
 * One row of `attendance_records`, as `GET /api/attendance` returns it.
 *
 * The endpoint answers with raw DB rows, not with the contracts' `AttendanceDto`: the column
 * carrying the day is `date` (not `record_date`), and `remark` exists only on the table. Typing
 * this response with `AttendanceDto` would declare fields the endpoint never sends.
 */
export interface AttendanceRow {
  id: number;
  class_id: number;
  student_id: number | null;
  date: string;
  status: string;
  remark: string | null;
  created_at?: string;
}

/** Query for `GET /api/attendance`. The server scopes rows to the actor; these only narrow. */
export interface AttendanceListQuery {
  classId?: number | null;
  studentId?: number | null;
  date?: string | null;
}

export interface SaveAttendanceRecordPayload {
  student_id: number;
  date: string;
  status: string;
  remark?: string | null;
}

/** Body of `POST /api/attendance`: a whole class-day, replaced record by record. */
export interface SaveAttendancePayload {
  class_id: number;
  records: SaveAttendanceRecordPayload[];
}

export interface AttendanceResponse {
  success: true;
  data: AttendanceRow[];
}

export const attendanceApi = {
  list: (query: AttendanceListQuery = {}) => {
    const params = new URLSearchParams();
    if (query.classId) params.set('class_id', String(query.classId));
    if (query.studentId) params.set('student_id', String(query.studentId));
    if (query.date) params.set('date', query.date);
    const suffix = params.toString() ? `?${params}` : '';
    return apiGet<AttendanceResponse>(`/api/attendance${suffix}`);
  },

  save: (payload: SaveAttendancePayload) => apiPost<{ success: true }>('/api/attendance', payload),
};
