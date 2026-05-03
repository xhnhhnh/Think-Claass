import db from '../../db.js';
import type { ChallengeQuestionRow, ChallengeRepository, ChallengeStudentRow, WorldBossDto, WorldBossPayload } from './challenge.types.js';

export class SqliteChallengeRepository implements ChallengeRepository {
  transaction<T>(fn: () => T): T {
    return db.transaction(fn)();
  }

  listQuestions(limit: number) {
    return db
      .prepare(
        `
        SELECT id, title, type, options, answer, explanation
        FROM question_bank
        ORDER BY RANDOM()
        LIMIT ?
      `,
      )
      .all(limit) as ChallengeQuestionRow[];
  }

  getQuestion(questionId: number) {
    return db
      .prepare('SELECT id, title, type, options, answer, explanation FROM question_bank WHERE id = ?')
      .get(questionId) as ChallengeQuestionRow | null;
  }

  getStudent(studentId: number) {
    return db
      .prepare('SELECT id, class_id, total_points, available_points FROM students WHERE id = ?')
      .get(studentId) as ChallengeStudentRow | null;
  }

  addStudentPoints(studentId: number, points: number) {
    const student = this.getStudent(studentId);
    if (!student) return;
    db.prepare('UPDATE students SET total_points = ?, available_points = ? WHERE id = ?').run(
      student.total_points + points,
      student.available_points + points,
      studentId,
    );
  }

  insertRecord(studentId: number, type: string, amount: number, description: string) {
    db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(studentId, type, amount, description);
  }

  insertChallengeRecord(studentId: number, score: number, correctCount: number, wrongCount: number) {
    db.prepare('INSERT INTO challenge_records (student_id, score, correct_count, wrong_count) VALUES (?, ?, ?, ?)').run(
      studentId,
      score,
      correctCount,
      wrongCount,
    );
  }

  listBosses() {
    return db.prepare('SELECT * FROM world_bosses ORDER BY id DESC').all() as WorldBossDto[];
  }

  getActiveBoss() {
    return db
      .prepare("SELECT * FROM world_bosses WHERE status = 'active' ORDER BY id DESC LIMIT 1")
      .get() as WorldBossDto | null;
  }

  getBoss(bossId: number, activeOnly = false) {
    const sql = activeOnly
      ? "SELECT * FROM world_bosses WHERE id = ? AND status = 'active'"
      : 'SELECT * FROM world_bosses WHERE id = ?';
    return db.prepare(sql).get(bossId) as WorldBossDto | null;
  }

  createBoss(input: Required<Pick<WorldBossPayload, 'name' | 'description' | 'hp' | 'level'>> & Pick<WorldBossPayload, 'start_time' | 'end_time'>) {
    const result = db
      .prepare('INSERT INTO world_bosses (name, description, hp, max_hp, level, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(input.name, input.description, input.hp, input.hp, input.level, input.start_time ?? null, input.end_time ?? null);
    return Number(result.lastInsertRowid);
  }

  updateBossHp(bossId: number, hp: number, status: string) {
    db.prepare('UPDATE world_bosses SET hp = ?, status = ? WHERE id = ?').run(hp, status, bossId);
  }

  deleteBoss(bossId: number) {
    db.prepare('DELETE FROM world_bosses WHERE id = ?').run(bossId);
  }

  getPetAttackPower(studentId: number) {
    const pet = db.prepare('SELECT attack_power FROM pets WHERE student_id = ?').get(studentId) as { attack_power: number } | undefined;
    return pet?.attack_power ?? null;
  }

  listStudentsInClass(classId: number) {
    return db
      .prepare('SELECT id, class_id, total_points, available_points FROM students WHERE class_id = ?')
      .all(classId) as ChallengeStudentRow[];
  }
}
