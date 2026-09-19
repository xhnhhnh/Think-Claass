import type { Assignment, AssignmentPayload, StudentAssignment, StudentAssignmentUpdatePayload } from '@thinkclass/contracts/domains/learning';

export interface AssignmentsRepository {
  listAssignments(classId?: number): Assignment[];
  createAssignment(input: AssignmentPayload): number;
  updateAssignment(id: number, input: Partial<AssignmentPayload>): void;
  deleteAssignment(id: number): void;
  listStudentAssignments(input: { studentId?: number; assignmentId?: number }): StudentAssignment[];
  updateStudentAssignment(id: number, input: StudentAssignmentUpdatePayload): void;
}

export type { Assignment, AssignmentPayload, StudentAssignment, StudentAssignmentUpdatePayload };
