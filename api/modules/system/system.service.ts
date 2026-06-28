import { Injectable } from '@nestjs/common';
import db from '../../db.js';

const BACKUP_TABLES = [
  'users',
  'classes',
  'students',
  'pets',
  'shop_items',
  'records',
  'point_presets',
  'student_groups',
  'praises',
  'announcements',
  'settings',
  'certificates',
  'messages',
  'family_tasks',
  'class_announcements',
  'question_bank',
  'system_settings',
];

@Injectable()
export class SystemService {
  getQuestions(teacherId: string | undefined) {
    return db
      .prepare('SELECT * FROM question_bank WHERE teacher_id = ? ORDER BY created_at DESC')
      .all(teacherId);
  }

  createQuestion(input: {
    title?: string;
    type?: string;
    options?: string;
    answer?: string;
    explanation?: string;
    teacher_id?: string | number;
  }) {
    const stmt = db.prepare(
      'INSERT INTO question_bank (title, type, options, answer, explanation, teacher_id) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const info = stmt.run(
      input.title,
      input.type,
      input.options,
      input.answer,
      input.explanation,
      input.teacher_id,
    );

    return db.prepare('SELECT * FROM question_bank WHERE id = ?').get(info.lastInsertRowid);
  }

  updateQuestion(
    id: string,
    input: {
      title?: string;
      type?: string;
      options?: string;
      answer?: string;
      explanation?: string;
    },
  ) {
    db
      .prepare('UPDATE question_bank SET title = ?, type = ?, options = ?, answer = ?, explanation = ? WHERE id = ?')
      .run(input.title, input.type, input.options, input.answer, input.explanation, id);
  }

  deleteQuestion(id: string) {
    db.prepare('DELETE FROM question_bank WHERE id = ?').run(id);
  }

  getSettings() {
    return db.prepare('SELECT * FROM system_settings').all();
  }

  upsertSetting(input: { key?: string; value?: string; description?: string }) {
    const existing = db.prepare('SELECT id FROM system_settings WHERE key = ?').get(input.key);
    if (existing) {
      db
        .prepare('UPDATE system_settings SET value = ?, description = ? WHERE key = ?')
        .run(input.value, input.description, input.key);
      return;
    }

    db
      .prepare('INSERT INTO system_settings (key, value, description) VALUES (?, ?, ?)')
      .run(input.key, input.value, input.description);
  }

  getLogs() {
    return db.prepare(`
      SELECT l.*, u.username as teacher_name
      FROM operation_logs l
      LEFT JOIN users u ON l.teacher_id = u.id
      ORDER BY l.created_at DESC
      LIMIT 100
    `).all();
  }

  exportBackup() {
    const data: Record<string, unknown[]> = {};

    for (const table of BACKUP_TABLES) {
      data[table] = db.prepare(`SELECT * FROM ${table}`).all();
    }

    return JSON.stringify(data, null, 2);
  }
}
