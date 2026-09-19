/**
 * Pet service.
 *
 * Relocated from `api/modules/pet/pet.service.ts`. The rules are the pre-plugin ones,
 * including the ones that look like bugs and are pinned by the frontend:
 *
 *   * a pet dies after three unfed days and a dead pet cannot act or battle;
 *   * spending points on an action cannot lower a level, and level 6 is the ceiling;
 *   * adopting twice is a 400, not an idempotent success.
 *
 * What changed is where the data comes from. The legacy service held one repository that
 * reached every table it needed; here `students`, `records` and the class feature flags go
 * through `classroom.public`, because those tables belong to the classroom plugin. `pets`
 * stays local - the plugin owns it - and `praises` / `parent_activity` are declared reads.
 *
 * ## Ordering note for `interact`
 *
 * The legacy implementation wrapped "deduct points, append the ledger row, update the pet" in
 * one `db.transaction`. That is no longer available: the debit happens inside another plugin,
 * through an async port, and `DbApi.tx` cannot span an await (better-sqlite3 would commit
 * around the promise). The port is the transaction boundary now. The observable difference is
 * narrow - a failure after the debit but before the pet update leaves points spent - and it is
 * recorded here rather than papered over with a fake transaction.
 */

import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import type {
  PetActionInput,
  PetBattleInput,
  PetBattleResult,
  PetDto,
  PetPort,
  UpdatePetInput,
} from '@thinkclass/contracts/domains/pet';
import { ApiError } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import { getNextPetStats, mapClassPetStudent, mapPetRow } from './pet.mappers.js';
import type {
  AdoptPetInput,
  ClassPetStudentDto,
  PetRandom,
  PetRecordDto,
  PetRepository,
  PetRow,
} from './pet.types.js';

const MAX_PET_LEVEL = 6;
const PARENT_BUFF_FEATURE = 'enable_parent_buff';
/** Fallback actor for the legacy routes, which are not actor-scoped (see HANDOFF §10 item 3). */
const NO_ACTOR = 0;

