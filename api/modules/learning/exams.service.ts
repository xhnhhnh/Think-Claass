import { ApiError } from '../../utils/asyncHandler.js';
import type { ExamPayload, ExamsRepository, SaveExamGradePayload } from './exams.types.js';

function optionalPositiveInteger(value: unknown, label: string) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new ApiError(400, `${label} is invalid`);
  return number;
}

function positiveInteger(value: unknown, label: string) {
  const number = optionalPositiveInteger(value, label);
  if (number === undefined) throw new ApiError(400, `${label} is invalid`);
  return number;
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new ApiError(400, `${label} is invalid`);
  return number;
}

export class ExamsService {
  constructor(private readonly repository: ExamsRepository) {}

  listExams(classIdInput?: unknown) {
    return this.repository.listExams(optionalPositiveInteger(classIdInput, 'class_id'));
  }

  createExam(input: ExamPayload) {
    const classId = positiveInteger(input.class_id, 'class_id');
    const teacherId = positiveInteger(input.teacher_id, 'teacher_id');
    const totalScore = positiveNumber(input.total_score, 'total_score');
    if (!input.title || typeof input.title !== 'string') throw new ApiError(400, 'Missing title');
    const id = this.repository.transaction(() => {
      const examId = this.repository.createExam({ ...input, class_id: classId, teacher_id: teacherId, title: input.title.trim(), total_score: totalScore });
      for (const student of this.repository.listStudentIds(classId)) this.repository.createStudentExam(examId, student.id);
      return examId;
    });
    return { id };
  }

  getGrades(idInput: unknown) {
    const id = positiveInteger(idInput, 'id');
    const exam = this.repository.getExam(id);
    if (!exam) throw new ApiError(404, 'Exam not found');
    return { exam, grades: this.repository.listGrades(id) };
  }

  saveGrades(idInput: unknown, gradesInput: SaveExamGradePayload[]) {
    const id = positiveInteger(idInput, 'id');
    if (!this.repository.getExam(id)) throw new ApiError(404, 'Exam not found');
    if (!Array.isArray(gradesInput) || gradesInput.length === 0) throw new ApiError(400, 'Missing grades');
    this.repository.transaction(() => {
      for (const grade of gradesInput) {
        const studentId = positiveInteger(grade.student_id, 'student_id');
        const score = grade.score === null || grade.score === undefined || String(grade.score) === '' ? null : Number(grade.score);
        if (score !== null && (!Number.isFinite(score) || score < 0)) throw new ApiError(400, 'Invalid score');
        this.repository.upsertGrade(id, { student_id: studentId, score, feedback: grade.feedback ?? null });
      }
    });
    return { saved: true };
  }

  updateExam(idInput: unknown, input: Partial<ExamPayload>) {
    const id = positiveInteger(idInput, 'id');
    if (!this.repository.getExam(id)) throw new ApiError(404, 'Exam not found');
    if (input.title !== undefined && (typeof input.title !== 'string' || !input.title.trim())) throw new ApiError(400, 'Invalid title');
    if (input.total_score !== undefined) positiveNumber(input.total_score, 'total_score');
    this.repository.updateExam(id, input);
    return { updated: true };
  }

  deleteExam(idInput: unknown) {
    const id = positiveInteger(idInput, 'id');
    if (!this.repository.getExam(id)) throw new ApiError(404, 'Exam not found');
    this.repository.deleteExam(id);
    return { deleted: true };
  }

  listStudentExams(input: { student_id?: unknown; exam_id?: unknown }) {
    return this.repository.listStudentExams({
      studentId: optionalPositiveInteger(input.student_id, 'student_id'),
      examId: optionalPositiveInteger(input.exam_id, 'exam_id'),
    });
  }

  updateStudentExam(idInput: unknown, input: { score: number | null; feedback?: string | null }) {
    const id = positiveInteger(idInput, 'id');
    if (!this.repository.getStudentExamById(id)) throw new ApiError(404, 'Student exam record not found');
    const score = input.score === null || input.score === undefined || String(input.score) === '' ? null : Number(input.score);
    if (score !== null && (!Number.isFinite(score) || score < 0)) throw new ApiError(400, 'Invalid score');
    this.repository.updateStudentExam(id, { score, feedback: input.feedback ?? null });
    return { updated: true };
  }
}
