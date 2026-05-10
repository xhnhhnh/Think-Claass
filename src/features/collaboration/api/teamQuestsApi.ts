import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  PeerReviewPayload,
  StudentCurrentTeamQuest,
  TeamQuest,
  TeamQuestGroupProgress,
  TeamQuestPayload,
} from '@/shared/collaboration/contracts';

export type StudentCurrentTeamQuestResponse = { success: true } & StudentCurrentTeamQuest;

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
};

export type { PeerReviewPayload, TeamQuest, TeamQuestGroupProgress };
