import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  all: vi.fn(),
  get: vi.fn(),
  prepare: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn((fn: () => unknown) => fn),
}));

const featureMocks = vi.hoisted(() => ({
  assertActorFeatureEnabled: vi.fn(),
  assertAnyClassFeatureEnabled: vi.fn(),
  assertClassFeatureEnabled: vi.fn(),
  assertStudentFeatureEnabled: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  default: {
    prepare: dbMocks.prepare,
    transaction: dbMocks.transaction,
  },
  decrypt: (value: string) => value,
}));

vi.mock('../../utils/classFeatures.js', () => ({
  assertActorFeatureEnabled: featureMocks.assertActorFeatureEnabled,
  assertAnyClassFeatureEnabled: featureMocks.assertAnyClassFeatureEnabled,
  assertClassFeatureEnabled: featureMocks.assertClassFeatureEnabled,
  assertStudentFeatureEnabled: featureMocks.assertStudentFeatureEnabled,
}));

import {
  CertificatesController,
  ClassAnnouncementsController,
  DanmakuController,
  FamilyTasksController,
  LuckyDrawController,
  MessagesController,
  PraisesController,
  RedemptionController,
} from './engagement.controllers';
import { EngagementService } from './engagement.service';

function mockPreparedStatement() {
  dbMocks.prepare.mockImplementation((sql: string) => ({
    all: (...args: unknown[]) => dbMocks.all(sql, ...args),
    get: (...args: unknown[]) => dbMocks.get(sql, ...args),
    run: (...args: unknown[]) => dbMocks.run(sql, ...args),
  }));
}

function expectHttpError(error: unknown, status: number, message: string) {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  expect((error as HttpException).getResponse()).toEqual({ success: false, message });
}

