/**
 * PetService unit tests.
 *
 * Rewritten in P4.3b.6 for the plugin world. The pre-migration test
 * (`api/modules/pet/pet.service.test.ts`) faked one repository that also owned `students`,
 * `records` and `parent_activity`; those are other plugins' tables now, so the fake is split
 * into a repository (this plugin's `pets`, plus the two declared reads) and a classroom *port*.
 * That split is the point: the test can now assert that the balance and the ledger move through
 * the port, and that a refused debit leaves the pet untouched.
 *
 * Every behavioural expectation is carried over unchanged - including the three that look like
 * bugs and are contracts: adopting twice is refused, spending points on an action can never
 * lower a level, and a draw awards no experience.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClassroomPort, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { PetDto } from '@thinkclass/contracts/domains/pet';
import { ApiError } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import { PetService } from '../../plugins/pet/src/pet.service.js';
import type { PetRepository, PetRow, PraiseRow } from '../../plugins/pet/src/pet.types.js';

class FakePetRepository implements PetRepository {
  pets = new Map<number, PetRow>();
  praises: PraiseRow[] = [];
  parentActiveToday = new Set<number>();
  nextPetId = 100;

  getPet(studentId: number) {
    return this.pets.get(studentId) ?? null;
  }
  listPetsFor(studentIds: number[]) {
    return studentIds.map((id) => this.pets.get(id)).filter((pet): pet is PetRow => Boolean(pet));
  }
  listLeaderboardPets(studentIds: number[], limit: number) {
    return this.listPetsFor(studentIds)
      .sort((a, b) => b.level - a.level || b.experience - a.experience)
      .slice(0, limit);
  }
  createPet(studentId: number, input: { elementType: string }) {
    const id = this.nextPetId++;
    this.pets.set(studentId, {
      id,
      student_id: studentId,
      element_type: input.elementType,
      custom_image: null,
      image_stage1: null,
      image_stage2: null,
      image_stage3: null,
      image_stage4: null,
      image_stage5: null,
      image_stage6: null,
      level: 1,
      experience: 0,
      attack_power: 10,
      mood: null,
      last_fed_at: null,
    });
    return id;
  }
  upsertPet(studentId: number, input: Record<string, any>) {
    const existing = this.pets.get(studentId);
    if (!existing) {
      this.createPet(studentId, { elementType: input.elementType ?? input.element_type ?? 'normal' });
      return;
    }
    this.pets.set(studentId, {
      ...existing,
      element_type: input.elementType ?? input.element_type ?? existing.element_type,
      level: input.level ?? existing.level,
      experience: input.experience ?? existing.experience,
      attack_power: input.attack_power ?? existing.attack_power,
    });
  }
  updatePetProgress(petId: number, experience: number, level: number, attackPower: number) {
    for (const [studentId, pet] of this.pets) {
      if (pet.id === petId) {
        this.pets.set(studentId, { ...pet, experience, level, attack_power: attackPower, last_fed_at: '2026-01-01 00:00:00' });
      }
    }
  }
  addPetExperience(petId: number, expGain: number) {
    for (const [studentId, pet] of this.pets) {
      if (pet.id === petId) this.pets.set(studentId, { ...pet, experience: pet.experience + expGain });
    }
  }
  listPraises(studentId: number) {
    return this.praises.filter((praise) => praise.student_id === studentId);
  }
  hasTodayParentActivity(studentId: number) {
    return this.parentActiveToday.has(studentId);
  }
}

/** The student balance, the ledger and the class feature gate, as the real port exposes them. */
class FakeClassroom implements ClassroomPort {
  /** Account-deletion scope (P4.3b.14): pet never asks for it; the port requires both. */
  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  students = new Map<number, StudentSnapshot>();
  ledger: Array<{ studentId: number; type: string; amount: number; description: string }> = [];
  parentBuffEnabled = true;

