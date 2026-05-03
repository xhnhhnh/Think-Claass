import type { ClassResources, CreateTerritoryPayload, Territory, TerritoryContributionPayload } from '../../../src/shared/slg/contracts.js';

export interface SlgStudentRow {
  available_points: number;
}

export interface SlgRepository {
  transaction<T>(fn: () => T): T;
  listTerritories(classId: number): Territory[];
  getOrCreateResources(classId: number): ClassResources;
  getStudent(studentId: number): SlgStudentRow | null;
  getTerritory(territoryId: number): Territory | null;
  updateStudentAvailablePoints(studentId: number, amount: number): void;
  insertRecord(studentId: number, type: string, amount: number, description: string): void;
  updateTerritoryContribution(territoryId: number, contribution: number, status: string): void;
  createTerritory(input: Required<CreateTerritoryPayload>): number;
  listOwnedTerritoryYields(classId: number): Array<Pick<Territory, 'type' | 'level'>>;
  addResources(classId: number, yieldInput: Omit<ClassResources, 'id' | 'class_id'>): void;
}

export type { ClassResources, CreateTerritoryPayload, Territory, TerritoryContributionPayload };
