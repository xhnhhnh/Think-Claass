/**
 * Assignments + exams services.
 *
 * Behavior is relocated from `api/modules/learning/assignments.service.ts` and
 * `exams.service.ts` unchanged: the same validation order, the same messages, and the
 * same `{ id }` / `{ updated: true }` / `{ deleted: true }` / `{ saved: true }` return
 * shapes.
 *
 * The only import that changed is `ApiError`: the deleted services used
 * `api/utils/apiError.js`, which is a *different class* from the kernel's, so
 * `instanceof` would not hold across the boundary. A plugin throws the kernel's.
 */

import { ApiError } from '@thinkclass/kernel';
import type {
  AssignmentPayload,
  ExamPayload,
  SaveExamGradePayload,
  StudentAssignmentUpdatePayload,
} from '@thinkclass/contracts/domains/learning';

import type { AssignmentsRepository, ExamsRepository } from './assignments.repository.js';

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

export class AssignmentsService {
  constructor(private readonly repository: AssignmentsRepository) {}

  listAssignments(classIdInput?: unknown) {
    return this.repository.listAssignments(optionalPositiveInteger(classIdInput, 'class_id'));
  }

  createAssignment(input: AssignmentPayload) {
    const classId = positiveInteger(input.class_id, 'class_id');
    const teacherId = positiveInteger(input.teacher_id, 'teacher_id');
    if (!input.title || typeof input.title !== 'string') throw new ApiError(400, 'Missing title');
    return {
      id: this.repository.createAssignment({
        ...input,
        class_id: classId,
        teacher_id: teacherId,
        title: input.title.trim(),
      }),
    };
  }

  updateAssignment(idInput: unknown, input: Partial<AssignmentPayload>) {
    const id = positiveInteger(idInput, 'id');
    if (!input.title || typeof input.title !== 'string') throw new ApiError(400, 'Missing title');
    this.repository.updateAssignment(id, input);
    return { updated: true };
  }

  deleteAssignment(idInput: unknown) {
    const id = positiveInteger(idInput, 'id');
    this.repository.deleteAssignment(id);
    return { deleted: true };
  }

  listStudentAssignments(input: { student_id?: unknown; assignment_id?: unknown }) {
    return this.repository.listStudentAssignments({
      studentId: optionalPositiveInteger(input.student_id, 'student_id'),
      assignmentId: optionalPositiveInteger(input.assignment_id, 'assignment_id'),
    });
  }

  updateStudentAssignment(idInput: unknown, input: StudentAssignmentUpdatePayload) {
    const id = positiveInteger(idInput, 'id');
    if (!input || Object.keys(input).length === 0) throw new ApiError(400, 'No fields to update');
    this.repository.updateStudentAssignment(id, input);
    return { updated: true };
  }
}

export class ExamsService {
  constructor(private readonly repository: ExamsRepository) {}

  listExams(classIdInput?: unknown) {
    return this.repository.listExams(optionalPositiveInteger(classIdInput, 'class_id'));
  }

  /**
   * Creating an exam also creates one empty `student_exams` row per student in the class,
   * inside one transaction. `listStudentIds` reads the classroom-owned `students` table;
   * the manifest declares it as a read.
   */
  createExam(input: ExamPayload) {
    const classId = positiveInteger(input.class_id, 'class_id');
    const teacherId = positiveInteger(input.teacher_id, 'teacher_id');
    const totalScore = positiveNumber(input.total_score, 'total_score');
    if (!input.title || typeof input.title !== 'string') throw new ApiError(400, 'Missing title');

    const id = this.repository.transaction(() => {
      const examId = this.repository.createExam({
        ...input,
        class_id: classId,
        teacher_id: teacherId,
        title: input.title.trim(),
        total_score: totalScore,
      });
      for (const student of this.repository.listStudentIds(classId)) {
        this.repository.createStudentExam(examId, student.id);
      }
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
        const score =
          grade.score === null || grade.score === undefined || String(grade.score) === ''
            ? null
            : Number(grade.score);
        if (score !== null && (!Number.isFinite(score) || score < 0)) throw new ApiError(400, 'Invalid score');
        this.repository.upsertGrade(id, { student_id: studentId, score, feedback: grade.feedback ?? null });
      }
    });

    return { saved: true };
  }

  updateExam(idInput: unknown, input: Partial<ExamPayload>) {
    const id = positiveInteger(idInput, 'id');
    if (!this.repository.getExam(id)) throw new ApiError(404, 'Exam not found');
    if (input.title !== undefined && (typeof input.title !== 'string' || !input.title.trim())) {
      throw new ApiError(400, 'Invalid title');
    }
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
    const score =
      input.score === null || input.score === undefined || String(input.score) === '' ? null : Number(input.score);
    if (score !== null && (!Number.isFinite(score) || score < 0)) throw new ApiError(400, 'Invalid score');
    this.repository.updateStudentExam(id, { score, feedback: input.feedback ?? null });
    return { updated: true };
  }
}
