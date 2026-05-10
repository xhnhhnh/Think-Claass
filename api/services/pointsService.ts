import db from '../db.js';
import { ApiError } from '../utils/asyncHandler.js';
import { getStudentOrThrow } from './studentService.js';

export function revivePetIfPresent(studentId: number) {
  try {
    db.prepare('UPDATE pets SET last_fed_at = CURRENT_TIMESTAMP WHERE student_id = ?').run(studentId);
  } catch {
    // Older databases may not have pet activity columns yet.
  }
}

export function adjustStudentPoints(
  studentId: unknown,
  amount: number,
  description: string,
  options: { recordType?: string; revivePetOnPositive?: boolean } = {},
) {
  if (!Number.isFinite(amount)) {
    throw new ApiError(400, 'Invalid amount');
  }

  const student = getStudentOrThrow(studentId);
  const newTotal = amount > 0 ? student.total_points + amount : student.total_points;
  const newAvailable = Math.max(0, student.available_points + amount);

  db.prepare('UPDATE students SET total_points = ?, available_points = ? WHERE id = ?').run(newTotal, newAvailable, student.id);
  db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(
    student.id,
    options.recordType ?? (amount > 0 ? 'ADD_POINTS' : 'DEDUCT_POINTS'),
    amount,
    description,
  );

  if (options.revivePetOnPositive && amount > 0) {
    revivePetIfPresent(student.id);
  }

  return { total_points: newTotal, available_points: newAvailable };
}

export function spendStudentPoints(studentId: unknown, amount: number, recordType: string, description: string) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'Invalid amount');
  }

  const student = getStudentOrThrow(studentId);
  if (student.available_points < amount) {
    throw new ApiError(400, 'Not enough points');
  }

  const newAvailable = student.available_points - amount;
  db.prepare('UPDATE students SET available_points = ? WHERE id = ?').run(newAvailable, student.id);
  db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(
    student.id,
    recordType,
    -amount,
    description,
  );

  return { total_points: student.total_points, available_points: newAvailable };
}

export function addStudentPoints(studentId: unknown, amount: number, recordType: string, description: string) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'Invalid amount');
  }

  const student = getStudentOrThrow(studentId);
  const newTotal = student.total_points + amount;
  const newAvailable = student.available_points + amount;

  db.prepare('UPDATE students SET total_points = ?, available_points = ? WHERE id = ?').run(newTotal, newAvailable, student.id);
  db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)').run(
    student.id,
    recordType,
    amount,
    description,
  );

  return { total_points: newTotal, available_points: newAvailable };
}

