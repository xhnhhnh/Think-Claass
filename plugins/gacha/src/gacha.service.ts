/**
 * Gacha service.
 *
 * Two storage boundaries meet here, and the difference is the whole point of the
 * migration:
 *
 *   pet_dictionary / gacha_pools / student_pets   owned by this plugin -> `ctx.db`
 *   students.available_points, records            owned by classroom    -> `classroom.public`
 *
 * ## What changed from the pre-migration service
 *
 * The old `draw()` ran the balance update, the ledger insert and the pet inserts in
 * one synchronous better-sqlite3 transaction. That is no longer possible: the balance
 * and the ledger are written by the classroom plugin through an async port, and a
 * synchronous transaction cannot span an `await`. So a draw is a short sequence of
 * individually-atomic steps:
 *
 *   validate -> feature gate -> resolve the pool -> debit through the port
 *            -> grant the pets in one `db.tx` -> append the ledger entry
 *
 * The ordering puts the failure that can actually happen on the harmless side: the
 * debit happens first and the platform writes (the pets) are the only thing that can
 * fail afterwards, so a failure refunds the points and leaves the student whole. The
 * remaining exposure is a process death between two steps, which the ledger makes
 * visible. Restoring true cross-plugin atomicity needs a kernel-level unit of work,
 * which is P6/P7 work - the same tradeoff economy.service.ts documents.
 *
 * ## Feature gates and messages
 *
 * `assertClassFeatureEnabled` / `assertStudentFeatureEnabled` from
 * `api/utils/classFeatures.ts` are replaced by `classroom.public.checkClassFeature` /
 * `checkStudentFeature`. The port returns a refusal instead of throwing, so each code
 * is mapped back onto exactly the status and message the pre-migration service
 * produced (`toApiError` below).
 */

import type { ClassroomPort, ClassroomRefusal, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type { CreatePetDictionaryPayload, GachaDrawPayload, GachaPool, GachaRarity, PetDictionaryEntry } from '@thinkclass/contracts/domains/gacha';
import { ApiError } from '@thinkclass/kernel';

import type { GachaRepository } from './gacha.types.js';

function positiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

function rollRarity(pool: Pick<GachaPool, 'ssr_rate' | 'sr_rate' | 'r_rate'>, random: () => number): GachaRarity {
  const rand = random();
  if (rand < pool.ssr_rate) return 'SSR';
  if (rand < pool.ssr_rate + pool.sr_rate) return 'SR';
  if (rand < pool.ssr_rate + pool.sr_rate + pool.r_rate) return 'R';
  return 'N';
}

/**
 * Map a refusal from the classroom port onto this domain's HTTP status.
 *
 * The port cannot throw the kernel's `ApiError` (contracts are type-only, guardrail
 * G6), so it returns a code and each caller decides. These are exactly the statuses
 * and messages the pre-migration service produced - `assertClassFeatureEnabled` threw
 * 403 `该功能当前已关闭`, `getClassIdByStudentId` threw 404 `学生未找到`, and the
 * balance check in `draw` threw 400 `Insufficient points` - so the HTTP contract does
 * not move.
 */
function toApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal.code) {
    case 'feature-disabled':
      return new ApiError(403, '该功能当前已关闭');
    case 'student-not-found':
      return new ApiError(404, '学生未找到');
    case 'class-not-found':
      return new ApiError(404, '班级未找到');
    case 'insufficient-credits':
      return new ApiError(400, 'Insufficient points');
    default:
      return new ApiError(400, refusal.message);
  }
}

/**
 * Thrown when the rolled rarity has no `pet_dictionary` entry, so there is no pet to grant.
 *
 * `roll()` used to return the invented entry `{ id: 0, name: '星尘碎片 (未找到图鉴)' }` instead -
 * a "pet" that exists in no table - and it did so *after* the points had already been debited, so
 * the student paid for it. A draw that cannot grant a pet is now an error: `draw()` catches it,
 * refunds the points through the classroom port and rethrows, so the charge never stands.
 *
 * `ApiError`'s constructor resets the prototype to `ApiError` (its own compatibility shim), so the
 * subclass restores it - otherwise `instanceof GachaDictionaryMissingError` would be false.
 */
export class GachaDictionaryMissingError extends ApiError {
  constructor(readonly rarity: GachaRarity) {
    super(500, `图鉴未配置：稀有度 ${rarity} 没有可发放的宠物`, { code: 'GACHA_DICTIONARY_MISSING' });
    this.name = 'GachaDictionaryMissingError';
    Object.setPrototypeOf(this, GachaDictionaryMissingError.prototype);
  }
}

