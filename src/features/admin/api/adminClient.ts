import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import type {
  ActivationCodeListItem,
  AdminAnnouncementListItem,
  AdminSession,
  AiConnectionTestResult,
  AuditLogListResponse,
  AuditLogQuery,
  DatabaseImportResult,
  DatabaseResetResult,
  GenerateActivationCodesResult,
  OpenApiKeyListItem,
  OpenSchoolListItem,
  ReleaseUpdateStatus,
  SystemSettings,
  SystemStatsResponse,
  TeacherListItem,
  UpsertAdminAnnouncementInput,
  UpsertOpenSchoolInput,
  UpsertTeacherInput,
} from '@thinkclass/contracts/domains/admin';

export interface AdminCredentials {
  username: string;
  password: string;
}

/**
 * One `question_bank` row, as `plugins/system` stores and `plugins/challenge` reads it.
 *
 * `options` and `answer` are TEXT columns holding JSON: the challenge mappers run `parseMaybeJson`
 * over both, so an option list is `["A. 4","B. 7"]` and a multi-choice answer is `["A. 4","C. 8"]`.
 * The single-choice and judge answers are plain strings, which is what the student page sends
 * (`handleAnswer(question.id, opt)` / `'正确' | '错误'`).
 */
export interface QuestionBankItem {
  id: number;
  title: string;
  type: string;
  options: string | null;
  answer: string;
  explanation: string | null;
  teacher_id: number | null;
  created_at: string | null;
}

export interface UpsertQuestionBankInput {
  title: string;
  type: string;
  options: string | null;
  answer: string;
  explanation: string | null;
  teacher_id?: number | string | null;
}

function unwrapData<T>(response: { data?: T } | T): T {
  if (response && typeof response === 'object' && 'data' in (response as Record<string, unknown>)) {
    return (response as { data: T }).data;
  }
  return response as T;
}

