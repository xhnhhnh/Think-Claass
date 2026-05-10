import { ApiError } from '../../utils/asyncHandler.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled } from '../../utils/classFeatures.js';
import type { ClassResources, CreateTerritoryPayload, SlgRepository, TerritoryContributionPayload } from './slg.types.js';

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

export class SlgService {
  constructor(private readonly repository: SlgRepository) {}

  getMap(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    assertClassFeatureEnabled(classId, 'enable_slg');
    return {
      territories: this.repository.listTerritories(classId),
      resources: this.repository.getOrCreateResources(classId),
    };
  }

  contribute(studentIdInput: unknown, territoryIdInput: unknown, input: TerritoryContributionPayload) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const territoryId = positiveInteger(territoryIdInput, 'Territory id');
    const amount = positiveInteger(input.amount, 'Amount');
    assertStudentFeatureEnabled(studentId, 'enable_slg');

    return this.repository.transaction(() => {
      const student = this.repository.getStudent(studentId);
      if (!student) throw new ApiError(404, 'Student not found');
      if (student.available_points < amount) throw new ApiError(400, 'Insufficient points');

      const territory = this.repository.getTerritory(territoryId);
      if (!territory) throw new ApiError(404, 'Territory not found');
      if (territory.status === 'owned') throw new ApiError(400, 'Territory already owned');

      this.repository.updateStudentAvailablePoints(studentId, student.available_points - amount);
      this.repository.insertRecord(studentId, 'SLG_CONTRIBUTE', -amount, `Contributed to territory: ${territory.name}`);

      const nextContribution = territory.current_contribution + amount;
      if (nextContribution >= territory.cost_to_unlock) {
        this.repository.updateTerritoryContribution(territoryId, territory.cost_to_unlock, 'owned');
      } else {
        this.repository.updateTerritoryContribution(territoryId, nextContribution, 'unlocking');
      }
      return { contributed: true };
    });
  }

  createTerritory(input: CreateTerritoryPayload) {
    const classId = positiveInteger(input.class_id, 'Class id');
    if (!input.name || !input.type) throw new ApiError(400, 'Missing fields');
    assertClassFeatureEnabled(classId, 'enable_slg');
    const territory = {
      class_id: classId,
      name: input.name,
      type: input.type,
      cost_to_unlock: Number(input.cost_to_unlock || 1000),
      x_pos: Number(input.x_pos || 0),
      y_pos: Number(input.y_pos || 0),
    };
    return { territoryId: this.repository.createTerritory(territory) };
  }

  yieldResources(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    assertClassFeatureEnabled(classId, 'enable_slg');
    return this.repository.transaction(() => {
      this.repository.getOrCreateResources(classId);
      const resourceYield: Omit<ClassResources, 'id' | 'class_id'> = { wood: 0, stone: 0, magic_dust: 0, gold: 0 };
      for (const territory of this.repository.listOwnedTerritoryYields(classId)) {
        if (territory.type === 'forest') resourceYield.wood += territory.level * 10;
        if (territory.type === 'mine') resourceYield.stone += territory.level * 10;
        if (territory.type === 'magic_spring') resourceYield.magic_dust += territory.level * 5;
        if (territory.type === 'city') resourceYield.gold += territory.level * 20;
      }
      if (resourceYield.wood || resourceYield.stone || resourceYield.magic_dust || resourceYield.gold) {
        this.repository.addResources(classId, resourceYield);
      }
      return { yield: resourceYield };
    });
  }
}
