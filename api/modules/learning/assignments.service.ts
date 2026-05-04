import { ApiError } from '../../utils/asyncHandler.js';
import type { AssignmentPayload, AssignmentsRepository, StudentAssignmentUpdatePayload } from './assignments.types.js';

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

export class AssignmentsService {
  constructor(private readonly repository: AssignmentsRepository) {}

  listAssignments(classIdInput?: unknown) {
    return this.repository.listAssignments(optionalPositiveInteger(classIdInput, 'class_id'));
  }

  createAssignment(input: AssignmentPayload) {
    const classId = positiveInteger(input.class_id, 'class_id');
    const teacherId = positiveInteger(input.teacher_id, 'teacher_id');
    if (!input.title || typeof input.title !== 'string') throw new ApiError(400, 'Missing title');
    return { id: this.repository.createAssignment({ ...input, class_id: classId, teacher_id: teacherId, title: input.title.trim() }) };
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
