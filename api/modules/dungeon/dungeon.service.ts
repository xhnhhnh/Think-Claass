import { ApiError } from '../../utils/asyncHandler.js';
import { assertStudentFeatureEnabled } from '../../utils/classFeatures.js';
import type { DungeonChoicePayload, DungeonRepository, DungeonRunRow, FloorChoice } from './dungeon.types.js';

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

function parseBuffs(raw: DungeonRunRow['active_buffs']) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRun(run: DungeonRunRow) {
  return { ...run, active_buffs: parseBuffs(run.active_buffs) };
}

export function generateFloorChoices(floor: number, random = Math.random): FloorChoice[] {
  if (floor % 5 === 0) {
    return [
      {
        id: 'boss',
        title: '深渊首领',
        description: '强大的怪物拦住了去路。需消耗大量生命值换取史诗级遗物。',
        type: 'combat',
        hpCost: Math.floor(random() * 30) + 40,
        rewardType: 'buff',
        rewardValue: '史诗遗物: 吸血面具',
      },
    ];
  }

  const choices: FloorChoice[] = [];
  const types: FloorChoice['type'][] = ['combat', 'event', 'treasure', 'rest'];
  for (let i = 0; i < 3; i += 1) {
    const type = types[Math.floor(random() * types.length)];
    if (type === 'combat') {
      choices.push({
        id: `combat_${i}`,
        title: '怪物房间',
        description: '一群小怪。',
        type,
        hpCost: Math.floor(random() * 15) + 5,
        rewardType: 'points',
        rewardValue: Math.floor(random() * 50) + 20,
      });
    } else if (type === 'event') {
      choices.push({
        id: `event_${i}`,
        title: '神秘祭坛',
        description: '献祭生命获取随机增益。',
        type,
        hpCost: 20,
        rewardType: 'buff',
        rewardValue: '神秘恩赐: 攻击力+10%',
      });
    } else if (type === 'treasure') {
      choices.push({
        id: `treasure_${i}`,
        title: '宝箱房间',
        description: '需要消耗一点生命值强行破开陷阱锁。',
        type,
        hpCost: 10,
        rewardType: 'points',
        rewardValue: 100,
      });
    } else {
      choices.push({
        id: `rest_${i}`,
        title: '营地',
        description: '安全的休息区，恢复生命值。',
        type,
        hpCost: 0,
        rewardType: 'heal',
        rewardValue: 30,
      });
    }
  }
  return choices;
}

export class DungeonService {
  constructor(
    private readonly repository: DungeonRepository,
    private readonly random = Math.random,
  ) {}

  getRun(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    assertStudentFeatureEnabled(studentId, 'enable_dungeon');
    const run = this.repository.getActiveRun(studentId);
    if (!run) return { run: null, best_floor: this.repository.getBestFloor(studentId) };
    const mapped = mapRun(run);
    return { run: mapped, choices: generateFloorChoices(mapped.current_floor, this.random) };
  }

  startRun(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    assertStudentFeatureEnabled(studentId, 'enable_dungeon');
    const runId = this.repository.transaction(() => {
      this.repository.endActiveRuns(studentId);
      return this.repository.createRun(studentId);
    });
    return { runId };
  }

  choose(studentIdInput: unknown, input: DungeonChoicePayload) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    assertStudentFeatureEnabled(studentId, 'enable_dungeon');
    return this.repository.transaction(() => {
      const runRow = this.repository.getActiveRun(studentId);
      if (!runRow) throw new ApiError(404, 'No active run');

      const run = mapRun(runRow);
      let newHp = run.current_hp - Number(input.hpCost || 0);
      let status = run.status;
      let newFloor = run.current_floor;
      const activeBuffs = [...run.active_buffs];

      if (newHp <= 0) {
        status = 'died';
        newHp = 0;
      } else {
        newFloor += 1;
        if (input.rewardType === 'heal') {
          newHp = Math.min(run.max_hp, newHp + Number(input.rewardValue || 0));
        } else if (input.rewardType === 'buff' && input.rewardValue) {
          activeBuffs.push(String(input.rewardValue));
        } else if (input.rewardType === 'points') {
          const reward = Number(input.rewardValue || 0);
          this.repository.addStudentPoints(studentId, reward);
          this.repository.insertRecord(studentId, 'DUNGEON_REWARD', reward, `Found treasure on floor ${run.current_floor}`);
        }
      }

      this.repository.updateRun(run.id, {
        currentFloor: newFloor,
        maxFloor: Math.max(newFloor, run.max_floor),
        currentHp: newHp,
        activeBuffs,
        status,
      });

      return { status, newHp, newFloor };
    });
  }

  abandon(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    assertStudentFeatureEnabled(studentId, 'enable_dungeon');
    this.repository.endActiveRuns(studentId);
    return { abandoned: true };
  }
}