export class GachaService {
  constructor(
    private readonly repository: GachaRepository,
    private readonly classroom: ClassroomPort,
    private readonly random: () => number = Math.random,
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

  /**
   * List a class's active pools, creating the default pool on first read.
   *
   * The create-on-empty and the read stay in one transaction, exactly as before: two
   * concurrent first reads must not both insert the default pool.
   */
  async listPools(classIdInput: unknown): Promise<GachaPool[]> {
    const classId = positiveInteger(classIdInput, 'Class id');
    await this.assertClassFeatureEnabled(classId);

    return this.repository.transaction(() => {
      if (this.repository.listPools(classId).length === 0) {
        this.repository.createDefaultPool(classId);
      }
      return this.repository.listActivePools(classId);
    });
  }

  async draw(studentIdInput: unknown, input: GachaDrawPayload): Promise<PetDictionaryEntry[]> {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const poolId = positiveInteger(input.poolId, 'Pool id');
    const times = positiveInteger(input.times, 'Times');

    // Runs before anything is spent, so a disabled feature costs nothing. The
    // pre-migration order (validate ids -> gate -> look the pool up) is preserved.
    await this.requireGachaStudent(studentId);

    const pool = this.repository.getPool(poolId);
    if (!pool) throw new ApiError(404, 'Not found');

    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, 'Not found');

    const totalCost = pool.cost_points * times;
    if (student.availablePoints < totalCost) throw new ApiError(400, 'Insufficient points');

    // The port is the only writer of `students`, and it re-checks the balance, so an
    // overdraw is refused even if the read above went stale.
    const moved = await this.classroom.transferStudentCredits({
      studentId,
      delta: -totalCost,
      reason: 'gacha.draw',
      // The legacy endpoints take the student from the path and carry no actor; 0 is
      // the same placeholder economy passes for the same reason.
      actorId: 0,
    });
    if (moved.refusal) {
      // Nothing platform-side has been written yet, so there is nothing to undo.
      throw toApiError(moved.refusal);
    }

    let results: PetDictionaryEntry[];
    try {
      results = this.repository.transaction(() => this.roll(studentId, pool, times));
    } catch (error) {
      // The points are already gone. Grant them back so a failed draw is not a silent
      // charge; the pets are written in one transaction, so a throw means nothing was
      // inserted.
      await this.classroom.transferStudentCredits({
        studentId,
        delta: totalCost,
        reason: 'gacha.draw.rollback',
        actorId: 0,
      });
      throw error;
    }

    await this.ledger(
      studentId,
      'GACHA_PULL',
      -totalCost,
      `Performed ${times}x Gacha Pull from ${pool.name}`,
    );
    return results;
  }

  async listCollection(studentIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    await this.requireGachaStudent(studentId);
    return this.repository.listCollection(studentId);
  }

  /**
   * Activate one collected pet.
   *
   * `clearActivePet` then `setActivePet` are two statements, exactly as in the
   * pre-migration repository: a 404 here leaves the previous pet deactivated, which is
   * the behaviour the legacy endpoint had. They are not wrapped in a new transaction,
   * because that would change the contract this relocation is supposed to preserve.
   */
  async setActivePet(studentIdInput: unknown, instanceIdInput: unknown) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    const instanceId = positiveInteger(instanceIdInput, 'Pet instance id');
    await this.requireGachaStudent(studentId);

    this.repository.clearActivePet(studentId);
    if (this.repository.setActivePet(studentId, instanceId) === 0) {
      throw new ApiError(404, 'Pet not found');
    }
    return { activePetId: instanceId };
  }

  /**
   * Resolve the student and check the `enable_gacha` flag.
   *
   * The order is preserved from `assertStudentFeatureEnabled`: a missing student is a
   * 404 (`学生未找到`) before the feature check, and both run before any write.
   */
  private async requireGachaStudent(studentId: number): Promise<StudentSnapshot> {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, '学生未找到');

    const gate = await this.classroom.checkStudentFeature(studentId, 'enable_gacha');
    if (gate.refusal) throw toApiError(gate.refusal);

    return student;
  }

  /** Reject when a *class* has gacha off; the pool belongs to a class, not a student. */
  private async assertClassFeatureEnabled(classId: number): Promise<void> {
    const gate = await this.classroom.checkClassFeature(classId, 'enable_gacha');
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /** Roll `times` pets and grant them; called inside `repository.transaction`. */
  private roll(studentId: number, pool: Pick<GachaPool, 'ssr_rate' | 'sr_rate' | 'r_rate'>, times: number) {
    const results: PetDictionaryEntry[] = [];
    for (let i = 0; i < times; i += 1) {
      const rarity = rollRarity(pool, this.random);
      const candidates = this.repository.listDictionaryByRarity(rarity);
      if (candidates.length === 0) {
        // Nothing is inserted for this roll and the whole roll sequence is abandoned: the caller
        // (`draw`) refunds the debit and surfaces the error. Returning a stand-in entry here is
        // what charged students for a pet that no table contains.
        throw new GachaDictionaryMissingError(rarity);
      }
      const wonPet = candidates[Math.floor(this.random() * candidates.length)];
      this.repository.insertStudentPet(studentId, wonPet.id);
      results.push(wonPet);
    }
    return results;
  }

  /**
   * Append to the shared point ledger.
   *
   * The pre-migration repository inserted into `records` directly; that write now goes
   * through the port, which is the only sanctioned writer of the ledger.
   */
  private async ledger(studentId: number, type: string, amount: number, description: string): Promise<void> {
    await this.classroom.recordStudentLedgerEntry({ studentId, type, amount, description });
  }
}
