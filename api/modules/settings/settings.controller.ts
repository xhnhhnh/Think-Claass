import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { SettingsService } from './settings.service.js';

@Controller('api/settings')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Get()
  getPublicSettings() {
    try {
      return {
        success: true,
        data: this.settingsService.getPublicSettings(),
      };
    } catch (error) {
      console.error('获取设置失败:', error);
      throw new HttpException(
        { success: false, message: '获取设置失败' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
