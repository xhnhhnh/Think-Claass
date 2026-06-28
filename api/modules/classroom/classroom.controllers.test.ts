import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';
import {
  AttendanceController,
  ClassesController,
  GroupsController,
  LeavesController,
  PresetsController,
  StudentsController,
} from './classroom.controllers';

function expectHttpError(error: unknown, status: number, message: string) {
  expect(error).toBeInstanceOf(HttpException);
  const httpError = error as HttpException;
  expect(httpError.getStatus()).toBe(status);
  expect(httpError.getResponse()).toEqual({ success: false, message });
}

describe('Classroom Nest controllers', () => {
  const req = {} as any;

  it('keeps student legacy response shapes and ApiError mapping', async () => {
    const service = {
      listStudents: vi.fn().mockReturnValue([{ id: 1, name: 'Ada' }]),
      getStudent: vi.fn().mockImplementation(() => {
        throw new ApiError(404, 'Student not found');
      }),
      getRecords: vi.fn().mockReturnValue([{ id: 3 }]),
      getProgressStar: vi.fn().mockReturnValue([{ id: 4 }]),
      checkin: vi.fn().mockReturnValue({ student: { total_points: 5 }, message: '签到成功，获得 5 积分' }),
    };
    const controller = new StudentsController(service as any);

    expect(controller.listStudents('2')).toEqual({ success: true, students: [{ id: 1, name: 'Ada' }] });
    expect(controller.getRecords({ studentId: '1' })).toEqual({ success: true, records: [{ id: 3 }] });
    expect(controller.getProgressStar('2')).toEqual({ success: true, students: [{ id: 4 }] });
    expect(controller.checkin({ studentId: 1 })).toEqual({
      success: true,
      student: { total_points: 5 },
      message: '签到成功，获得 5 积分',
    });

    try {
      controller.getStudent('99');
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 404, 'Student not found');
    }
  });

  it('keeps class response shapes for both /api/classes and /api/class controller entrypoints', () => {
    const service = {
      listClasses: vi.fn().mockReturnValue([{ id: 1, name: '一班' }]),
      getInvite: vi.fn().mockReturnValue({ class: { id: 1 }, students: [{ id: 2 }] }),
      createClass: vi.fn().mockReturnValue({ id: 3, name: '二班' }),
      getClass: vi.fn().mockReturnValue({ id: 1, name: '一班' }),
      getClassFeatures: vi.fn().mockReturnValue({ classId: 1, features: { enable_peer_review: true }, pet_selection_mode: 'random' }),
      getBigscreen: vi.fn().mockReturnValue({ class: { id: 1 }, topStudents: [], latestPraises: [], latestRecords: [], activeBoss: null }),
      getGuildRanking: vi.fn().mockReturnValue({ rankings: [], isEnabled: false }),
      updateClassSettings: vi.fn().mockReturnValue({ message: 'Settings updated successfully', features: {}, pet_selection_mode: 'random' }),
    };
    const controller = new ClassesController(service as any);

    expect(controller.listClasses(req, '5')).toEqual({ success: true, classes: [{ id: 1, name: '一班' }] });
    expect(controller.getInvite('ABC123', 'parent')).toEqual({ success: true, class: { id: 1 }, students: [{ id: 2 }] });
    expect(controller.createClass(req, { name: '二班' })).toEqual({ success: true, class: { id: 3, name: '二班' } });
    expect(controller.getClass('1')).toEqual({ success: true, class: { id: 1, name: '一班' } });
    expect(controller.getClassFeatures('1')).toEqual({
      success: true,
      classId: 1,
      features: { enable_peer_review: true },
      pet_selection_mode: 'random',
    });
    expect(controller.getBigscreen('1')).toEqual({
      success: true,
      class: { id: 1 },
      topStudents: [],
      latestPraises: [],
      latestRecords: [],
      activeBoss: null,
    });
    expect(controller.getGuildRanking('1')).toEqual({ success: true, rankings: [], isEnabled: false });
    expect(controller.updateClassSettings('1', { enable_peer_review: 1 })).toEqual({
      success: true,
      message: 'Settings updated successfully',
      features: {},
      pet_selection_mode: 'random',
    });
  });

  it('keeps groups and presets validation/fallback messages', () => {
    const groups = new GroupsController({
      listGroups: vi.fn().mockImplementation(() => {
        throw new ApiError(400, 'classId is required');
      }),
      createGroup: vi.fn().mockReturnValue({ id: 1, name: 'A' }),
      assignStudent: vi.fn().mockImplementation(() => {
        throw new Error('sqlite busy');
      }),
    } as any);
    const presets = new PresetsController({
      listPresets: vi.fn().mockReturnValue([{ id: 1 }]),
      createPreset: vi.fn().mockImplementation(() => {
        throw new Error('sqlite busy');
      }),
      deletePreset: vi.fn().mockReturnValue({ message: 'Preset deleted successfully' }),
    } as any);

    try {
      groups.listGroups(req, undefined);
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 400, 'classId is required');
    }
    expect(groups.createGroup(req, { name: 'A', class_id: 1 })).toEqual({ success: true, group: { id: 1, name: 'A' } });
    try {
      groups.assignStudent(req, { studentId: 1, groupId: 2 });
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 500, 'Server error');
    }

    expect(presets.listPresets('7')).toEqual({ success: true, presets: [{ id: 1 }] });
    try {
      presets.createPreset({ label: '加分', amount: 5 });
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 500, 'Server error');
    }
    expect(presets.deletePreset('1')).toEqual({ success: true, message: 'Preset deleted successfully' });
  });

  it('keeps attendance and leaves data/id shapes and raw error.message fallback', () => {
    const attendance = new AttendanceController({
      listAttendance: vi.fn().mockReturnValue([{ id: 1 }]),
      saveAttendance: vi.fn().mockImplementation(() => {
        throw new Error('records is not iterable');
      }),
    } as any);
    const leaves = new LeavesController({
      listLeaves: vi.fn().mockReturnValue([{ id: 2 }]),
      createLeave: vi.fn().mockReturnValue(7),
      updateLeave: vi.fn().mockImplementation(() => {
        throw new Error('database locked');
      }),
    } as any);

    expect(attendance.listAttendance({ class_id: '1' })).toEqual({ success: true, data: [{ id: 1 }] });
    try {
      attendance.saveAttendance({ class_id: 1, records: undefined });
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 500, 'records is not iterable');
    }

    expect(leaves.listLeaves({ status: 'pending' })).toEqual({ success: true, data: [{ id: 2 }] });
    expect(leaves.createLeave({ student_id: 1, parent_id: 2, start_date: '2026-01-01', end_date: '2026-01-02', reason: 'sick' })).toEqual({
      success: true,
      id: 7,
    });
    try {
      leaves.updateLeave('7', { status: 'approved' });
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 500, 'database locked');
    }
  });
});
