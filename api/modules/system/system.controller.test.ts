import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SystemController } from './system.controller';

describe('SystemController', () => {
  it('returns the legacy question response shape', () => {
    const service = {
      getQuestions: vi.fn().mockReturnValue([{ id: 1, title: 'Question' }]),
    };
    const controller = new SystemController(service as any);

    expect(controller.getQuestions('5')).toEqual({
      success: true,
      questions: [{ id: 1, title: 'Question' }],
    });
    expect(service.getQuestions).toHaveBeenCalledWith('5');
  });

  it('keeps the legacy error response body for failures', () => {
    const controller = new SystemController({
      getSettings: vi.fn(() => {
        throw new Error('db failed');
      }),
    } as any);

    try {
      controller.getSettings();
      throw new Error('Expected getSettings to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(500);
      expect((error as HttpException).getResponse()).toEqual({
        success: false,
        message: 'Server error',
      });
    }
  });

  it('exports backup JSON with the existing download headers', () => {
    const service = {
      exportBackup: vi.fn().mockReturnValue('{"users":[]}'),
    };
    const response = {
      setHeader: vi.fn(),
      send: vi.fn(),
    };
    const controller = new SystemController(service as any);

    controller.exportBackup(response as any);

    expect(response.setHeader).toHaveBeenCalledWith('Content-disposition', 'attachment; filename=backup.json');
    expect(response.setHeader).toHaveBeenCalledWith('Content-type', 'application/json');
    expect(response.send).toHaveBeenCalledWith('{"users":[]}');
  });
});
