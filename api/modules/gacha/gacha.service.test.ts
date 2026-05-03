import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/classFeatures.js', () => ({
  assertClassFeatureEnabled: vi.fn(),
  assertStudentFeatureEnabled: vi.fn(),
}));

import { ApiError } from '../../utils/asyncHandler';
import { GachaService } from './gacha.service';
import type { GachaPool, GachaRepository, GachaStudentRow, PetCollectionItem, PetDictionaryEntry } from './gacha.types';

class FakeGachaRepository implements GachaRepository {
  student: GachaStudentRow = { available_points: 500 };
  pools: GachaPool[] = [];
  dictionary: PetDictionaryEntry[] = [{ id: 1, name: '星兽', rarity: 'SSR', element: 'star', base_power: 100 }];
  collection: PetCollectionItem[] = [];

  transaction<T>(fn: () => T): T { return fn(); }
  listDictionary() { return this.dictionary; }
  createDictionaryEntry(input: PetDictionaryEntry) { this.dictionary.push(input); return input.id; }
  listPools(classId: number) { return this.pools.filter((pool) => pool.class_id === classId); }
  listActivePools(classId: number) { return this.listPools(classId).filter((pool) => pool.is_active); }
  createDefaultPool(classId: number) {
    this.pools.push({ id: 1, class_id: classId, name: '默认', cost_points: 100, ssr_rate: 1, sr_rate: 0, r_rate: 0, n_rate: 0, is_active: 1 });
  }
  getStudent() { return this.student; }
  getPool(poolId: number) { return this.pools.find((pool) => pool.id === poolId) ?? null; }
  updateStudentAvailablePoints(_studentId: number, amount: number) { this.student.available_points = amount; }
  insertRecord() {}
  listDictionaryByRarity(rarity: string) { return this.dictionary.filter((pet) => pet.rarity === rarity); }
  insertStudentPet(studentId: number, petDictId: number) {
    const pet = this.dictionary.find((entry) => entry.id === petDictId)!;
    this.collection.push({ ...pet, instance_id: 10, level: 1, experience: 0, is_active: 0 });
  }
  listCollection() { return this.collection; }
  clearActivePet() { this.collection = this.collection.map((pet) => ({ ...pet, is_active: 0 })); }
  setActivePet(_studentId: number, instanceId: number) {
    const index = this.collection.findIndex((pet) => pet.instance_id === instanceId);
    if (index < 0) return 0;
    this.collection[index] = { ...this.collection[index], is_active: 1 };
    return 1;
  }
}

describe('GachaService', () => {
  let repository: FakeGachaRepository;
  let service: GachaService;

  beforeEach(() => {
    repository = new FakeGachaRepository();
    service = new GachaService(repository, () => 0);
  });

  it('auto-creates class pools and draws into the collection', () => {
    expect(service.listPools(3)).toHaveLength(1);
    const results = service.draw(1, { poolId: 1, times: 1 });
    expect(results[0].rarity).toBe('SSR');
    expect(repository.student.available_points).toBe(400);
    expect(repository.collection).toHaveLength(1);
  });

  it('rejects draws with insufficient points', () => {
    service.listPools(3);
    repository.student.available_points = 0;
    expect(() => service.draw(1, { poolId: 1, times: 1 })).toThrow(ApiError);
  });

  it('keeps only one active pet', () => {
    service.listPools(3);
    service.draw(1, { poolId: 1, times: 1 });
    expect(service.setActivePet(1, 10).activePetId).toBe(10);
    expect(repository.collection[0].is_active).toBe(1);
  });
});
