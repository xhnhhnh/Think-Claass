import { ApiError } from '../../utils/asyncHandler.js';
import { getNextPetStats, isPetDead, mapPetRow } from './pet.mappers.js';
import type {
  AdoptPetInput,
  PetActionInput,
  PetBattleInput,
  PetRandom,
  PetRepository,
  UpdatePetInput,
} from './pet.types.js';

const MAX_PET_LEVEL = 6;

function assertPositiveId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return id;
}

export class DefaultPetRandom implements PetRandom {
  roll(maxInclusive: number) {
    return Math.floor(Math.random() * maxInclusive) + 1;
  }
}

export class PetService {
  constructor(
    private readonly repository: PetRepository,
    private readonly random: PetRandom = new DefaultPetRandom(),
  ) {}

  getStudentPet(studentIdInput: unknown) {
    const studentId = assertPositiveId(studentIdInput, 'Student id');
    const student = this.repository.getStudent(studentId);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    const pet = mapPetRow(this.repository.getPet(studentId));
    const hasParentBuff = this.repository.hasParentBuff(studentId, student.class_id);

    return {
      pet: pet ? { ...pet, has_parent_buff: hasParentBuff } : null,
      hasParentBuff,
    };
  }

  getStudentDashboard(studentIdInput: unknown) {
    const studentId = assertPositiveId(studentIdInput, 'Student id');
    const student = this.repository.getStudent(studentId);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    const { pet, hasParentBuff } = this.getStudentPet(studentId);

    return {
      pet,
      hasParentBuff,
      availablePoints: student.available_points,
      praises: this.repository.listPraises(studentId),
      records: this.repository.listRecords(studentId),
    };
  }

  listClassPets(classIdInput: unknown) {
    const classId = assertPositiveId(classIdInput, 'Class id');
    return this.repository.listClassPets(classId);
  }

  listClassmates(studentIdInput: unknown) {
    const studentId = assertPositiveId(studentIdInput, 'Student id');
    const student = this.repository.getStudent(studentId);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    return this.repository.listClassmatePets(studentId, student.class_id);
  }

  listLeaderboard(classIdInput: unknown) {
    const classId = assertPositiveId(classIdInput, 'Class id');
    return this.repository.listLeaderboard(classId);
  }

  adoptPet(studentIdInput: unknown, input: AdoptPetInput) {
    const studentId = assertPositiveId(studentIdInput, 'Student id');
    const elementType = String(input.elementType || '').trim();
    if (!elementType) {
      throw new ApiError(400, 'Element type is required');
    }

    const student = this.repository.getStudent(studentId);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    if (this.repository.getPet(studentId)) {
      throw new ApiError(400, 'Pet already adopted');
    }

    const petId = this.repository.createPet(studentId, { ...input, elementType });
    const pet = mapPetRow(this.repository.getPet(studentId));

    return { petId, pet };
  }

  updatePet(studentIdInput: unknown, input: UpdatePetInput) {
    const studentId = assertPositiveId(studentIdInput, 'Student id');
    const student = this.repository.getStudent(studentId);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    const normalized: UpdatePetInput = {
      ...input,
      level: input.level === undefined ? undefined : Math.min(MAX_PET_LEVEL, Math.max(1, Number(input.level))),
      experience: input.experience === undefined ? undefined : Math.max(0, Number(input.experience)),
      attack_power: input.attack_power === undefined ? undefined : Math.max(0, Number(input.attack_power)),
    };

    this.repository.upsertPet(studentId, normalized);
    return { pet: mapPetRow(this.repository.getPet(studentId)) };
  }

  interact(studentIdInput: unknown, input: PetActionInput) {
    const studentId = assertPositiveId(studentIdInput, 'Student id');
    const cost = Math.max(0, Number(input.cost));
    const expGain = Math.max(0, Number(input.expGain));
    const actionType = String(input.actionType || '').trim();
    const recordType = input.type || 'FEED_PET';

    if (!actionType) {
      throw new ApiError(400, 'Action type is required');
    }

    const currentPet = this.repository.getPet(studentId);
    if (!currentPet) {
      throw new ApiError(404, 'Pet not found');
    }

    if (isPetDead(currentPet)) {
      throw new ApiError(400, '宠物已饿死，请先努力赚取积分复活它！');
    }

    return this.repository.transaction(() => {
      const points = this.repository.deductStudentPoints(studentId, cost);
      this.repository.insertRecord(studentId, recordType, -cost, `Consumed for ${actionType}`);

      const petBefore = this.repository.getPet(studentId);
      if (!petBefore) {
        throw new ApiError(404, 'Pet not found');
      }

      const nextStats = getNextPetStats(petBefore.experience, petBefore.level, expGain);
      this.repository.updatePetProgress(petBefore.id, nextStats.experience, nextStats.level, nextStats.attackPower);
      const pet = mapPetRow(this.repository.getPet(studentId));

      return { points, pet: pet ? { ...pet, is_dead: false } : pet };
    });
  }

  battle(input: PetBattleInput) {
    const studentId = assertPositiveId(input.studentId, 'Student id');
    const opponentId = assertPositiveId(input.opponentId, 'Opponent id');

    const myPet = this.repository.getPet(studentId);
    const opponentPet = this.repository.getPet(opponentId);
    if (!myPet || !opponentPet) {
      throw new ApiError(404, 'Pet not found');
    }

    if (isPetDead(myPet)) {
      throw new ApiError(400, '宠物已饿死，请先努力赚取积分复活它！');
    }
    if (isPetDead(opponentPet)) {
      throw new ApiError(400, '对方的宠物已饿死，无法对战！');
    }

    const myRoll = this.random.roll(20);
    const opponentRoll = this.random.roll(20);
    const myTotalPower = (myPet.attack_power || 10) + myRoll;
    const opponentTotalPower = (opponentPet.attack_power || 10) + opponentRoll;
    const isWin = myTotalPower > opponentTotalPower;
    const isDraw = myTotalPower === opponentTotalPower;

    if (isWin) {
      this.repository.addPetExperience(myPet.id, 10);
    } else if (!isDraw) {
      this.repository.addPetExperience(opponentPet.id, 10);
    }

    return { isWin, isDraw, myRoll, opponentRoll, myTotalPower, opponentTotalPower };
  }
}
