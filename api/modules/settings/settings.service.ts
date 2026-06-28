import { Injectable } from '@nestjs/common';
import db from '../../db.js';

@Injectable()
export class SettingsService {
  getPublicSettings() {
    const settings = db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;

    return settings.reduce<Record<string, string>>((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
  }
}
