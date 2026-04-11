import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

export interface TeamQuest {
  id: number;
  class_id: number;
  teacher_id: number;
  title: string;
  description: string | null;
  target_score: number;
  reward_points: number;
  start_date: string | null;
  end_date: string | null;
  status: 'active' | 'completed';
  created_at: string;
}

export interface TeamQuestGroupProgress {
  group_id: number | null;
  group_name: string;
  contribution_score: number;
  target_score: number;
}

export interface StudentTeamMember {
  id: number;
  name: string;
}

export interface StudentCurrentTeamQuestResponse {
  success: true;
  quest: TeamQuest | null;
  team?: {
    class_id: number;
    group_id: number | null;
    members: StudentTeamMember[];
  };
  progress?: {
    my_contribution_score: number;
    team_contribution_score: number;
  };
}

export const teamQuestsApi = {
  getTeamQuests: (classId?: number, status?: 'active' | 'completed') => {
    const query = new URLSearchParams();
    if (classId) query.append('class_id', classId.toString());
    if (status) query.append('status', status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiGet<{ success: true; data: TeamQuest[] }>(`/api/team-quests${suffix}`);
  },
  createTeamQuest: (data: {
    class_id: number;
    teacher_id: number;
    title: string;
    description?: string;
    target_score: number;
    reward_points: number;
    start_date?: string | null;
    end_date?: string | null;
  }) => apiPost<{ success: true; id: number }>('/api/team-quests', data),
  updateTeamQuest: (
    id: number,
    data: Partial<{
      title: string;
      description: string;
      target_score: number;
      reward_points: number;
      start_date: string | null;
      end_date: string | null;
      status: 'active' | 'completed';
    }>,
  ) => apiPut<{ success: true }>(`/api/team-quests/${id}`, data),
  deleteTeamQuest: (id: number) => apiDelete<{ success: true }>(`/api/team-quests/${id}`),
  getGroupProgress: (questId: number, classId: number) =>
    apiGet<{ success: true; data: TeamQuestGroupProgress[] }>(
      `/api/team-quests/progress/groups?quest_id=${questId}&class_id=${classId}`,
    ),
  getCurrentStudentQuest: (studentId: number) =>
    apiGet<StudentCurrentTeamQuestResponse>(`/api/team-quests/student/current?student_id=${studentId}`),
  addContribution: (data: { quest_id: number; student_id: number; contribution_score: number }) =>
    apiPost<{ success: true; id: number }>('/api/team-quests/progress', data),
  submitPeerReview: (data: {
    reviewer_id: number;
    reviewee_id: number;
    team_quest_id: number;
    score: number;
    comment?: string;
  }) => apiPost<{ success: true; id: number }>('/api/peer-reviews', data),
};
