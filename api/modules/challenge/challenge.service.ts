import { ApiError } from '../../utils/asyncHandler.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled } from '../../utils/classFeatures.js';
import { isAnswerCorrect, mapQuestionRow, parseMaybeJson, toAnswerList } from './challenge.mappers.js';
import type { ChallengeAnswersInput, ChallengeRepository, WorldBossPayload } from './challenge.types.js';

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} is invalid`);
  }
  return number;
}

export class ChallengeService {
  constructor(private readonly repository: ChallengeRepository) {}

  getQuestions(limitInput: unknown = 10, studentIdInput?: unknown) {
    const limit = Math.min(50, Math.max(1, Number(limitInput) || 10));
    if (studentIdInput) {
      const studentId = positiveInteger(studentIdInput, 'Student id');
      this.getStudentOrThrow(studentId);
      assertStudentFeatureEnabled(studentId, 'enable_challenge');
    }
    return this.repository.listQuestions(limit).map(mapQuestionRow);
  }

  submitAnswers(studentIdInput: unknown, answers: ChallengeAnswersInput) {
    const studentId = positiveInteger(studentIdInput, 'Student id');
    this.getStudentOrThrow(studentId);
    assertStudentFeatureEnabled(studentId, 'enable_challenge');
    if (!answers) {
      throw new ApiError(400, 'Missing required fields');
    }

    return this.repository.transaction(() => {
      let correctCount = 0;
      let wrongCount = 0;
      let score = 0;
      const results = [];

      for (const item of toAnswerList(answers)) {
        const question = this.repository.getQuestion(positiveInteger(item.questionId, 'Question id'));
        if (!question) continue;

        const correct = isAnswerCorrect(item.answer, question.answer);
        if (correct) {
          correctCount += 1;
          score += 2;
        } else {
          wrongCount += 1;
        }

        results.push({
          questionId: question.id,
          isCorrect: correct,
          correctAnswer: parseMaybeJson(question.answer) as string | string[],
          explanation: question.explanation ?? '',
          userAnswer: item.answer,
        });
      }

      if (score > 0) {
        this.repository.addStudentPoints(studentId, score);
        this.repository.insertRecord(studentId, 'CHALLENGE_REWARD', score, '挑战模式加分');
      }

      this.repository.insertChallengeRecord(studentId, score, correctCount, wrongCount);
      return { score, correctCount, wrongCount, results };
    });
  }

  getActiveBoss(classIdInput: unknown) {
    const classId = positiveInteger(classIdInput, 'Class id');
    assertClassFeatureEnabled(classId, 'enable_world_boss');
    return this.repository.getActiveBoss();
  }

  listBosses() {
    return this.repository.listBosses();
  }

  createBoss(input: WorldBossPayload) {
    const name = String(input.name || '').trim();
    const hp = positiveInteger(input.hp, 'Boss hp');
    if (!name) {
      throw new ApiError(400, 'Invalid input');
    }
    const id = this.repository.createBoss({
      name,
      description: input.description ?? '',
      hp,
      level: input.level ? positiveInteger(input.level, 'Boss level') : 1,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
    });
    return { id };
  }

  deleteBoss(bossIdInput: unknown) {
    const bossId = positiveInteger(bossIdInput, 'Boss id');
    if (!this.repository.getBoss(bossId)) {
      throw new ApiError(404, 'Boss not found');
    }
    this.repository.deleteBoss(bossId);
    return { deleted: true };
  }

  attackBoss(bossIdInput: unknown, studentIdInput: unknown) {
    const bossId = positiveInteger(bossIdInput, 'Boss id');
    const studentId = positiveInteger(studentIdInput, 'Student id');
    assertStudentFeatureEnabled(studentId, 'enable_world_boss');

    return this.repository.transaction(() => {
      const boss = this.repository.getBoss(bossId, true);
      if (!boss) {
        throw new ApiError(404, 'Boss not found or already defeated');
      }

      const student = this.getStudentOrThrow(studentId);
      const damage = this.repository.getPetAttackPower(studentId) ?? 10;
      const newHp = Math.max(0, boss.hp - damage);
      const defeated = newHp <= 0;
      const rewardPoints = defeated ? boss.level * 50 : 0;

      this.repository.updateBossHp(bossId, newHp, defeated ? 'defeated' : 'active');

      if (defeated) {
        for (const classStudent of this.repository.listStudentsInClass(student.class_id)) {
          this.repository.addStudentPoints(classStudent.id, rewardPoints);
          this.repository.insertRecord(classStudent.id, 'BOSS_REWARD', rewardPoints, '世界Boss被击败奖励');
        }
      }

      this.repository.insertRecord(studentId, 'BOSS_ATTACK', 0, `攻击了世界Boss，造成 ${damage} 点伤害`);
      return { defeated, damage, newHp, rewardPoints };
    });
  }

  private getStudentOrThrow(studentId: number) {
    const student = this.repository.getStudent(studentId);
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }
    return student;
  }
}
