import type { Exam, ExamGrade, ExamPayload, SaveExamGradePayload } from '../../../src/shared/learning/contracts.js';

export interface ExamsRepository {
  transaction<T>(fn: () => T): T;
  listExams(classId?: number): Exam[];
  createExam(input: ExamPayload): number;
  listStudentIds(classId: number): Array<{ id: number }>;
  createStudentExam(examId: number, studentId: number): void;
  getExam(id: number): Exam | null;
  listGrades(examId: number): ExamGrade[];
  getStudentExam(examId: number, studentId: number): { id: number } | null;
  upsertGrade(examId: number, grade: SaveExamGradePayload): void;
  updateExam(id: number, input: Partial<ExamPayload>): void;
  deleteExam(id: number): void;
  listStudentExams(input: { studentId?: number; examId?: number }): unknown[];
  updateStudentExam(id: number, input: { score: number | null; feedback?: string | null }): void;
  getStudentExamById(id: number): { id: number } | null;
}

export type { Exam, ExamGrade, ExamPayload, SaveExamGradePayload };
