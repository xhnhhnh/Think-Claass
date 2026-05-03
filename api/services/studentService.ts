import db, { decrypt, encrypt } from '../db.js';
import { ApiError } from '../utils/asyncHandler.js';
import { hashPassword } from '../utils/password.js';

export interface StudentRow {
  id: number;
  user_id: number;
  class_id: number;
  name: string;
  total_points: number;
  available_points: number;
  group_id?: number | null;
}

export interface CreatedStudent {
  id: number;
  user_id: number;
  username: string;
  class_id: number;
  name: string;
}

export function normalizeId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isFinite(id)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return id;
}

export function getStudentOrThrow(studentId: unknown) {
  const id = normalizeId(studentId, 'student');
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id) as StudentRow | undefined;
  if (!student) {
    throw new ApiError(404, 'Student not found');
  }
  return student;
}

export function decryptStudentName<T extends { name: string }>(student: T) {
  return { ...student, name: decrypt(student.name) };
}

export function decryptStudentList<T extends { name: string }>(students: T[]) {
  return students.map(decryptStudentName);
}

export function resolveDefaultClassId(classId?: unknown) {
  if (classId) {
    return normalizeId(classId, 'class');
  }

  const defaultClass = db.prepare('SELECT id FROM classes LIMIT 1').get() as { id: number } | undefined;
  return defaultClass?.id ?? 1;
}

export function createStudentAccount(input: {
  username: string;
  name: string;
  classId?: unknown;
  allowUsernameSuffix?: boolean;
  initialPassword?: string;
}) {
  const baseUsername = input.username.trim();
  const studentName = input.name.trim();

  if (!baseUsername || !studentName) {
    throw new ApiError(400, '请填写学生姓名和用户名');
  }

  const classId = resolveDefaultClassId(input.classId);
  let finalUsername = baseUsername;

  if (input.allowUsernameSuffix) {
    let suffix = 1;
    while (db.prepare('SELECT id FROM users WHERE username = ?').get(finalUsername)) {
      finalUsername = `${baseUsername}${suffix}`;
      suffix++;
    }
  }

  const userResult = db
    .prepare('INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)')
    .run('student', finalUsername, hashPassword(input.initialPassword ?? '123456'));
  const userId = Number(userResult.lastInsertRowid);

  const studentResult = db
    .prepare('INSERT INTO students (user_id, class_id, name) VALUES (?, ?, ?)')
    .run(userId, classId, encrypt(studentName));

  return {
    id: Number(studentResult.lastInsertRowid),
    user_id: userId,
    username: finalUsername,
    class_id: classId,
    name: studentName,
  } satisfies CreatedStudent;
}

