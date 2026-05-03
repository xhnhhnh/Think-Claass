import { apiGet, apiPost } from '@/lib/api';
import type { DungeonChoicePayload, DungeonChoiceResponse, DungeonStateResponse } from '@/shared/dungeon/contracts';

export const dungeonApi = {
  getRun: (studentId: number) => apiGet<DungeonStateResponse>(`/api/dungeon/students/${studentId}/run`),
  start: (studentId: number) => apiPost<{ success: true; data: { runId: number }; runId: number }>(`/api/dungeon/students/${studentId}/start`),
  choose: (studentId: number, payload: DungeonChoicePayload) =>
    apiPost<DungeonChoiceResponse & { status?: string; newHp?: number; newFloor?: number }>(`/api/dungeon/students/${studentId}/choices`, payload),
  abandon: (studentId: number) => apiPost<{ success: true; data: { abandoned: boolean } }>(`/api/dungeon/students/${studentId}/abandon`),
};

export type { DungeonChoicePayload, DungeonRun, DungeonState, FloorChoice } from '@/shared/dungeon/contracts';
