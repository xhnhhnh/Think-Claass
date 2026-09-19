/**
 * System service.
 *
 * Behavior is relocated from `api/modules/system/system.service.ts` unchanged: the same
 * statements, the same order, and the same "update if it exists, otherwise insert"
 * branch in `upsertSetting`.
 *
 * It no longer imports Nest: the plugin index constructs it with its repository. The
 * legacy class was `@Injectable()` because Nest assembled it; a plugin assembles its own
 * dependencies in `setup()`.
 */

import { BACKUP_TABLES } from './system.repository.js';
import type { QuestionInput, SystemRepository } from './system.types.js';

export class SystemService {
  constructor(private readonly repository: SystemRepository) {}

  getQuestions(teacherId: string | undefined) {
    return this.repository.listQuestions(teacherId);
  }

  createQuestion(input: QuestionInput) {
    return this.repository.createQuestion(input);
  }

  updateQuestion(id: string, input: QuestionInput) {
    this.repository.updateQuestion(id, input);
  }

  deleteQuestion(id: string) {
    this.repository.deleteQuestion(id);
  }

  getSettings() {
    return this.repository.listSettings();
  }

  upsertSetting(input: { key?: string; value?: string; description?: string }) {
    if (this.repository.findSetting(input.key)) {
      this.repository.updateSetting(input.key, input.value, input.description);
      return;
    }

    this.repository.insertSetting(input.key, input.value, input.description);
  }

  getLogs() {
    return this.repository.listLogs();
  }

  exportBackup() {
    const data: Record<string, unknown[]> = {};

    for (const table of BACKUP_TABLES) {
      data[table] = this.repository.dumpTable(table);
    }

    return JSON.stringify(data, null, 2);
  }
}
