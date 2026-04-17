import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

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

export interface TaskNodePayload {
  class_id: number;
  title: string;
  description: string;
  points_reward: number;
  parent_node_id: number | null;
  x_pos: number;
  y_pos: number;
}

export const taskTreeApi = {
  getTeacherNodes: (classId: number) =>
    apiGet<{ success: true; nodes: TaskNode[] }>(`/api/task-tree/teacher/${classId}`),

  createNode: (payload: TaskNodePayload) =>
    apiPost<{ success: true; node: TaskNode }>('/api/task-tree/teacher', payload),

  updateNode: (nodeId: number, payload: Omit<TaskNodePayload, 'class_id' | 'parent_node_id'>) =>
    apiPut<{ success: true }>(`/api/task-tree/teacher/${nodeId}`, payload),

  deleteNode: (nodeId: number) => apiDelete<{ success: true }>(`/api/task-tree/teacher/${nodeId}`),
};
