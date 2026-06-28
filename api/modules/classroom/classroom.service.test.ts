import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';

const { dbMocks, featureMocks } = vi.hoisted(() => ({
  dbMocks: {
    all: vi.fn(),
    get: vi.fn(),
    prepare: vi.fn(),
    run: vi.fn(),
    transaction: vi.fn((fn: (...args: any[]) => unknown) => (...args: any[]) => fn(...args)),
  },
  featureMocks: {
    assertClassFeatureEnabled: vi.fn(),
    assertStudentFeatureEnabled: vi.fn(),
    getClassFeaturesByClassId: vi.fn(),
  },
}));

vi.mock('../../db.js', () => ({
  default: {
    prepare: dbMocks.prepare,
    transaction: dbMocks.transaction,
  },
  decrypt: (value: string) => value.replace(/^enc:/, ''),
  encrypt: (value: string) => `enc:${value}`,
}));

vi.mock('../../services/featureService.js', () => ({
  assertClassFeatureEnabled: featureMocks.assertClassFeatureEnabled,
  assertStudentFeatureEnabled: featureMocks.assertStudentFeatureEnabled,
  getClassFeaturesByClassId: featureMocks.getClassFeaturesByClassId,
}));

import { ClassroomService } from './classroom.service';

function mockPreparedStatement() {
  dbMocks.prepare.mockImplementation((sql: string) => ({
    all: (...args: unknown[]) => dbMocks.all(sql, ...args),
    get: (...args: unknown[]) => dbMocks.get(sql, ...args),
    run: (...args: unknown[]) => dbMocks.run(sql, ...args),
  }));
}

function mockReq(role: string, id: number | null = 1): Request {
  return {
    header(name: string) {
      if (name === 'x-user-role') return role;
      if (name === 'x-user-id') return id === null ? undefined : String(id);
      return undefined;
    },
  } as Request;
}

function expectApiError(fn: () => unknown, statusCode: number, message: string) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(statusCode);
    expect((error as ApiError).message).toBe(message);
  }
}