function assertPositiveId(value: unknown, label: string): number {
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
    private readonly classroom: ClassroomPort,
    private readonly ctx: KernelContext,
    private readonly random: PetRandom = new DefaultPetRandom(),
  ) {}

  // -- reads ----------------------------------------------------------------

  async getStudentPet(studentIdInput: unknown) {
    const student = await this.requireStudent(assertPositiveId(studentIdInput, 'Student id'));

    const pet = mapPetRow(this.repository.getPet(student.id));
    const hasParentBuff = await this.hasParentBuff(student.id, student.classId);

    return {
      pet: pet ? { ...pet, has_parent_buff: hasParentBuff } : null,
      hasParentBuff,
    };
  }

  async getStudentDashboard(studentIdInput: unknown) {
    const student = await this.requireStudent(assertPositiveId(studentIdInput, 'Student id'));
    const { pet, hasParentBuff } = await this.getStudentPet(student.id);

    return {
      pet,
      hasParentBuff,
      availablePoints: student.availablePoints,
      praises: await this.listPraises(student.id),
      records: await this.listRecords(student.id),
    };
  }

  async listClassPets(classIdInput: unknown): Promise<ClassPetStudentDto[]> {
    const classId = assertPositiveId(classIdInput, 'Class id');
    const students = await this.classroom.listClassStudents(classId);
    const pets = new Map(this.repository.listPetsFor(students.map((s) => s.id)).map((pet) => [pet.student_id, pet]));

    // Every student of the class appears, with or without a pet: the legacy query was a
    // LEFT JOIN from `students`, and the class roster page renders the gaps.
    return students.map((student) => mapClassPetStudent(student, pets.get(student.id) ?? null));
  }

  async listClassmates(studentIdInput: unknown): Promise<Array<PetDto & { student_name: string }>> {
    const student = await this.requireStudent(assertPositiveId(studentIdInput, 'Student id'));
    const classmates = (await this.classroom.listClassStudents(student.classId)).filter((s) => s.id !== student.id);
    const pets = this.repository.listPetsFor(classmates.map((s) => s.id));
    const names = new Map(classmates.map((s) => [s.id, s.name]));

    // INNER JOIN semantics: a classmate without a pet is absent from this list.
    return pets.map((pet) => ({ ...(mapPetRow(pet) as PetDto), student_name: names.get(pet.student_id) ?? '' }));
  }

  async listLeaderboard(classIdInput: unknown): Promise<Array<PetDto & { student_name: string }>> {
    const classId = assertPositiveId(classIdInput, 'Class id');
    const students = await this.classroom.listClassStudents(classId);
    const pets = this.repository.listLeaderboardPets(students.map((s) => s.id), 10);
    const names = new Map(students.map((s) => [s.id, s.name]));

    return pets.map((pet) => ({ ...(mapPetRow(pet) as PetDto), student_name: names.get(pet.student_id) ?? '' }));
  }

  private async listPraises(studentId: number) {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) return [];

    return this.repository.listPraises(studentId).map((praise) => ({ ...praise, student_name: student.name }));
  }

  private async listRecords(studentId: number): Promise<PetRecordDto[]> {
    const rows = await this.classroom.listStudentLedger(studentId);
    return rows.map((row) => ({
      id: row.id,
      student_id: row.studentId,
      type: row.type,
      amount: row.amount,
      description: row.description,
      created_at: row.createdAt,
    }));
  }

  // -- writes ---------------------------------------------------------------

  async adoptPet(studentIdInput: unknown, input: AdoptPetInput, actorId = NO_ACTOR) {
    const studentId = assertPositiveId(studentIdInput, 'Student id');
    const elementType = String(input.elementType || '').trim();
    if (!elementType) {
      throw new ApiError(400, 'Element type is required');
    }

    const student = await this.requireStudent(studentId);
    if (this.repository.getPet(studentId)) {
      throw new ApiError(400, 'Pet already adopted');
    }

    const petId = this.repository.createPet(studentId, { ...input, elementType });
    const pet = mapPetRow(this.repository.getPet(studentId));

    this.ctx.events.emit('pet.adopted', {
      petId,
      studentId,
      classId: student.classId,
      element: elementType,
      actorId,
    });

    return { petId, pet };
  }

  async updatePet(studentIdInput: unknown, input: UpdatePetInput) {
    const studentId = assertPositiveId(studentIdInput, 'Student id');
    await this.requireStudent(studentId);

    const normalized: UpdatePetInput = {
      ...input,
      level: input.level === undefined ? undefined : Math.min(MAX_PET_LEVEL, Math.max(1, Number(input.level))),
      experience: input.experience === undefined ? undefined : Math.max(0, Number(input.experience)),
      attack_power: input.attack_power === undefined ? undefined : Math.max(0, Number(input.attack_power)),
    };

    this.repository.upsertPet(studentId, normalized);
    return { pet: mapPetRow(this.repository.getPet(studentId)) };
  }

  async interact(studentIdInput: unknown, input: PetActionInput, actorId = NO_ACTOR) {
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
    if (this.petIsDead(currentPet)) {
      throw new ApiError(400, '宠物已饿死，请先努力赚取积分复活它！');
    }

    const payment = await this.classroom.transferStudentCredits({
      studentId,
      delta: -cost,
      reason: `Consumed for ${actionType}`,
      actorId,
    });
    // The port reports a refusal as data, so the legacy `Not enough points` 400 is reproduced
    // here rather than thrown by the classroom plugin.
    if (payment.refusal) {
      throw new ApiError(400, 'Not enough points');
    }

    await this.classroom.recordStudentLedgerEntry({
      studentId,
      type: recordType,
      amount: -cost,
      description: `Consumed for ${actionType}`,
    });

    const petBefore = this.repository.getPet(studentId);
    if (!petBefore) {
      throw new ApiError(404, 'Pet not found');
    }

    const nextStats = getNextPetStats(petBefore.experience, petBefore.level, expGain);
    this.repository.updatePetProgress(petBefore.id, nextStats.experience, nextStats.level, nextStats.attackPower);
    const pet = mapPetRow(this.repository.getPet(studentId));

    this.ctx.events.emit('pet.action.performed', {
      petId: petBefore.id,
      studentId,
      actionType,
      cost,
      experienceGained: expGain,
      leveledUp: nextStats.level > petBefore.level,
      actorId,
    });

    // The legacy route forced `is_dead: false`: a pet that just ate is alive even if its
    // stored `last_fed_at` was stale at read time.
    return { points: payment.value?.availablePoints ?? 0, pet: pet ? { ...pet, is_dead: false } : pet };
  }

  async battle(input: PetBattleInput): Promise<PetBattleResult> {
    const studentId = assertPositiveId(input.studentId, 'Student id');
    const opponentId = assertPositiveId(input.opponentId, 'Opponent id');

    const myPet = this.repository.getPet(studentId);
    const opponentPet = this.repository.getPet(opponentId);
    if (!myPet || !opponentPet) {
      throw new ApiError(404, 'Pet not found');
    }

    if (this.petIsDead(myPet)) {
      throw new ApiError(400, '宠物已饿死，请先努力赚取积分复活它！');
    }
    if (this.petIsDead(opponentPet)) {
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

  /** The published port. Read-only: mutation has domain rules, so it stays behind routes. */
  toPort(): PetPort {
    return {
      getPetForStudent: async (studentId) => {
        const row = this.repository.getPet(studentId);
        if (!row) return null;
        return {
          id: row.id,
          studentId: row.student_id,
          elementType: row.element_type,
          level: row.level,
          experience: row.experience,
          attackPower: row.attack_power,
          isDead: this.petIsDead(row),
        };
      },
      hasPet: async (studentId) => this.repository.getPet(studentId) !== null,
      getBattleProfile: async (studentId) => {
        const row = this.repository.getPet(studentId);
        if (!row) return null;
        return { attackPower: row.attack_power, level: row.level, isDead: this.petIsDead(row) };
      },
    };
  }

  // -- helpers --------------------------------------------------------------

  private petIsDead(pet: PetRow): boolean {
    return Boolean(mapPetRow(pet)?.is_dead);
  }

  private async requireStudent(studentId: number) {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }
    return student;
  }

  /**
   * Whether this student's class has the parent buff *and* a parent was active today.
   *
   * The class half goes through the port's feature check, so a capability assignment wins
   * over the legacy `classes.enable_parent_buff` column - the P4.1 resolution order every
   * migrated domain uses. The legacy code read the column directly, so a class whose flag was
   * replaced by an assignment behaves differently; that is the intended direction of P4.1,
   * not an accident of this migration.
   */
  private async hasParentBuff(studentId: number, classId: number): Promise<boolean> {
    const gate = await this.classroom.checkClassFeature(classId, PARENT_BUFF_FEATURE);
    if (gate.refusal) return false;

    return this.repository.hasTodayParentActivity(studentId);
  }
}
