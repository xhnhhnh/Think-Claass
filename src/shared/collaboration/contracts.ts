import type { ApiSuccess } from '../core/contracts';

export type TaskNodeStatus = 'locked' | 'unlocked' | 'completed';

export interface TaskNode {
  id: number;
  class_id: number;
  title: string;
  description: string;
  points_reward: number;
  parent_node_id: number | null;
  x_pos: number;
  y_pos: number;
}

export interface StudentTaskNode extends TaskNode {
  status: TaskNodeStatus;
  completed_at?: string | null;
}

export interface TaskNodePayload {
  class_id: number;
  title: string;
  description: string;
  points_reward: number;
  parent_node_id: number | null;
  x_pos: number;
  y_pos: number;
}

export type TeamQuestStatus = 'active' | 'completed';

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
  status: TeamQuestStatus;
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

export interface StudentCurrentTeamQuest {
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

export interface TeamQuestPayload {
  class_id: number;
  teacher_id: number;
  title: string;
  description?: string;
  target_score: number;
  reward_points: number;
  start_date?: string | null;
  end_date?: string | null;
}

export interface PeerReviewPayload {
  reviewer_id: number;
  reviewee_id: number;
  assignment_id?: number | null;
  team_quest_id?: number | null;
  score: number;
  comment?: string;
}

export type TaskNodesResponse = ApiSuccess<{ nodes: TaskNode[] }>;
export type StudentTaskNodesResponse = ApiSuccess<{ nodes: StudentTaskNode[] }>;
export type TeamQuestsResponse = ApiSuccess<{ quests: TeamQuest[] }>;
