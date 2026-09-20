import { apiGet, apiPost, apiPut } from '@/lib/api';
import type { LeaveDto } from '@thinkclass/contracts/domains/classroom';

/**
 * Query for `GET /api/leaves`.
 *
 * The server filters the actor's own scope first and these only narrow it: there is no
 * `class_id` filter on this route, so a class-wide view has to come from the actor's scope.
 */
export interface LeaveListQuery {
  studentId?: number | null;
  status?: string | null;
}

/** Body of `POST /api/leaves`. The parent is taken from the session, not from the body. */
export interface CreateLeavePayload {
  student_id: number;
  start_date: string;
  end_date: string;
  reason: string;
}

/** What a parent actually fills in; the hook adds the child's id from the session. */
export type NewLeaveInput = Omit<CreateLeavePayload, 'student_id'>;

/** Body of `PUT /api/leaves/:id`. Only the student's class teacher may approve. */
export interface UpdateLeavePayload {
  status: string;
  review_comment?: string | null;
}

export interface LeavesResponse {
  success: true;
  data: LeaveDto[];
}

export const leavesApi = {
  list: (query: LeaveListQuery = {}) => {
    const params = new URLSearchParams();
    if (query.studentId) params.set('student_id', String(query.studentId));
    if (query.status) params.set('status', query.status);
    const suffix = params.toString() ? `?${params}` : '';
    return apiGet<LeavesResponse>(`/api/leaves${suffix}`);
  },

  create: (payload: CreateLeavePayload) => apiPost<{ success: true; id: number }>('/api/leaves', payload),

  update: (id: number, payload: UpdateLeavePayload) => apiPut<{ success: true }>(`/api/leaves/${id}`, payload),
};

export type { LeaveDto };
