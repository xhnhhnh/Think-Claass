import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type { StudentTaskNode, TaskNode, TaskNodePayload } from '@/shared/collaboration/contracts';

export const taskTreeApi = {
  getTeacherNodes: (classId: number) => apiGet<{ success: true; nodes: TaskNode[]; data?: { nodes: TaskNode[] } }>(`/api/task-tree/teacher/${classId}`),
  createNode: (payload: TaskNodePayload) => apiPost<{ success: true; node: TaskNode; data?: { node: TaskNode } }>('/api/task-tree/teacher', payload),
  updateNode: (nodeId: number, payload: Omit<TaskNodePayload, 'class_id' | 'parent_node_id'>) =>
    apiPut<{ success: true }>(`/api/task-tree/teacher/${nodeId}`, payload),
  deleteNode: (nodeId: number) => apiDelete<{ success: true }>(`/api/task-tree/teacher/${nodeId}`),
  getStudentNodes: (studentId: number) =>
    apiGet<{ success: true; nodes: StudentTaskNode[]; data?: { nodes: StudentTaskNode[] } }>(`/api/task-tree/student/${studentId}`),
  completeNode: (studentId: number, nodeId: number) => apiPost<{ success: true }>(`/api/task-tree/student/${studentId}/complete/${nodeId}`),
};

export type { StudentTaskNode, TaskNode, TaskNodePayload };
