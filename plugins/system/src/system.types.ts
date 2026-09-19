/** Types for the system plugin, relocated from `api/modules/system/`. */

export interface QuestionInput {
  title?: string;
  type?: string;
  options?: string;
  answer?: string;
  explanation?: string;
  teacher_id?: string | number;
}

export interface SettingRow {
  id: number;
  key: string;
  value: string | null;
  description: string | null;
}

export interface SystemRepository {
  listQuestions(teacherId: string | undefined): unknown[];
  createQuestion(input: QuestionInput): unknown;
  updateQuestion(id: string, input: QuestionInput): void;
  deleteQuestion(id: string): void;

  listSettings(): SettingRow[];
  findSetting(key: string | undefined): boolean;
  updateSetting(key: string | undefined, value: string | undefined, description: string | undefined): void;
  insertSetting(key: string | undefined, value: string | undefined, description: string | undefined): void;

  listLogs(): unknown[];
  dumpTable(table: string): unknown[];
}
