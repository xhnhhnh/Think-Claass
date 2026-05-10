import type { DungeonChoicePayload, DungeonChoiceResult, DungeonRun, DungeonState, FloorChoice } from '../../../src/shared/dungeon/contracts.js';

export interface DungeonRunRow extends Omit<DungeonRun, 'active_buffs'> {
  active_buffs: string | string[] | null;
}

export interface DungeonRepository {
  transaction<T>(fn: () => T): T;
  getActiveRun(studentId: number): DungeonRunRow | null;
  getBestFloor(studentId: number): number;
  endActiveRuns(studentId: number): void;
  createRun(studentId: number): number;
  updateRun(runId: number, input: { currentFloor: number; maxFloor: number; currentHp: number; activeBuffs: string[]; status: string }): void;
  addStudentPoints(studentId: number, amount: number): void;
  insertRecord(studentId: number, type: string, amount: number, description: string): void;
}

export type { DungeonChoicePayload, DungeonChoiceResult, DungeonRun, DungeonState, FloorChoice };
