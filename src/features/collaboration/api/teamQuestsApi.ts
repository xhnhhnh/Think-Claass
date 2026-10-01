import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  PeerReviewPayload,
  StudentCurrentTeamQuest,
  TeamQuest,
  TeamQuestGroupProgress,
  TeamQuestPayload,
} from '@thinkclass/contracts/domains/collaboration';

export type StudentCurrentTeamQuestResponse = { success: true } & StudentCurrentTeamQuest;

/**
 * One `peer_reviews` row as `GET /api/peer-reviews` answers it.
 *
 * `reviewer_name` / `reviewee_name` are resolved server-side through `classroom.public` - the table
 * itself stores ids only, and a review whose counterpart renders as `#42` is not readable. `null` is
 * a real answer (the pupil's record is gone).
 */
export interface PeerReviewView {
  id: number;
  reviewer_id: number;
  reviewee_id: number;
  assignment_id: number | null;
  team_quest_id: number | null;
  score: number | null;
  comment: string | null;
  created_at: string;
  reviewer_name: string | null;
  reviewee_name: string | null;
}

export const teamQuestsApi = {
  getTeamQuests: (classId?: number, status?: 'active' | 'completed') => {
    const query = new URLSearchParams();
    if (classId) query.append('class_id', classId.toString());
    if (status) query.append('status', status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiGet<{ success: true; data: TeamQuest[] }>(`/api/team-quests${suffix}`);
  },
  createTeamQuest: (data: TeamQuestPayload) => apiPost<{ success: true; id: number }>('/api/team-quests', data),
  updateTeamQuest: (id: number, data: Partial<TeamQuestPayload & { status: 'active' | 'completed' }>) =>
    apiPut<{ success: true }>(`/api/team-quests/${id}`, data),
  deleteTeamQuest: (id: number) => apiDelete<{ success: true }>(`/api/team-quests/${id}`),
  getGroupProgress: (questId: number, classId: number) =>
    apiGet<{ success: true; data: TeamQuestGroupProgress[] }>(`/api/team-quests/progress/groups?quest_id=${questId}&class_id=${classId}`),
  getCurrentStudentQuest: (studentId: number) => apiGet<StudentCurrentTeamQuestResponse>(`/api/team-quests/student/current?student_id=${studentId}`),
  addContribution: (data: { quest_id: number; student_id: number; contribution_score: number }) =>
    apiPost<{ success: true; id: number }>('/api/team-quests/progress', data),
  submitPeerReview: (data: PeerReviewPayload & { team_quest_id: number }) => apiPost<{ success: true; id: number }>('/api/peer-reviews', data),
  /**
   * The reviews the caller is party to: a pupil's own (written or received), a teacher's students'.
   *
   * The route existed with the POST above it and no reader, so a pupil could give a peer review and
   * never see one - neither the reviews they received nor a record of what they wrote.
   */
  listPeerReviews: (filter: { reviewerId?: number; revieweeId?: number } = {}) => {
    const query = new URLSearchParams();
    if (filter.reviewerId) query.append('reviewer_id', String(filter.reviewerId));
    if (filter.revieweeId) query.append('reviewee_id', String(filter.revieweeId));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiGet<{ success: true; data: PeerReviewView[] }>(`/api/peer-reviews${suffix}`);
  },
};

export type { PeerReviewPayload, TeamQuest, TeamQuestGroupProgress };
