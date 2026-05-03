import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/classFeatures.js', () => ({
  assertClassFeatureEnabled: vi.fn(),
  assertStudentFeatureEnabled: vi.fn(),
}));

import { ApiError } from '../../utils/asyncHandler';
import { SlgService } from './slg.service';
import type { ClassResources, CreateTerritoryPayload, SlgRepository, SlgStudentRow, Territory } from './slg.types';

class FakeSlgRepository implements SlgRepository {
  student: SlgStudentRow = { available_points: 500 };
  territories = new Map<number, Territory>([[1, { id: 1, class_id: 3, name: '森林', type: 'forest', status: 'locked', level: 1, cost_to_unlock: 100, current_contribution: 0, x_pos: 0, y_pos: 0 }]]);
  resources: ClassResources = { class_id: 3, wood: 0, stone: 0, magic_dust: 0, gold: 0 };
  nextId = 2;

  transaction<T>(fn: () => T): T { return fn(); }
  listTerritories() { return [...this.territories.values()]; }
  getOrCreateResources() { return this.resources; }
  getStudent() { return this.student; }
  getTerritory(territoryId: number) { return this.territories.get(territoryId) ?? null; }
  updateStudentAvailablePoints(_studentId: number, amount: number) { this.student.available_points = amount; }
  insertRecord() {}
  updateTerritoryContribution(territoryId: number, contribution: number, status: string) {
    const territory = this.territories.get(territoryId)!;
    this.territories.set(territoryId, { ...territory, current_contribution: contribution, status: status as Territory['status'] });
  }
  createTerritory(input: Required<CreateTerritoryPayload>) { const id = this.nextId++; this.territories.set(id, { id, status: 'locked', level: 1, current_contribution: 0, ...input }); return id; }
  listOwnedTerritoryYields() { return [...this.territories.values()].filter((territory) => territory.status === 'owned').map(({ type, level }) => ({ type, level })); }
  addResources(_classId: number, yieldInput: Omit<ClassResources, 'id' | 'class_id'>) {
    this.resources = { ...this.resources, wood: this.resources.wood + yieldInput.wood, stone: this.resources.stone + yieldInput.stone, magic_dust: this.resources.magic_dust + yieldInput.magic_dust, gold: this.resources.gold + yieldInput.gold };
  }
}

describe('SlgService', () => {
  let repository: FakeSlgRepository;
  let service: SlgService;

  beforeEach(() => {
    repository = new FakeSlgRepository();
    service = new SlgService(repository);
  });

  it('deducts points and unlocks territory when contribution reaches the cost', () => {
    service.contribute(1, 1, { amount: 100 });
    expect(repository.student.available_points).toBe(400);
    expect(repository.territories.get(1)?.status).toBe('owned');
  });

  it('rejects contributions above available points', () => {
    expect(() => service.contribute(1, 1, { amount: 600 })).toThrow(ApiError);
  });

  it('creates territory and yields resources for owned territory', () => {
    const { territoryId } = service.createTerritory({ class_id: 3, name: '矿洞', type: 'mine', cost_to_unlock: 100, x_pos: 1, y_pos: 1 });
    repository.updateTerritoryContribution(territoryId, 100, 'owned');
    expect(service.yieldResources(3).yield.stone).toBe(10);
    expect(repository.resources.stone).toBe(10);
  });
});
