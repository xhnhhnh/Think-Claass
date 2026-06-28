import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SettingsController } from './settings.controller';

describe('SettingsController', () => {
  it('returns the public settings response shape', () => {
    const service = {
      getPublicSettings: vi.fn().mockReturnValue({
        site_title: 'Think-Class',
      }),
    };
    const controller = new SettingsController(service as any);

    expect(controller.getPublicSettings()).toEqual({
      success: true,
      data: {
        site_title: 'Think-Class',
      },
    });
  });

  it('keeps the legacy failure response body', () => {
    const controller = new SettingsController({
      getPublicSettings: vi.fn(() => {
        throw new Error('db failed');
      }),
    } as any);

    try {
      controller.getPublicSettings();
      throw new Error('Expected getPublicSettings to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(500);
      expect((error as HttpException).getResponse()).toEqual({
        success: false,
        message: '获取设置失败',
      });
    }
  });
});