export const adminClient = {
  createSession: async (credentials: AdminCredentials): Promise<AdminSession> => {
    const response = await apiPost<{ success: true; data: AdminSession }>('/api/admin/session', credentials);
    return unwrapData(response);
  },

  getSystemStats: async (): Promise<SystemStatsResponse> => {
    const response = await apiGet<{ success: true; data: SystemStatsResponse }>('/api/admin/system/stats');
    return unwrapData(response);
  },

  getSystemSettings: async (): Promise<SystemSettings> => {
    const response = await apiGet<{ success: true; data: SystemSettings }>('/api/admin/system/settings');
    return unwrapData(response);
  },

  updateSystemSettings: async (input: Partial<SystemSettings>): Promise<SystemSettings> => {
    const response = await apiPut<{ success: true; data: SystemSettings }>('/api/admin/system/settings', input);
    return unwrapData(response);
  },

  importDatabase: async (formData: FormData): Promise<DatabaseImportResult> => {
    const response = await apiPost<{ success: true; data: DatabaseImportResult }>(
      '/api/admin/system/database/import',
      formData,
    );
    return unwrapData(response);
  },

  resetDatabase: async (): Promise<DatabaseResetResult> => {
    const response = await apiPost<{ success: true; data: DatabaseResetResult }>('/api/admin/system/database/reset');
    return unwrapData(response);
  },

  /**
   * `POST /api/admin/system/ai/test` - one outbound call to the configured model.
   *
   * The provider belongs to the optional `homework` plugin; this client knows only that the route
   * answers with a state and a sentence. `ok: false` is a normal 200: an unreachable model is a
   * result the operator reads, not a failed request.
   */
  testAiConnection: async (): Promise<AiConnectionTestResult> => {
    const response = await apiPost<{ success: true; data: AiConnectionTestResult }>('/api/admin/system/ai/test');
    return unwrapData(response);
  },

  /**
   * `GET /api/admin/system/database/export` - the whole SQLite file, as a download.
   *
   * This used to be a URL the page assigned to `window.location.href`, which cannot carry the
   * `Authorization: Bearer` header the kernel resolves actors from (`api/app.ts` ->
   * `createRequestContextMiddleware` reads the header and nothing else) - so the download answered
   * 401 in every deployment, and the button looked like it did nothing. Going through the axios
   * instance keeps the session, and the blob is handed to the browser as a file.
   */
  downloadDatabase: async (): Promise<Blob> => {
    const blob = await apiGet<Blob>('/api/admin/system/database/export', {
      responseType: 'blob',
      showError: false,
    });
    return blob as unknown as Blob;
  },

  getDatabaseExportUrl: (): string => '/api/admin/system/database/export',

  getReleaseUpdateStatus: async (): Promise<ReleaseUpdateStatus> => {
    const response = await apiGet<{ success: true; data: ReleaseUpdateStatus }>('/api/admin/system/update/status');
    return unwrapData(response);
  },

  checkLatestRelease: async (): Promise<ReleaseUpdateStatus> => {
    const response = await apiGet<{ success: true; data: ReleaseUpdateStatus }>('/api/admin/system/update/check');
    return unwrapData(response);
  },

  startReleaseUpdate: async (): Promise<ReleaseUpdateStatus> => {
    const response = await apiPost<{ success: true; data: ReleaseUpdateStatus }>('/api/admin/system/update');
    return unwrapData(response);
  },

  getTeachers: async () => {
    const response = await apiGet<{ success: true; data?: { items: TeacherListItem[]; total: number }; users?: TeacherListItem[] }>('/api/admin/users');
    return response.data?.items ?? response.users ?? [];
  },
  createTeacher: (input: UpsertTeacherInput) => apiPost<{ success: true; data?: TeacherListItem; message?: string }>('/api/admin/users', input),
  updateTeacher: (id: number, input: UpsertTeacherInput) =>
    apiPut<{ success: true; data?: TeacherListItem; message?: string }>(`/api/admin/users/${id}`, input),
  deleteTeacher: (id: number) => apiDelete<{ success: true; message?: string }>(`/api/admin/users/${id}`),

  getActivationCodes: async () => {
    const response = await apiGet<{ success: true; data?: { items: ActivationCodeListItem[] }; codes?: ActivationCodeListItem[] }>('/api/admin/codes');
    return response.data?.items ?? response.codes ?? [];
  },
  generateActivationCodes: (count: number) =>
    apiPost<{ success: true; data?: GenerateActivationCodesResult; message?: string }>('/api/admin/codes', { count }),

  getAnnouncements: async () => {
    const response = await apiGet<{ success: true; data?: { items: AdminAnnouncementListItem[] }; announcements?: AdminAnnouncementListItem[] }>(
      '/api/admin/announcements',
    );
    return response.data?.items ?? response.announcements ?? [];
  },
  createAnnouncement: (input: UpsertAdminAnnouncementInput) =>
    apiPost<{ success: true; data?: AdminAnnouncementListItem; message?: string }>('/api/admin/announcements', input),
  updateAnnouncement: (id: number, input: UpsertAdminAnnouncementInput) =>
    apiPut<{ success: true; data?: AdminAnnouncementListItem; message?: string }>(`/api/admin/announcements/${id}`, input),
  deleteAnnouncement: (id: number) => apiDelete<{ success: true; message?: string }>(`/api/admin/announcements/${id}`),

  getAuditLogs: (query: AuditLogQuery) => {
    const params = new URLSearchParams();
    if (query.teacherId) params.set('teacher_id', String(query.teacherId));
    if (query.userId) params.set('user_id', String(query.userId));
    if (query.action) params.set('action', query.action);
    if (query.limit) params.set('limit', String(query.limit));
    if (query.offset) params.set('offset', String(query.offset));
    return apiGet<{ success: true; data: AuditLogListResponse['items']; total: number }>(`/api/audit-logs?${params.toString()}`);
  },

  getOpenApiKeys: async (): Promise<OpenApiKeyListItem[]> => {
    const response = await apiGet<{ success: true; keys: Array<Record<string, unknown>> }>('/api/openapi/keys');
    return response.keys.map((key) => ({
      id: Number(key.id),
      name: String(key.name ?? ''),
      apiKey: String(key.apiKey ?? key.api_key ?? key.key ?? ''),
      createdAt: typeof key.created_at === 'string' ? key.created_at : typeof key.createdAt === 'string' ? key.createdAt : null,
      lastUsedAt: typeof key.last_used_at === 'string' ? key.last_used_at : typeof key.lastUsedAt === 'string' ? key.lastUsedAt : null,
      isActive: key.is_active === 1 || key.isActive === true,
    }));
  },
  createOpenApiKey: (name: string) => apiPost<{ success: true; key: OpenApiKeyListItem }>('/api/openapi/keys', { name }),
  deleteOpenApiKey: (id: number) => apiDelete<{ success: true }>(`/api/openapi/keys/${id}`),
  getSchools: async (): Promise<OpenSchoolListItem[]> => {
    const response = await apiGet<{ success: true; schools: Array<Record<string, unknown>> }>('/api/openapi/schools');
    return response.schools.map((school) => ({
      id: Number(school.id),
      name: String(school.name ?? ''),
      description: String(school.description ?? ''),
      contactInfo: String(school.contactInfo ?? school.contact_info ?? ''),
      createdAt: typeof school.created_at === 'string' ? school.created_at : typeof school.createdAt === 'string' ? school.createdAt : null,
    }));
  },
  createSchool: (input: UpsertOpenSchoolInput) =>
    apiPost<{ success: true; school: OpenSchoolListItem }>('/api/openapi/schools', {
      name: input.name,
      description: input.description,
      contact_info: input.contactInfo,
    }),
  /**
   * `PUT /api/openapi/schools/:id`.
   *
   * The console could add a partner school and delete one, but not correct one - so a typo in a
   * school's name or contact meant deleting the row (and its `id`, which the API keys reference) and
   * creating a new one. Same payload shape as create: the route parses `contact_info`.
   */
  updateSchool: (id: number, input: UpsertOpenSchoolInput) =>
    apiPut<{ success: true; school: OpenSchoolListItem }>(`/api/openapi/schools/${id}`, {
      name: input.name,
      description: input.description,
      contact_info: input.contactInfo,
    }),
  deleteSchool: (id: number) => apiDelete<{ success: true }>(`/api/openapi/schools/${id}`),

  /**
   * `question_bank` - the challenge's question source.
   *
   * These four routes have existed since the migration and were called by nothing: the challenge
   * page draws its questions from `question_bank`, so on every fresh install it had none and
   * 挑战模式 / 世界BOSS answered "暂无题目". The console owns them because the plugin gates all four on
   * `requireAdmin` (`plugins/system/src/system.authorization.ts`).
   *
   * `teacherId` scopes the list to one teacher's rows; omit it to see the whole bank, which is what
   * the console does - an admin is not "a teacher's" bank.
   */
  getQuestionBank: async (teacherId?: number | string): Promise<QuestionBankItem[]> => {
    const suffix = teacherId === undefined || teacherId === '' ? '' : `?teacherId=${teacherId}`;
    const response = await apiGet<{ success: true; questions: QuestionBankItem[] }>(`/api/system/questions${suffix}`);
    return response.questions ?? [];
  },
  createQuestionBankItem: (input: UpsertQuestionBankInput) =>
    apiPost<{ success: true; question: QuestionBankItem }>('/api/system/questions', input),
  updateQuestionBankItem: (id: number, input: UpsertQuestionBankInput) =>
    apiPut<{ success: true }>(`/api/system/questions/${id}`, input),
  deleteQuestionBankItem: (id: number) => apiDelete<{ success: true }>(`/api/system/questions/${id}`),
};
