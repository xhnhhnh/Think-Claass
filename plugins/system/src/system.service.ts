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

import { ApiError } from '@thinkclass/kernel';

import { BACKUP_TABLES } from './system.repository.js';
import type { QuestionInput, SystemRepository } from './system.types.js';

export class SystemService {
  constructor(private readonly repository: SystemRepository) {}

  getQuestions(teacherId: string | undefined) {
    return this.repository.listQuestions(teacherId);
  }

  /**
   * Create a question.
   *
   * The guard is new, and it is the difference between a 400 and a 500: `question_bank.title` and
   * `.answer` are NOT NULL, so an empty body used to reach the insert and answer
   * `500 服务器内部错误` - which tells the caller nothing about what they got wrong. Found by the e2e
   * sweep, which probes every endpoint with a deliberately empty body and fails on any 5xx.
   */
  createQuestion(input: QuestionInput) {
    if (!input?.title || !input?.answer) throw new ApiError(400, 'title and answer are required');
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

  /**
   * Insert or update one platform setting.
   *
   * The guard is new for the same reason as `createQuestion`'s: `settings.key` and `.value` are
   * NOT NULL, so an empty body answered `500 服务器内部错误` instead of naming the missing field.
   */
  upsertSetting(input: { key?: string; value?: string; description?: string }) {
    if (!input?.key) throw new ApiError(400, 'key is required');
    if (input.value === undefined || input.value === null) throw new ApiError(400, 'value is required');

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