describe('EngagementService and controllers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.values(dbMocks).forEach((mock) => mock.mockClear());
    Object.values(featureMocks).forEach((mock) => mock.mockClear());
    dbMocks.transaction.mockImplementation((fn: () => unknown) => fn);
    mockPreparedStatement();
  });

  it('joins users for home-school teacher and parent senders', () => {
    dbMocks.all.mockReturnValue([]);
    const service = new EngagementService();

    service.getMessages({ classId: '3', type: 'HOME_SCHOOL', role: 'teacher' });

    expect(dbMocks.prepare).toHaveBeenCalledWith(expect.stringContaining("m.sender_role IN ('user', 'teacher', 'parent')"));
  });

  it('hides anonymous student message senders and removes internal columns', () => {
    dbMocks.all.mockReturnValue([
      {
        id: 1,
        type: 'TREE_HOLE',
        sender_name: '小明',
        receiver_name: '小红',
        is_anonymous: 1,
        sender_role: 'student',
        enable_achievements: 1,
        top_achievement: '阅读之星',
      },
    ]);
    const service = new EngagementService();

    const messages = service.getMessages({ type: 'TREE_HOLE', role: 'student' });

    expect(messages).toEqual([
      {
        id: 1,
        type: 'TREE_HOLE',
        sender_name: '匿名同学',
        receiver_name: '小红',
        is_anonymous: 1,
        sender_role: 'student',
      },
    ]);
  });

  it('rejects invalid message types before writing', () => {
    const controller = new MessagesController({} as any);

    try {
      controller.createMessage({ class_id: 1, sender_id: 2, content: 'hi', type: 'BAD' });
      throw new Error('Expected createMessage to throw');
    } catch (error) {
      expectHttpError(error, 400, 'Invalid message type');
    }
  });

  it('updates pet progression when a praise is created', () => {
    dbMocks.run.mockReturnValue({ lastInsertRowid: 10 });
    dbMocks.get.mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM praises')) {
        return { id: 10, content: 'great' };
      }
      if (sql.includes('SELECT * FROM pets')) {
        return { id: 8, experience: 90, level: 1 };
      }
      return undefined;
    });
    const service = new EngagementService();

    expect(service.createPraise({ teacher_id: 1, student_id: 2, content: 'great' })).toEqual({ id: 10, content: 'great' });
    expect(dbMocks.prepare).toHaveBeenCalledWith('UPDATE pets SET experience = ?, level = ?, attack_power = ?, mood = ? WHERE id = ?');
    expect(dbMocks.run).toHaveBeenCalledWith(
      'UPDATE pets SET experience = ?, level = ?, attack_power = ?, mood = ? WHERE id = ?',
      110,
      2,
      11,
      'excited',
      8,
    );
  });

  it('keeps praise validation and delete responses', () => {
    const controller = new PraisesController({
      deletePraise: vi.fn(),
    } as any);

    try {
      controller.createPraise({ teacher_id: 1, student_id: 2 });
      throw new Error('Expected createPraise to throw');
    } catch (error) {
      expectHttpError(error, 400, 'teacher_id, student_id, and content are required');
    }

    expect(controller.deletePraise('5')).toEqual({ success: true, message: 'Praise deleted successfully' });
  });

  it('keeps certificates, redemption, announcements, and class-announcement compatibility errors', () => {
    const certificates = new CertificatesController({} as any);
    const redemption = new RedemptionController({} as any);
    const classAnnouncements = new ClassAnnouncementsController({} as any);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    try {
      certificates.createCertificate({ student_id: 1 });
      throw new Error('Expected createCertificate to throw');
    } catch (error) {
      expectHttpError(error, 400, 'student_id and title are required');
    }

    redemption.verify({}, response as any);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ success: false, message: '核销码不能为空' });

    try {
      classAnnouncements.getClassAnnouncements(undefined);
      throw new Error('Expected getClassAnnouncements to throw');
    } catch (error) {
      expectHttpError(error, 400, 'classId is required');
    }
  });

  it('keeps family task query and not-found behavior', () => {
    const controller = new FamilyTasksController({
      getFamilyTasks: vi.fn().mockReturnValue(undefined),
      updateFamilyTask: vi.fn().mockReturnValue(false),
    } as any);

    try {
      controller.getTasks({});
      throw new Error('Expected getTasks to throw');
    } catch (error) {
      expectHttpError(error, 400, 'Missing studentId or parentId');
    }

    try {
      controller.updateTask('9', { status: 'approved' });
      throw new Error('Expected updateTask to throw');
    } catch (error) {
      expectHttpError(error, 404, 'Task not found');
    }
  });

  it('covers lucky draw config validation and outcome statuses', () => {
    const controller = new LuckyDrawController({
      drawLuckyPrize: vi.fn().mockReturnValue({ status: 409, body: { success: false, message: '积分不足' } }),
    } as any);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    try {
      controller.saveConfig({ configs: [] });
      throw new Error('Expected saveConfig to throw');
    } catch (error) {
      expectHttpError(error, 400, 'configs 必须是长度为 9 的数组');
    }

    controller.draw({ studentId: 7 }, response as any);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({ success: false, message: '积分不足' });
  });

  it('handles lucky draw POINTS, ITEM, and no-prize outcomes', () => {
    const service = new EngagementService();
    const configs = [
      { id: 1, cost_points: 10, prize_type: 'POINTS', prize_value: 5, prize_name: 'points', probability: 1 },
      { id: 2, cost_points: 10, prize_type: 'ITEM', prize_value: 3, prize_name: 'item', probability: 1 },
      { id: 3, cost_points: 10, prize_type: 'NOTHING', prize_value: 0, prize_name: 'empty', probability: 1 },
    ];
    const randomSpy = vi.spyOn(Math, 'random');

    dbMocks.get.mockReturnValue({ id: 7, teacher_id: 1, available_points: 100 });
    dbMocks.all.mockReturnValue(configs);
    dbMocks.run.mockReturnValue({ lastInsertRowid: 1 });

    randomSpy.mockReturnValueOnce(0).mockReturnValueOnce(0.5).mockReturnValueOnce(0).mockReturnValueOnce(0.9);
    expect(service.drawLuckyPrize(7).body.message).toBe('恭喜获得 5 积分！');
    expect(service.drawLuckyPrize(7).body.message).toBe('恭喜获得商品兑换券: item！请在“我的兑换”中查看。');
    expect(service.drawLuckyPrize(7).body.message).toBe('很遗憾，本次未中奖。');
  });

  it('returns lucky draw not-found statuses', () => {
    const service = new EngagementService();

    dbMocks.get.mockReturnValue(undefined);
    expect(service.drawLuckyPrize(7)).toEqual({ status: 404, body: { success: false, message: 'Student not found' } });

    dbMocks.get.mockReturnValue({ id: 7, teacher_id: 1, available_points: 100 });
    dbMocks.all.mockReturnValue([]);
    expect(service.drawLuckyPrize(7)).toEqual({ status: 404, body: { success: false, message: 'No active lucky draw config' } });
  });

  it('keeps danmaku since/default ordering and cleanup behavior', () => {
    const service = new EngagementService();
    const controller = new DanmakuController({
      getDanmakuMessages: vi.fn().mockReturnValue([]),
      cleanupDanmakuMessages: vi.fn(),
    } as any);

    dbMocks.all.mockReturnValue([{ id: 2 }, { id: 1 }]);
    expect(service.getDanmakuMessages('3', undefined)).toEqual([{ id: 1 }, { id: 2 }]);

    dbMocks.all.mockReturnValue([{ id: 3 }]);
    expect(service.getDanmakuMessages('3', '2')).toEqual([{ id: 3 }]);
    expect(controller.cleanup()).toEqual({ success: true });
  });
});
