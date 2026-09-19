/**
 * Pet service.
 *
 * Demonstrates the two ways a plugin is expected to collaborate:
 *
 *   - **classroom data** comes through `ctx.use('classroom.public')`, never through
 *     the `students` table. Pet declares no read access to `students` at all, so if
 *     someone later "optimises" it into a direct query the ownership check fails.
 *   - **reactions to other domains** arrive as events. `subscribeToClassroomEvents`
 *     shows the pattern; a plugin must declare `subscribes` in its manifest or the
 *     runtime rejects the subscription.
 */

import type { ClassroomPort, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { PetElementType, PetPort, PetSnapshot } from '@thinkclass/contracts/domains/pet';
import { ApiError } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import { toPetSnapshot, type PetRepository } from './pet.repository.js';

const ELEMENTS: PetElementType[] = ['fire', 'water', 'grass', 'electric', 'ice', 'dragon', 'normal'];

/** Experience needed to leave `level`; grows with level. */
export function experienceForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

/** Stage thresholds; stage drives which artwork the frontend shows. */
export function stageForLevel(level: number): number {
  if (level >= 40) return 4;
  if (level >= 25) return 3;
  if (level >= 10) return 2;
  return 1;
}

export interface ActionResult {
  pet: PetSnapshot;
  experienceGained: number;
  leveledUp: boolean;
}

export class PetService {
  constructor(
    private readonly repository: PetRepository,
    private readonly classroom: ClassroomPort,
    private readonly ctx: KernelContext,
  ) {}

  /**
   * The existing pet for a student.
   *
   * Two different absences, deliberately distinguished: an unknown student is a
   * 404, while a known student without a pet is a successful `null` (they are simply
   * eligible to adopt). Collapsing them would make a typo in a student id look like
   * a student who has not adopted yet.
   */
  async getForStudent(studentId: number): Promise<PetSnapshot | null> {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, `学生不存在: ${studentId}`, { code: 'STUDENT_NOT_FOUND' });
    const row = this.repository.findByStudentId(studentId);
    return row ? toPetSnapshot(row) : null;
  }

  async adopt(input: { studentId: number; name: string; element?: PetElementType; actorId: number }): Promise<PetSnapshot> {
    const student = await this.requireStudent(input.studentId);

    const existing = this.repository.findByStudentId(input.studentId);
    if (existing) {
      // ApiError rather than a bare Error: the kernel renders it with its status and
      // message, whereas an unknown throw becomes a generic 500 and the reason is
      // lost to the client.
      throw new ApiError(409, `${student.name} 已经拥有一只精灵`, { code: 'PET_ALREADY_ADOPTED' });
    }

    const element = input.element && ELEMENTS.includes(input.element) ? input.element : pickElement(input.studentId);
    const row = this.repository.insert({ studentId: input.studentId, name: input.name, element });
    const snapshot = toPetSnapshot(row);

    this.ctx.events.emit('pet.adopted', {
      petId: snapshot.id,
      studentId: input.studentId,
      classId: student.classId,
      element: snapshot.element,
      actorId: input.actorId,
    });

    return snapshot;
  }

  async act(input: {
    studentId: number;
    action: 'feed' | 'play' | 'train';
    actorId: number;
  }): Promise<ActionResult> {
    const student = await this.requireStudent(input.studentId);
    const row = this.repository.findByStudentId(input.studentId);
    if (!row) throw new ApiError(404, `${student.name} 还没有精灵`, { code: 'PET_NOT_FOUND' });

    const gained = input.action === 'train' ? 25 : input.action === 'play' ? 15 : 10;
    let level = row.level;
    let experience = row.experience + gained;

    let leveledUp = false;
    while (experience >= experienceForLevel(level)) {
      experience -= experienceForLevel(level);
      level += 1;
      leveledUp = true;
    }

    const updated = this.repository.updateProgress(row.id, level, experience, stageForLevel(level));
    const snapshot = toPetSnapshot(updated);

    this.ctx.events.emit('pet.action.performed', {
      petId: snapshot.id,
      studentId: input.studentId,
      action: input.action,
      experienceGained: gained,
      leveledUp,
      actorId: input.actorId,
    });

    // Raising a pet is worth points. This goes through the classroom port, so pet
    // never writes to `students` itself.
    if (leveledUp) {
      await this.classroom.adjustPoints({
        studentId: input.studentId,
        delta: 5,
        reason: `精灵升级到 Lv.${level}`,
        actorId: input.actorId,
      });
    }

    return { pet: snapshot, experienceGained: gained, leveledUp };
  }

  /** Publish the port other plugins resolve. */
  toPort(): PetPort {
    return {
      getPetForStudent: (studentId) => this.getForStudent(studentId),
      hasPet: async (studentId) => this.repository.findByStudentId(studentId) !== null,
      applyAction: (input) => this.act(input),
    };
  }

  private async requireStudent(studentId: number): Promise<StudentSnapshot> {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, `学生不存在: ${studentId}`, { code: 'STUDENT_NOT_FOUND' });
    return student;
  }
}

/** Deterministic element assignment: the same student always gets the same element. */
function pickElement(studentId: number): PetElementType {
  return ELEMENTS[studentId % ELEMENTS.length];
}