  async getStudentById(studentId: number) {
    return this.students.get(studentId) ?? null;
  }
  async getStudentByUserId(userId: number) {
    return [...this.students.values()].find((s) => s.userId === userId) ?? null;
  }
  async getClassById() {
    return null;
  }
  async listClassStudents(classId: number) {
    return [...this.students.values()]
      .filter((s) => s.classId === classId)
      .sort((a, b) => a.id - b.id);
  }
  async searchClasses() {
    return [];
  }
  async assertStudentInClass(studentId: number, classId: number) {
    const student = this.students.get(studentId);
    if (!student || student.classId !== classId) throw new Error('not in class');
  }
  async adjustPoints() {
    throw new Error('not used by pet');
  }
  async transferStudentCredits(input: { studentId: number; delta: number; ledger?: { type: string; description: string } }) {
    const student = this.students.get(input.studentId);
    if (!student) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    const available = student.availablePoints + input.delta;
    if (available < 0) return { refusal: { code: 'insufficient-credits' as const, message: '积分不足' } };
    this.students.set(input.studentId, { ...student, availablePoints: available });
    if (input.ledger) this.ledger.push({ studentId: input.studentId, type: input.ledger.type, amount: input.delta, description: input.ledger.description });
    return { value: { availablePoints: available } };
  }
  async recordStudentLedgerEntry(entry: { studentId: number; type: string; amount: number; description: string }) {
    this.ledger.push(entry);
  }
  async listStudentLedger(studentId: number) {
    return this.ledger
      .filter((entry) => entry.studentId === studentId)
      .map((entry, index) => ({
        id: index + 1,
        studentId: entry.studentId,
        type: entry.type,
        amount: entry.amount,
        description: entry.description,
        createdAt: '2026-01-01 00:00:00',
      }));
  }
  async sumClassPointsEarnedSince() {
    return 0;
  }
  async checkStudentFeature() {
    return { value: true as const };
  }
  async checkClassFeature() {
    if (!this.parentBuffEnabled) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true as const };
  }
  async checkAnyClassFeature() {
    return this.checkClassFeature();
  }
}

function setup() {
  const repository = new FakePetRepository();
  const classroom = new FakeClassroom();
  const emitted: Array<{ topic: string; payload: unknown }> = [];
  const ctx = {
    events: {
      emit: (topic: string, payload: unknown) => {
        emitted.push({ topic, payload });
      },
    },
  } as unknown as KernelContext;

  classroom.students.set(1, { id: 1, classId: 8, userId: 100, name: '小明', totalPoints: 300, availablePoints: 200, groupId: null });
  classroom.students.set(2, { id: 2, classId: 8, userId: 101, name: '小红', totalPoints: 100, availablePoints: 200, groupId: null });
  classroom.students.set(3, { id: 3, classId: 9, userId: 102, name: '小刚', totalPoints: 0, availablePoints: 200, groupId: null });

  // Deterministic dice: first roll wins, second loses.
  const random = { roll: vi.fn().mockReturnValueOnce(20).mockReturnValueOnce(1) };
  const service = new PetService(repository, classroom, ctx, random);
  return { repository, classroom, emitted, service };
}

