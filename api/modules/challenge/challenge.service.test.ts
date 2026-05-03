import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/classFeatures.js', () => ({
  assertClassFeatureEnabled: vi.fn(),
  assertStudentFeatureEnabled: vi.fn(),
}));

import { ChallengeService } from './challenge.service';
import type { ChallengeQuestionRow, ChallengeRepository, ChallengeStudentRow, WorldBossDto, WorldBossPayload } from './challenge.types';

class FakeChallengeRepository implements ChallengeRepository {
  questions = new Map<number, ChallengeQuestionRow>();
  students = new Map<number, ChallengeStudentRow>();
  bosses = new Map<number, WorldBossDto>();
  petAttackPower = new Map<number, number>();
  records: Array<{ studentId: number; type: string; amount: number; description: string }> = [];
  challengeRecords: Array<{ studentId: number; score: number; correctCount: number; wrongCount: number }> = [];
  nextBossId = 10;

  transaction<T>(fn: () => T): T { return fn(); }
  listQuestions(limit: number) { return [...this.questions.values()].slice(0, limit); }
  getQuestion(questionId: number) { return this.questions.get(questionId) ?? null; }
  getStudent(studentId: number) { return this.students.get(studentId) ?? null; }
  addStudentPoints(studentId: number, points: number) {
    const student = this.students.get(studentId)!;
    this.students.set(studentId, {
      ...student,
      total_points: student.total_points + points,
      available_points: student.available_points + points,
    });
  }
  insertRecord(studentId: number, type: string, amount: number, description: string) {
    this.records.push({ studentId, type, amount, description });
  }
  insertChallengeRecord(studentId: number, score: number, correctCount: number, wrongCount: number) {
    this.challengeRecords.push({ studentId, score, correctCount, wrongCount });
  }
  listBosses() { return [...this.bosses.values()].sort((a, b) => b.id - a.id); }
  getActiveBoss() { return this.listBosses().find((boss) => boss.status === 'active') ?? null; }
  getBoss(bossId: number, activeOnly = false) {
    const boss = this.bosses.get(bossId) ?? null;
    if (activeOnly && boss?.status !== 'active') return null;
    return boss;
  }
  createBoss(input: Required<Pick<WorldBossPayload, 'name' | 'description' | 'hp' | 'level'>> & Pick<WorldBossPayload, 'start_time' | 'end_time'>) {
    const id = this.nextBossId++;
    this.bosses.set(id, { id, name: input.name, description: input.description, hp: input.hp, max_hp: input.hp, level: input.level, status: 'active' });
    return id;
  }
  updateBossHp(bossId: number, hp: number, status: string) {
    const boss = this.bosses.get(bossId)!;
    this.bosses.set(bossId, { ...boss, hp, status });
  }
  deleteBoss(bossId: number) { this.bosses.delete(bossId); }
  getPetAttackPower(studentId: number) { return this.petAttackPower.get(studentId) ?? null; }
  listStudentsInClass(classId: number) { return [...this.students.values()].filter((student) => student.class_id === classId); }
}

function setup() {
  const repository = new FakeChallengeRepository();
  repository.questions.set(1, { id: 1, title: '单选', type: 'SINGLE', options: '["A","B"]', answer: 'A', explanation: '因为 A' });
  repository.questions.set(2, { id: 2, title: '多选', type: 'MULTIPLE', options: '["A","B"]', answer: '["A","B"]', explanation: '' });
  repository.students.set(1, { id: 1, class_id: 3, total_points: 0, available_points: 0 });
  repository.students.set(2, { id: 2, class_id: 3, total_points: 0, available_points: 0 });
  repository.bosses.set(5, { id: 5, name: 'Boss', description: '', hp: 30, max_hp: 30, level: 2, status: 'active' });
  repository.petAttackPower.set(1, 35);
  return { repository, service: new ChallengeService(repository) };
}

describe('ChallengeService', () => {
  let repository: FakeChallengeRepository;
  let service: ChallengeService;

  beforeEach(() => {
    ({ repository, service } = setup());
  });

  it('parses question options', () => {
    expect(service.getQuestions(1, 1)[0].options).toEqual(['A', 'B']);
  });

  it('scores single and multiple answers and records rewards', () => {
    const result = service.submitAnswers(1, {
      1: 'A',
      2: ['B', 'A'],
    });

    expect(result.score).toBe(4);
    expect(result.correctCount).toBe(2);
    expect(repository.students.get(1)?.available_points).toBe(4);
    expect(repository.challengeRecords[0]).toEqual({ studentId: 1, score: 4, correctCount: 2, wrongCount: 0 });
  });

  it('attacks bosses with pet power and rewards the whole class when defeated', () => {
    const result = service.attackBoss(5, 1);

    expect(result.defeated).toBe(true);
    expect(result.damage).toBe(35);
    expect(result.rewardPoints).toBe(100);
    expect(repository.bosses.get(5)?.status).toBe('defeated');
    expect(repository.students.get(1)?.available_points).toBe(100);
    expect(repository.students.get(2)?.available_points).toBe(100);
  });
});
