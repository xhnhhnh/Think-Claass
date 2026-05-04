import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '../../utils/asyncHandler';
import { ExamsService } from './exams.service';
import type { Exam, ExamGrade, ExamPayload, ExamsRepository, SaveExamGradePayload } from './exams.types';

class FakeExamsRepository implements ExamsRepository {
  exams = new Map<number, Exam>();
  grades = new Map<string, ExamGrade>();
  nextId = 1;

  transaction<T>(fn: () => T): T { return fn(); }
  listExams(classId?: number) { return [...this.exams.values()].filter((exam) => classId === undefined || exam.class_id === classId); }
  createExam(input: ExamPayload) {
    const id = this.nextId++;
    this.exams.set(id, { id, created_at: '', description: null, exam_date: null, ...input });
    return id;
  }
  listStudentIds() { return [{ id: 10 }, { id: 11 }]; }
  createStudentExam(examId: number, studentId: number) {
    this.grades.set(`${examId}:${studentId}`, { id: studentId, exam_id: examId, student_id: studentId, student_name: `S${studentId}`, score: null, feedback: null });
  }
  getExam(id: number) { return this.exams.get(id) ?? null; }
  listGrades(examId: number) { return [...this.grades.values()].filter((grade) => grade.exam_id === examId); }
  getStudentExam(examId: number, studentId: number) { return this.grades.has(`${examId}:${studentId}`) ? { id: studentId } : null; }
  upsertGrade(examId: number, grade: SaveExamGradePayload) {
    if (!this.getStudentExam(examId, grade.student_id)) this.createStudentExam(examId, grade.student_id);
    const existing = this.grades.get(`${examId}:${grade.student_id}`)!;
    this.grades.set(`${examId}:${grade.student_id}`, { ...existing, score: grade.score, feedback: grade.feedback ?? null });
  }
  updateExam(id: number, input: Partial<ExamPayload>) { this.exams.set(id, { ...this.exams.get(id)!, ...input }); }
  deleteExam(id: number) { this.exams.delete(id); }
  listStudentExams() { return [...this.grades.values()]; }
  updateStudentExam() {}
  getStudentExamById() { return { id: 1 }; }
}

describe('ExamsService', () => {
  let service: ExamsService;

  beforeEach(() => {
    service = new ExamsService(new FakeExamsRepository());
  });

  it('creates exam and initializes student grade rows', () => {
    const created = service.createExam({ class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    expect(service.getGrades(created.id).grades).toHaveLength(2);
  });

  it('saves grades and rejects missing exams', () => {
    const created = service.createExam({ class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    service.saveGrades(created.id, [{ student_id: 10, score: 95 }]);
    expect(service.getGrades(created.id).grades.find((grade) => grade.student_id === 10)?.score).toBe(95);
    expect(() => service.getGrades(999)).toThrow(ApiError);
  });
});
