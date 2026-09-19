/**
 * Challenge repository.
 *
 * Takes the plugin's ownership-checked `DbApi` instead of the raw connection
 * (`api/db.ts`), so every statement is validated against the manifest:
 *
 *   challenge_records, world_bosses   adopted (owned, legacy names) -> read + write
 *   question_bank, pets               declared in `data.reads`      -> read only
 *   students, records                 classroom-owned               -> NOT here at all
 *
 * The SQL is carried over verbatim from `challenge.repository.sqlite.ts` so the row
 * shapes - and therefore the response bodies - do not move. Two statements have no
 * equivalent here on purpose: `addStudentPoints`/`listStudentsInClass` (now
 * `classroom.public.adjustPoints` / `listClassStudents`) and `insertRecord` (now
 * `classroom.public.recordStudentLedgerEntry`).
 */

import type { DbApi } from '@thinkclass/plugin-sdk';
import type { WorldBossDto } from '@thinkclass/contracts/domains/challenge';

import type { ChallengeBossInput, ChallengeQuestionRow, ChallengeRepository } from './challenge.types.js';

export function createChallengeRepository(db: DbApi): ChallengeRepository {
  return {
    listQuestions(limit) {
      return db.query<ChallengeQuestionRow>(
        `
        SELECT id, title, type, options, answer, explanation
        FROM question_bank
        ORDER BY RANDOM()
        LIMIT ?
      `,
        [limit],
      );
    },

    getQuestion(questionId) {
      return (
        db.get<ChallengeQuestionRow>(
          'SELECT id, title, type, options, answer, explanation FROM question_bank WHERE id = ?',
          [questionId],
        ) ?? null
      );
    },

    insertChallengeRecord(studentId, score, correctCount, wrongCount) {
      db.run(`INSERT INTO challenge_records (student_id, score, correct_count, wrong_count) VALUES (?, ?, ?, ?)`, [
        studentId,
        score,
        correctCount,
        wrongCount,
      ]);
    },

    listBosses() {
      return db.query<WorldBossDto>(`SELECT * FROM world_bosses ORDER BY id DESC`);
    },

    getActiveBoss() {
      return (
        db.get<WorldBossDto>(`SELECT * FROM world_bosses WHERE status = 'active' ORDER BY id DESC LIMIT 1`) ?? null
      );
    },

    getBoss(bossId, activeOnly = false) {
      const sql = activeOnly
        ? "SELECT * FROM world_bosses WHERE id = ? AND status = 'active'"
        : 'SELECT * FROM world_bosses WHERE id = ?';
      return db.get<WorldBossDto>(sql, [bossId]) ?? null;
    },

    createBoss(input: ChallengeBossInput) {
      const result = db.run(
        'INSERT INTO world_bosses (name, description, hp, max_hp, level, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [input.name, input.description, input.hp, input.hp, input.level, input.start_time ?? null, input.end_time ?? null],
      );
      return Number(result.lastInsertRowid);
    },

    updateBossHp(bossId, hp, status) {
      db.run('UPDATE world_bosses SET hp = ?, status = ? WHERE id = ?', [hp, status, bossId]);
    },

    deleteBoss(bossId) {
      db.run('DELETE FROM world_bosses WHERE id = ?', [bossId]);
    },

    getPetAttackPower(studentId) {
      const pet = db.get<{ attack_power: number }>('SELECT attack_power FROM pets WHERE student_id = ?', [studentId]);
      return pet?.attack_power ?? null;
    },
  };
}
