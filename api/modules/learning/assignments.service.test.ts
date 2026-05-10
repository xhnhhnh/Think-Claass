import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '../../utils/asyncHandler';
import { AssignmentsService } from './assignments.service';
import type { Assignment, AssignmentPayload, AssignmentsRepository, StudentAssignment, StudentAssignmentUpdatePayload } from './assignments.types';

class FakeAssignmentsRepository implements AssignmentsRepository {
  assignments = new Map<number, Assignment>();
  studentAssignments = new Map<number, StudentAssignment>();
  nextId = 1;

  listAssignments(classId?: number) {
    return [...this.assignments.values()].filter((assignment) => classId === undefined || assignment.class_id === classId);
  }
  createAssignment(input: AssignmentPayload) {
    const id = this.nextId++;
    this.assignments.set(id, { id, description: null, due_date: null, reward_points: 0, ...input });
    return id;
  }
  updateAssignment(id: number, input: Partial<AssignmentPayload>) {
    const assignment = this.assignments.get(id)!;
    this.assignments.set(id, { ...assignment, ...input });
  }
  deleteAssignment(id: number) {
    this.assignments.delete(id);
  }
  listStudentAssignments(input: { studentId?: number; assignmentId?: number }) {
    return [...this.studentAssignments.values()].filter(
      (record) =>
        (input.studentId === undefined || record.student_id === input.studentId) &&
        (input.assignmentId === undefined || record.assignment_id === input.assignmentId),
    );
  }
  updateStudentAssignment(id: number, input: StudentAssignmentUpdatePayload) {
    const record = this.studentAssignments.get(id)!;
    this.studentAssignments.set(id, { ...record, ...input });
  }
}

describe('AssignmentsService', () => {
  let repository: FakeAssignmentsRepository;
  let service: AssignmentsService;

  beforeEach(() => {
    repository = new FakeAssignmentsRepository();
    service = new AssignmentsService(repository);
  });

  it('creates, filters, and deletes assignments', () => {
    const created = service.createAssignment({ class_id: 1, teacher_id: 2, title: '阅读' });
    service.createAssignment({ class_id: 2, teacher_id: 2, title: '数学' });
    expect(service.listAssignments(1)).toHaveLength(1);
    service.deleteAssignment(created.id);
    expect(service.listAssignments()).toHaveLength(1);
  });

  it('rejects empty updates for student assignments', () => {
    expect(() => service.updateStudentAssignment(1, {})).toThrow(ApiError);
  });
});
