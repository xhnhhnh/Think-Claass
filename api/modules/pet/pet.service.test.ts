import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/asyncHandler';
import { PetService } from './pet.service';
import type { AdoptPetInput, PetRepository, PetRow, StudentPointsRow, UpdatePetInput } from './pet.types';

class FakePetRepository implements PetRepository {
  students = new Map<number, StudentPointsRow>();
  pets = new Map<number, PetRow>();
  records: Array<{ studentId: number; type: string; amount: number; description: string }> = [];
  buffStudentIds = new Set<number>();
  nextPetId = 100;

  transaction<T>(fn: () => T): T {
    return fn();
  }

  getStudent(studentId: number) {
    return this.students.get(studentId) ?? null;
  }

  getPet(studentId: number) {
    return this.pets.get(studentId) ?? null;
  }

  listClassPets() {
    return [];
  }

  listClassmatePets() {
    return [];
  }

  listLeaderboard() {
    return [];
  }

  listPraises() {
    return [];
  }

  listRecords() {
    return [];
  }

  hasParentBuff(studentId: number) {
    return this.buffStudentIds.has(studentId);
  }

  createPet(studentId: number, input: AdoptPetInput) {
    const id = this.nextPetId++;
    this.pets.set(studentId, {
      id,
      student_id: studentId,
      element_type: input.elementType,
      custom_image: input.custom_image ?? null,
      image_stage1: input.image_stage1 ?? null,
      image_stage2: input.image_stage2 ?? null,
      image_stage3: input.image_stage3 ?? null,
      image_stage4: input.image_stage4 ?? null,
      image_stage5: input.image_stage5 ?? null,
      image_stage6: input.image_stage6 ?? null,
      level: 1,
      experience: 0,
      attack_power: 10,
      mood: null,
      last_fed_at: null,
    });
    return id;
  }

  upsertPet(studentId: number, input: UpdatePetInput) {
    const existing = this.pets.get(studentId);
    this.pets.set(studentId, {
      id: existing?.id ?? this.nextPetId++,
      student_id: studentId,
      element_type: input.elementType ?? input.element_type ?? existing?.element_type ?? 'normal',
      custom_image: input.customImage ?? input.custom_image ?? existing?.custom_image ?? null,
      image_stage1: input.image_stage1 ?? existing?.image_stage1 ?? null,
      image_stage2: input.image_stage2 ?? existing?.image_stage2 ?? null,
      image_stage3: input.image_stage3 ?? existing?.image_stage3 ?? null,
      image_stage4: input.image_stage4 ?? existing?.image_stage4 ?? null,
      image_stage5: input.image_stage5 ?? existing?.image_stage5 ?? null,
      image_stage6: input.image_stage6 ?? existing?.image_stage6 ?? null,
      level: input.level ?? existing?.level ?? 1,
      experience: input.experience ?? existing?.experience ?? 0,
      attack_power: input.attack_power ?? existing?.attack_power ?? 10,
      mood: existing?.mood ?? null,
      last_fed_at: existing?.last_fed_at ?? null,
    });
  }

  updatePetProgress(petId: number, experience: number, level: number, attackPower: number) {
    for (const [studentId, pet] of this.pets) {
      if (pet.id === petId) {
        this.pets.set(studentId, { ...pet, experience, level, attack_power: attackPower, last_fed_at: new Date().toISOString() });
      }
    }
  }

  touchPetFedAt() {}

  deductStudentPoints(studentId: number, cost: number) {
    const student = this.students.get(studentId);
    if (!student || student.available_points < cost) {
      throw new ApiError(400, 'Not enough points');
    }
    const nextPoints = student.available_points - cost;
    this.students.set(studentId, { ...student, available_points: nextPoints });
    return nextPoints;
  }

  insertRecord(studentId: number, type: string, amount: number, description: string) {
    this.records.push({ studentId, type, amount, description });
  }

  addPetExperience(petId: number, expGain: number) {
    for (const [studentId, pet] of this.pets) {
      if (pet.id === petId) {
        this.pets.set(studentId, { ...pet, experience: pet.experience + expGain });
      }
    }
  }
}

function createService() {
  const repository = new FakePetRepository();
  repository.students.set(1, { id: 1, class_id: 8, name: 'encrypted', available_points: 200 });
  repository.students.set(2, { id: 2, class_id: 8, name: 'encrypted-2', available_points: 200 });
  const service = new PetService(repository, { roll: vi.fn().mockReturnValueOnce(20).mockReturnValueOnce(1) });
  return { repository, service };
}

describe('PetService', () => {
  let repository: FakePetRepository;
  let service: PetService;

  beforeEach(() => {
    ({ repository, service } = createService());
  });

  it('adopts pets and rejects duplicate adoption', () => {
    const adopted = service.adoptPet(1, { elementType: 'fire' });

    expect(adopted.petId).toBe(100);
    expect(adopted.pet?.element_type).toBe('fire');
    expect(() => service.adoptPet(1, { elementType: 'water' })).toThrow(ApiError);
  });

  it('interacts by deducting points, recording cost, and leveling pet progress', () => {
    service.adoptPet(1, { elementType: 'fire' });

    const result = service.interact(1, { actionType: '训练', cost: 60, expGain: 180, type: 'TRAIN' });

    expect(result.points).toBe(140);
    expect(result.pet?.experience).toBe(180);
    expect(result.pet?.level).toBe(2);
    expect(result.pet?.attack_power).toBe(18);
    expect(repository.records).toEqual([{ studentId: 1, type: 'TRAIN', amount: -60, description: 'Consumed for 训练' }]);
  });

  it('awards battle experience to the winner', () => {
    service.adoptPet(1, { elementType: 'fire' });
    service.adoptPet(2, { elementType: 'water' });

    const result = service.battle({ studentId: 1, opponentId: 2 });

    expect(result.isWin).toBe(true);
    expect(repository.getPet(1)?.experience).toBe(10);
    expect(repository.getPet(2)?.experience).toBe(0);
  });
});