describe('PetService (plugin)', () => {
  let repository: FakePetRepository;
  let classroom: FakeClassroom;
  let emitted: Array<{ topic: string; payload: unknown }>;
  let service: PetService;

  beforeEach(() => {
    ({ repository, classroom, emitted, service } = setup());
  });

  it('adopts a pet into its own table and emits pet.adopted', async () => {
    const adopted = await service.adoptPet(1, { elementType: 'fire' }, 7);

    expect(adopted.petId).toBe(100);
    expect(adopted.pet?.element_type).toBe('fire');
    expect(adopted.pet?.level).toBe(1);
    expect(repository.getPet(1)?.element_type).toBe('fire');
    expect(emitted).toEqual([
      { topic: 'pet.adopted', payload: { petId: 100, studentId: 1, classId: 8, element: 'fire', actorId: 7 } },
    ]);
  });

  it('rejects a duplicate adoption and a missing element type, like the legacy service', async () => {
    await service.adoptPet(1, { elementType: 'fire' });

    await expect(service.adoptPet(1, { elementType: 'water' })).rejects.toThrow(ApiError);
    await expect(service.adoptPet(1, { elementType: 'water' })).rejects.toThrow('Pet already adopted');
    await expect(service.adoptPet(2, { elementType: '  ' })).rejects.toThrow('Element type is required');
  });

  it('reports an unknown student as 404 and a student without a pet as a successful null', async () => {
    await expect(service.getStudentPet(999)).rejects.toThrow('Student not found');

    const result = await service.getStudentPet(1);
    expect(result.pet).toBeNull();
    expect(result.hasParentBuff).toBe(false);
  });

  it('interacts by moving points through the port, appending the ledger, and levelling up', async () => {
    await service.adoptPet(1, { elementType: 'fire' });

    const result = await service.interact(1, { actionType: '训练', cost: 60, expGain: 180, type: 'TRAIN' }, 7);

    // The balance moved through the port, not by writing `students` here.
    expect(result.points).toBe(140);
    expect(classroom.students.get(1)?.availablePoints).toBe(140);
    // The ledger entry is the pre-migration one, verbatim.
    expect(classroom.ledger).toEqual([
      { studentId: 1, type: 'TRAIN', amount: -60, description: 'Consumed for 训练' },
    ]);
    // 180 experience, floor(180/100)+1 = 2, attack power floor(180*0.1) = 18.
    expect(result.pet?.experience).toBe(180);
    expect(result.pet?.level).toBe(2);
    expect(result.pet?.attack_power).toBe(18);
    expect(result.pet?.is_dead).toBe(false);
  });

  it('refuses the action when the port refuses the debit, without touching the pet', async () => {
    await service.adoptPet(1, { elementType: 'fire' });

    await expect(service.interact(1, { actionType: '训练', cost: 5000, expGain: 180 }, 7)).rejects.toThrow(
      'Not enough points',
    );

    expect(classroom.ledger).toEqual([]);
    expect(repository.getPet(1)?.experience).toBe(0);
  });

  it('refuses to let a dead pet act, and reports the legacy message', async () => {
    await service.adoptPet(1, { elementType: 'fire' });
    repository.pets.set(1, { ...repository.getPet(1)!, last_fed_at: '2020-01-01 00:00:00' });

    await expect(service.interact(1, { actionType: '训练', cost: 0, expGain: 10 }, 7)).rejects.toThrow(
      '宠物已饿死，请先努力赚取积分复活它！',
    );
    expect((await service.getStudentPet(1)).pet?.is_dead).toBe(true);
  });

  it('awards battle experience to the winner only, and nothing on a draw', async () => {
    await service.adoptPet(1, { elementType: 'fire' });
    await service.adoptPet(2, { elementType: 'water' });

    const result = await service.battle({ studentId: 1, opponentId: 2 });

    expect(result.isWin).toBe(true);
    expect(repository.getPet(1)?.experience).toBe(10);
    expect(repository.getPet(2)?.experience).toBe(0);
  });

  it('lists every student of the class, with or without a pet (LEFT JOIN semantics)', async () => {
    await service.adoptPet(2, { elementType: 'grass' });

    const classPets = await service.listClassPets(8);

    expect(classPets.map((entry) => [entry.student_id, entry.has_pet])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(classPets[0].pet).toBeNull();
    expect(classPets[1].student_name).toBe('小红');
  });

  it('lists only classmates that have a pet (INNER JOIN semantics), never the student themselves', async () => {
    await service.adoptPet(1, { elementType: 'fire' });
    await service.adoptPet(2, { elementType: 'grass' });

    const classmates = await service.listClassmates(1);

    expect(classmates.map((pet) => pet.student_name)).toEqual(['小红']);
  });

  it('orders the leaderboard by level then experience and caps it at ten', async () => {
    for (const id of [1, 2, 3]) await service.adoptPet(id, { elementType: 'fire' });
    repository.pets.set(1, { ...repository.getPet(1)!, level: 5, experience: 10 });
    repository.pets.set(2, { ...repository.getPet(2)!, level: 5, experience: 90 });
    repository.pets.set(3, { ...repository.getPet(3)!, level: 6, experience: 0 });

    // Class 9 holds only student 3, so asking for class 8 must not leak them.
    expect((await service.listLeaderboard(8)).map((pet) => pet.student_id)).toEqual([2, 1]);
    expect((await service.listLeaderboard(9)).map((pet) => pet.student_id)).toEqual([3]);
  });

  it('attaches the parent buff only when the class feature is on AND a parent was active today', async () => {
    await service.adoptPet(1, { elementType: 'fire' });

    repository.parentActiveToday.add(1);
    expect((await service.getStudentPet(1)).hasParentBuff).toBe(true);

    classroom.parentBuffEnabled = false;
    expect((await service.getStudentPet(1)).hasParentBuff).toBe(false);
  });

  it('serves the dashboard from the port and the two declared reads', async () => {
    await service.adoptPet(1, { elementType: 'fire' });
    await service.interact(1, { actionType: '训练', cost: 60, expGain: 0, type: 'TRAIN' }, 7);
    repository.praises.push({
      id: 5,
      teacher_id: 7,
      student_id: 1,
      content: '很有进步',
      color: null,
      created_at: '2026-01-02 00:00:00',
    });

    const dashboard = await service.getStudentDashboard(1);

    expect(dashboard.availablePoints).toBe(140);
    expect(dashboard.records).toEqual([
      { id: 1, student_id: 1, type: 'TRAIN', amount: -60, description: 'Consumed for 训练', created_at: '2026-01-01 00:00:00' },
    ]);
    // `student_name` comes from the classroom port, not from a local `students` query: the
    // plugin holds no decryption key and `students` is another plugin's table.
    expect(dashboard.praises).toEqual([
      { id: 5, teacher_id: 7, student_id: 1, content: '很有进步', color: null, created_at: '2026-01-02 00:00:00', student_name: '小明' },
    ]);
  });

  it('publishes the battle profile the challenge domain needs instead of a table read', async () => {
    await service.adoptPet(1, { elementType: 'fire' });
    const port = service.toPort();

    expect(await port.hasPet(1)).toBe(true);
    expect(await port.getBattleProfile(1)).toEqual({ attackPower: 10, level: 1, isDead: false });
    expect(await port.getBattleProfile(999)).toBeNull();
    expect((await port.getPetForStudent(1))?.elementType).toBe('fire');
  });

  it('normalises updates the way the legacy route did', async () => {
    await service.adoptPet(1, { elementType: 'fire' });

    const capped = await service.updatePet(1, { level: 99, experience: -5, attack_power: -3 } as never);

    expect(capped.pet?.level).toBe(6);
    expect(capped.pet?.experience).toBe(0);
    expect(capped.pet?.attack_power).toBe(0);
  });
});

describe('PetService rejects malformed ids', () => {
  it.each([['0'], ['-1'], ['abc'], ['1.5']])('rejects student id %s', async (id) => {
    const { service } = setup();
    await expect(service.getStudentPet(id)).rejects.toThrow('Student id is invalid');
  });

  it('rejects a bad class id and a bad battle opponent', async () => {
    const { service } = setup();
    await expect(service.listClassPets('nope')).rejects.toThrow('Class id is invalid');
    await expect(service.battle({ studentId: 1, opponentId: 0 })).rejects.toThrow('Opponent id is invalid');
  });
});

/** A tiny guard against the port drifting away from what the plugin publishes. */
describe('PetDto shape', () => {
  it('keeps the snake_case fields the frontend parses', async () => {
    const { service, repository } = setup();
    await service.adoptPet(1, { elementType: 'fire' });
    const pet = (await service.getStudentPet(1)).pet as PetDto;

    expect(Object.keys(pet).sort()).toEqual(
      [
        'attack_power',
        'custom_image',
        'element_type',
        'experience',
        'has_parent_buff',
        'id',
        'image_stage1',
        'image_stage2',
        'image_stage3',
        'image_stage4',
        'image_stage5',
        'image_stage6',
        'is_dead',
        'last_fed_at',
        'level',
        'mood',
        'student_id',
      ].sort(),
    );
    expect(repository.pets.size).toBe(1);
  });
});
