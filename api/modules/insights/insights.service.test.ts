import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';

const dbMocks = vi.hoisted(() => ({
  all: vi.fn(),
  get: vi.fn(),
  prepare: vi.fn(),
  run: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  default: {
    prepare: dbMocks.prepare,
  },
  decrypt: (value: string) => value.replace(/^enc:/, ''),
}));

import { InsightsService } from './insights.service';

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

describe('InsightsService', () => {
  let service: InsightsService;

  beforeEach(() => {
    Object.values(dbMocks).forEach((mock) => mock.mockReset());
    mockPreparedStatement();
    service = new InsightsService();
  });

  it('keeps class overview teacher guard, aggregate shape, and decrypted top students', () => {
    dbMocks.get
      .mockReturnValueOnce({ id: 2, teacher_id: 7 })
      .mockReturnValueOnce({ id: 2, name: '一班', teacher_id: 7 })
      .mockReturnValueOnce({ total_students: 2, average_points: 75.4, max_points: 100, min_points: 50 })
      .mockReturnValueOnce({ average_exam_score: 88.6 })
      .mockReturnValueOnce({ total_assignment_records: 4, submitted_assignment_records: 3 })
      .mockReturnValueOnce({ total_attendance_records: 5, present_records: 4 })
      .mockReturnValueOnce({ praise_count: 6 })
      .mockReturnValueOnce({ leave_count: 1 });
    dbMocks.all
      .mockReturnValueOnce([{ label: '80-99', value: 1 }])
      .mockReturnValueOnce([{ id: 1, title: '期中' }])
      .mockReturnValueOnce([{ id: 2, title: '作业', total_students: 4, submitted_students: 3 }])
      .mockReturnValueOnce([{ id: 3, name: 'enc:Ada', total_points: 100 }]);

    expect(service.getClassOverview(mockReq('teacher', 7), '2')).toEqual({
      class: { id: 2, name: '一班', teacher_id: 7 },
      summary: {
        total_students: 2,
        average_points: 75,
        max_points: 100,
        min_points: 50,
        average_exam_score: 89,
        assignment_completion_rate: 75,
        attendance_rate: 80,
        praise_count: 6,
        leave_count: 1,
      },
      distributions: [{ label: '80-99', value: 1 }],
      exam_trend: [{ id: 1, title: '期中' }],
      assignment_trend: [{ id: 2, title: '作业', total_students: 4, submitted_students: 3, completion_rate: 75 }],
      top_students: [{ id: 3, name: 'Ada', total_points: 100 }],
    });
  });

  it('rejects invalid ids and unauthorized student reports with legacy ApiError messages', () => {
    expectApiError(() => service.getClassOverview(mockReq('admin', 1), 'abc'), 400, 'Invalid classId');

    dbMocks.get.mockReturnValueOnce(undefined);
    expectApiError(() => service.getStudentReport(mockReq('parent', 9), '5'), 403, '无权限访问该报告');
  });

  it('keeps student radar metrics, strengths, weaknesses, and advice shape', () => {
    dbMocks.get
      .mockReturnValueOnce({ id: 5 })
      .mockReturnValueOnce({ id: 5, name: 'enc:Ada', total_points: 80 })
      .mockReturnValueOnce({ total_assignments: 10, submitted_assignments: 6 })
      .mockReturnValueOnce({ average_exam_score: 91.2 })
      .mockReturnValueOnce({ total_records: 4, present_count: 4 })
      .mockReturnValueOnce({ count: 2 });

    const result = service.getStudentRadar(mockReq('parent', 9), '5');

    expect(result.report.studentName).toBe('Ada');
    expect(result.report.metrics).toMatchObject({ 积分表现: 80, 作业完成: 60, 考试成绩: 91, 出勤表现: 100, 教师表扬: 40 });
    expect(result.report.strengths).toEqual(['积分表现', '考试成绩', '出勤表现']);
    expect(result.report.weaknesses).toEqual(['教师表扬']);
    expect(result.report.advice).toHaveLength(3);
  });
});