describe('ClassroomService', () => {
  let service: ClassroomService;

  beforeEach(() => {
    Object.values(dbMocks).forEach((mock) => mock.mockReset());
    Object.values(featureMocks).forEach((mock) => mock.mockReset());
    dbMocks.transaction.mockImplementation((fn: (...args: any[]) => unknown) => (...args: any[]) => fn(...args));
    mockPreparedStatement();
    service = new ClassroomService();
  });

  it('lists decrypted students and returns Student not found for missing numeric detail', () => {
    dbMocks.all.mockReturnValue([{ id: 1, name: 'enc:Ada', username: 'ada', group_name: 'A' }]);
    expect(service.listStudents('2')).toEqual([{ id: 1, name: 'Ada', username: 'ada', group_name: 'A' }]);
    expect(dbMocks.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE s.class_id = ?'));

    dbMocks.get.mockReturnValue(undefined);
    expectApiError(() => service.getStudent('99'), 404, 'Student not found');
  });

  it('keeps student check-in, gift, create, batch, permission, records, achievement, and peer-review behavior', () => {
    const today = new Date().toISOString().split('T')[0];
    dbMocks.get.mockReturnValueOnce({ id: 1, class_id: 2, total_points: 10, available_points: 3, last_checkin_date: today });
    expectApiError(() => service.checkin({ studentId: 1 }), 400, 'Already checked in today');

    dbMocks.get
      .mockReturnValueOnce({ id: 1, class_id: 2, total_points: 10, available_points: 1 })
      .mockReturnValueOnce({ id: 2, class_id: 2, total_points: 0, available_points: 0 });
    expectApiError(() => service.gift({ senderId: 1, receiverId: 2, points: 5, message: 'hi' }), 400, 'Insufficient points');

    dbMocks.run.mockImplementationOnce(() => {
      throw new Error('UNIQUE constraint failed: users.username');
    });
    expectApiError(() => service.createStudent({ username: 'ada', name: 'Ada', class_id: 1 }), 409, '用户名已存在，请换一个用户名');

    dbMocks.get
      .mockReturnValueOnce({ id: 1, class_id: 2, total_points: 0, available_points: 0 })
      .mockReturnValueOnce({ id: 2, class_id: 2, total_points: 0, available_points: 0 });
    expect(service.batchPoints({ studentIds: [1, 2], amount: 3, reason: 'bonus' })).toEqual({ message: 'Points updated successfully' });

    dbMocks.get.mockReturnValueOnce(undefined);
    expectApiError(() => service.updateStudentClass(mockReq('teacher', 9), '1', { class_id: 2 }), 403, '无权限修改该学生');

    dbMocks.all.mockReturnValue([{ id: 7, student_name: 'enc:Ada' }]);
    expect(service.getRecords({ studentId: '1' })).toEqual([{ id: 7, student_name: 'Ada' }]);

    dbMocks.get
      .mockReturnValueOnce({ id: 1, class_id: 2 })
      .mockReturnValueOnce({ level: 2 })
      .mockReturnValueOnce({ count: 0 });
    dbMocks.all
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);
    expect(service.getAchievements('1')).toEqual({ achievements: ['初出茅庐'], newAchievements: ['初出茅庐'] });

    featureMocks.assertStudentFeatureEnabled.mockReturnValue({});
    dbMocks.get.mockReturnValueOnce({ id: 1, class_id: 2, group_id: null });
    dbMocks.all.mockReturnValueOnce([{ id: 2, name: 'enc:Ben' }]).mockReturnValueOnce([]);
    expect(service.getPendingPeerReviews('1')).toEqual([{ id: 2, name: 'Ben' }]);
  });

  it('keeps classes list, invite branches, default teacher creation, settings, bigscreen, and guild ranking', () => {
    dbMocks.all.mockReturnValueOnce([{ id: 1, name: '一班' }]);
    expect(service.listClasses(mockReq('teacher', 8), '99')).toEqual([{ id: 1, name: '一班' }]);
    expect(dbMocks.all).toHaveBeenCalledWith(expect.stringContaining('WHERE teacher_id = ?'), 8);

    dbMocks.get.mockReturnValueOnce({ id: 2, name: '二班' });
    dbMocks.all.mockReturnValueOnce([{ id: 3, name: 'enc:学生' }]);
    expect(service.getInvite('ABC123', 'parent')).toEqual({
      class: { id: 2, name: '二班' },
      students: [{ id: 3, name: '学生' }],
    });

    dbMocks.run.mockReturnValueOnce({ lastInsertRowid: 10 });
    const created = service.createClass(mockReq('teacher', 9), { name: '三班', teacher_id: 99 });
    expect(created).toMatchObject({ id: 10, name: '三班', teacher_id: 9 });
    expect(typeof created.invite_code).toBe('string');

    dbMocks.get.mockReturnValueOnce({ id: 1, enable_peer_review: 1, pet_selection_mode: 'manual' });
    expect(service.getClassFeatures('1')).toMatchObject({
      classId: 1,
      features: { enable_peer_review: true },
      pet_selection_mode: 'manual',
    });

    dbMocks.get
      .mockReturnValueOnce({ id: 1 })
      .mockReturnValueOnce({ id: 1, enable_peer_review: 1, pet_selection_mode: 'random' });
    expect(service.updateClassSettings('1', { enable_peer_review: true })).toMatchObject({
      message: 'Settings updated successfully',
      features: { enable_peer_review: true },
      pet_selection_mode: 'random',
    });

    dbMocks.get.mockReturnValueOnce({ id: 1, name: '一班', invite_code: 'ABC123' }).mockReturnValueOnce({ id: 99 });
    dbMocks.all
      .mockReturnValueOnce([{ id: 1, name: 'enc:Ada' }])
      .mockReturnValueOnce([{ id: 2, student_name: 'enc:Ada' }])
      .mockReturnValueOnce([{ id: 3, student_name: 'enc:Ada' }]);
    expect(service.getBigscreen('1')).toEqual({
      class: { id: 1, name: '一班', invite_code: 'ABC123' },
      topStudents: [{ id: 1, name: 'Ada' }],
      latestPraises: [{ id: 2, student_name: 'Ada' }],
      latestRecords: [{ id: 3, student_name: 'Ada' }],
      activeBoss: { id: 99 },
    });

    dbMocks.get.mockReturnValueOnce({ id: 1, enable_guild_pk: 0 });
    expect(service.getGuildRanking('1')).toEqual({ rankings: [], isEnabled: false });
    dbMocks.get.mockReturnValueOnce({ id: 1, enable_guild_pk: 1 });
    dbMocks.all.mockReturnValueOnce([{ id: 4, total_score: 100 }]);
    expect(service.getGuildRanking('1')).toEqual({ rankings: [{ id: 4, total_score: 100 }], isEnabled: true });
  });

  it('keeps groups, presets, attendance, and leaves legacy data access', () => {
    dbMocks.get.mockReturnValueOnce({ id: 2 });
    dbMocks.all.mockReturnValueOnce([{ id: 1, class_id: 2 }]);
    expect(service.listGroups(mockReq('teacher', 9), '2')).toEqual([{ id: 1, class_id: 2 }]);
    expectApiError(() => service.listGroups(mockReq('teacher', 9), undefined), 400, 'classId is required');

    dbMocks.get.mockReturnValueOnce({ id: 2 });
    dbMocks.run.mockReturnValueOnce({ lastInsertRowid: 3 });
    dbMocks.get.mockReturnValueOnce({ id: 3, name: 'A' });
    expect(service.createGroup(mockReq('teacher', 9), { name: 'A', class_id: 2 })).toEqual({ id: 3, name: 'A' });
    dbMocks.get.mockReturnValueOnce({ id: 1 });
    expect(service.assignStudent(mockReq('teacher', 9), { studentId: 1, groupId: null })).toEqual({ message: 'Student assigned to group successfully' });

    dbMocks.all.mockReturnValueOnce([{ id: 4, label: '加分' }]);
    expect(service.listPresets('9')).toEqual([{ id: 4, label: '加分' }]);
    dbMocks.get.mockReturnValueOnce({ id: 9 });
    dbMocks.run.mockReturnValueOnce({ lastInsertRowid: 5 });
    dbMocks.get.mockReturnValueOnce({ id: 5, label: '加分' });
    expect(service.createPreset({ label: '加分', amount: 5 })).toEqual({ id: 5, label: '加分' });
    expect(service.deletePreset('5')).toEqual({ message: 'Preset deleted successfully' });

    dbMocks.all.mockReturnValueOnce([{ id: 6, status: 'present' }]);
    expect(service.listAttendance({ class_id: '2', date: '2026-05-24' })).toEqual([{ id: 6, status: 'present' }]);
    expect(service.saveAttendance({ class_id: 2, records: [{ student_id: 1, date: '2026-05-24', status: 'present' }] })).toBeUndefined();

    dbMocks.all.mockReturnValueOnce([{ id: 7, status: 'pending' }]);
    expect(service.listLeaves({ status: 'pending' })).toEqual([{ id: 7, status: 'pending' }]);
    dbMocks.run.mockReturnValueOnce({ lastInsertRowid: 8 });
    expect(service.createLeave({ student_id: 1, parent_id: 2, start_date: '2026-05-24', end_date: '2026-05-25', reason: 'sick' })).toBe(8);
    expect(service.updateLeave('8', { status: 'approved', reviewer_id: 9 })).toBeUndefined();
  });

  it('isolates teacher class and group operations from other teachers', () => {
    dbMocks.get.mockReturnValueOnce(undefined);
    expectApiError(() => service.listGroups(mockReq('teacher', 9), '2'), 403, '无权限管理该班级');

    dbMocks.get.mockReturnValueOnce({ id: 1 }).mockReturnValueOnce(undefined);
    expectApiError(
      () => service.updateStudentGroup(mockReq('teacher', 9), '1', { group_id: 7 }),
      400,
      '小组不属于该学生所在班级',
    );
  });
});
