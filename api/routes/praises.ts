import { Router, type Request, type Response } from 'express';

import db, { decrypt } from '../db.js';
import { ApiError, asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { classId } = req.query;
  if (!classId) {
    throw new ApiError(400, 'classId is required');
  }

  const praises = db
    .prepare(
      `
      SELECT p.*, s.name as student_name
      FROM praises p
      JOIN students s ON p.student_id = s.id
      WHERE s.class_id = ?
      ORDER BY p.created_at DESC
    `,
    )
    .all(classId) as any[];

  sendSuccess(res, {
    praises: praises.map((p) => ({ ...p, student_name: decrypt(p.student_name) })),
  });
}));

router.get('/student/:id', asyncHandler(async (req: Request, res: Response) => {
  const praises = db
    .prepare(
      `
      SELECT p.*, s.name as student_name
      FROM praises p
      JOIN students s ON p.student_id = s.id
      WHERE p.student_id = ?
      ORDER BY p.created_at DESC
    `,
    )
    .all(req.params.id) as any[];

  sendSuccess(res, {
    praises: praises.map((p) => ({ ...p, student_name: decrypt(p.student_name) })),
  });
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { teacher_id, student_id, content, color } = req.body;
  if (!teacher_id || !student_id || !content) {
    throw new ApiError(400, 'teacher_id, student_id, and content are required');
  }

  const transaction = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO praises (teacher_id, student_id, content, color) VALUES (?, ?, ?, ?)')
      .run(teacher_id, student_id, content, color || 'bg-yellow-100');

    const newPraise = db.prepare('SELECT * FROM praises WHERE id = ?').get(info.lastInsertRowid);
    const pet = db.prepare('SELECT * FROM pets WHERE student_id = ?').get(student_id) as any;
    if (pet) {
      const expGain = 20;
      const newExp = pet.experience + expGain;
      let newLevel = pet.level;
      const newAttack = Math.floor(newExp * 0.1) || 10;
      const calculatedLevel = Math.floor(newExp / 100) + 1;
      if (calculatedLevel > newLevel && calculatedLevel <= 6) {
        newLevel = calculatedLevel;
      }

      db.prepare('UPDATE pets SET experience = ?, level = ?, attack_power = ?, mood = ? WHERE id = ?').run(
        newExp,
        newLevel,
        newAttack,
        'excited',
        pet.id,
      );
    }

    return newPraise;
  });

  sendSuccess(res, { praise: transaction() });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  db.prepare('DELETE FROM praises WHERE id = ?').run(req.params.id);
  sendSuccess(res, { message: 'Praise deleted successfully' });
}));

export default router;
