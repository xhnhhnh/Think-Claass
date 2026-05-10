import { ApiError } from '../../utils/asyncHandler.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled } from '../../utils/classFeatures.js';
import type { CreatePetDictionaryPayload, GachaDrawPayload, GachaRepository, GachaRarity, PetDictionaryEntry } from './gacha.types.js';

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

function rollRarity(pool: { ssr_rate: number; sr_rate: number; r_rate: number }, random: () => number): GachaRarity {
  const rand = random();
  if (rand < pool.ssr_rate) return 'SSR';
  if (rand < pool.ssr_rate + pool.sr_rate) return 'SR';
  if (rand < pool.ssr_rate + pool.sr_rate + pool.r_rate) return 'R';
  return 'N';
}

export class GachaService {
  constructor(
    private readonly repository: GachaRepository,
    private readonly random = Math.random,
  ) {}

  listDictionary() {
    return this.repository.listDictionary();
  }

  createDictionary(input: CreatePetDictionaryPayload) {
    if (!input.name || !input.element || !input.rarity || !input.base_power) {
      throw new ApiError(400, 'Missing fields');
    }
    return { id: this.repository.createDictionaryEntry(input) };
  }

  listPools(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    assertClassFeatureEnabled(classId, 'enable_gacha');
    return this.repository.transaction(() => {
      if (this.repository.listPools(classId).length === 0) {
        this.repository.createDefaultPool(classId);
      }
      return this.repository.listActivePools(classId);
    });
  }

  draw(studentIdInput: unknown, input: GachaDrawPayload) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const poolId = positiveInteger(input.poolId, 'Pool id');
    const times = positiveInteger(input.times, 'Times');
    assertStudentFeatureEnabled(studentId, 'enable_gacha');

    return this.repository.transaction(() => {
      const student = this.repository.getStudent(studentId);
      const pool = this.repository.getPool(poolId);
      if (!student || !pool) throw new ApiError(404, 'Not found');

      const totalCost = pool.cost_points * times;
      if (student.available_points < totalCost) throw new ApiError(400, 'Insufficient points');

      this.repository.updateStudentAvailablePoints(studentId, student.available_points - totalCost);
      this.repository.insertRecord(studentId, 'GACHA_PULL', -totalCost, `Performed ${times}x Gacha Pull from ${pool.name}`);

      const results: PetDictionaryEntry[] = [];
      for (let i = 0; i < times; i += 1) {
        const rarity = rollRarity(pool, this.random);
        const candidates = this.repository.listDictionaryByRarity(rarity);
        if (candidates.length > 0) {
          const wonPet = candidates[Math.floor(this.random() * candidates.length)];
          this.repository.insertStudentPet(studentId, wonPet.id);
          results.push(wonPet);
        } else {
          results.push({ id: 0, name: '星尘碎片 (未找到图鉴)', rarity, element: 'neutral', base_power: 0 });
        }
      }
      return results;
    });
  }

  listCollection(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    assertStudentFeatureEnabled(studentId, 'enable_gacha');
    return this.repository.listCollection(studentId);
  }

  setActivePet(studentIdInput: unknown, instanceIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const instanceId = positiveInteger(instanceIdInput, 'Pet instance id');
    assertStudentFeatureEnabled(studentId, 'enable_gacha');
    this.repository.clearActivePet(studentId);
    if (this.repository.setActivePet(studentId, instanceId) === 0) {
      throw new ApiError(404, 'Pet not found');
    }
    return { activePetId: instanceId };
  }
}
