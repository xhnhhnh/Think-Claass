/**
 * `plugins/classroom` and the teacher half of `plugins/homework`.
 *
 * ## Why `classFeatures` lives here
 *
 * `GET /api/classes/:id/features` is a classroom route, not a teacher-only one - both roles read
 * it - but it belongs with the other `classes`/`students` calls rather than in its own module, and
 * `utils/feature.ts` (the resolution chain) imports it from here. That direction is deliberate:
 * the feature module owns *what the flags mean*, this file owns *how they are fetched*.
 */

import { AI_REQUEST_TIMEOUT } from '../config/index'
import type { ClassFeatureFlags } from '../utils/storage'
import type { HomeworkDetail, HomeworkGradeRow, HomeworkListEntry, HomeworkPublishPayload } from './homework'
import { get, post } from '../utils/request'

export interface StudentDto {
  id: number
  user_id?: number | null
  class_id: number
  group_id?: number | null
  username?: string
  name: string
  total_points: number
  available_points: number
  group_name?: string | null
}

export interface ClassDto {
  id: number
  name: string
  teacher_id?: number | null
  invite_code: string
}

export interface BatchPointsPayload {
  studentIds: number[]
  amount: number
  reason: string
}

export interface BatchPointsResult {
  message: string
  results: Array<{ studentId: number; applied: number; bonus: number; total_points: number; available_points: number }>
}

/**
 * GET /api/classes/:id/features - the class's feature flags.
 *
 * `pet_selection_mode` is answered beside `features` but is not part of the flat map: it is a
 * string setting, not a switch, so it is dropped here rather than smuggled into a
 * `Record<string, boolean>`.
 */
export async function classFeatures(classId: number): Promise<ClassFeatureFlags> {
  const body = await get<{ success: true; classId: number; features: ClassFeatureFlags; pet_selection_mode?: string }>(
    `/api/classes/${classId}/features`,
  )
  return body.features || {}
}

/** GET /api/students?classId= - the class roster. Omit `classId` for every student the actor owns. */
export async function listStudents(classId?: number | null): Promise<StudentDto[]> {
  const query = classId ? `?classId=${classId}` : ''
  const body = await get<{ success: true; students: StudentDto[] }>(`/api/students${query}`)
  return body.students || []
}

/** POST /api/students/batch-points - the classroom's most-used write: 加/减分 for a selection. */
export async function batchPoints(payload: BatchPointsPayload): Promise<BatchPointsResult> {
  const body = await post<{ success: true; message?: string; results?: BatchPointsResult['results'] }>(
    '/api/students/batch-points',
    payload,
  )
  return { message: body.message || '操作成功', results: body.results || [] }
}

/** GET /api/homework - the teacher's own homework (rows carrying their `teacher_id`). */
export async function listHomework(): Promise<HomeworkListEntry[]> {
  const body = await get<{ success: true; data: HomeworkListEntry[] }>('/api/homework')
  return body.data || []
}

/**
 * POST /api/homework - publish.
 *
 * `class_id` is required and is the teacher's own class (the server derives `teacher_id` from the
 * actor and discards any copy in the body). The long timeout is for the *dialog* case where the
 * teacher used 「AI 出题」 first; the write itself is fast.
 */
export async function createHomework(payload: HomeworkPublishPayload): Promise<HomeworkDetail> {
  const body = await post<{ success: true; data: HomeworkDetail }>('/api/homework', payload, { timeout: AI_REQUEST_TIMEOUT })
  return body.data
}

/** GET /api/homework/:id/submissions - the grade sheet: submissions with student names. */
export async function listSubmissions(homeworkId: number): Promise<HomeworkGradeRow[]> {
  const body = await get<{ success: true; data: HomeworkGradeRow[] }>(`/api/homework/${homeworkId}/submissions`)
  return body.data || []
}

export type { HomeworkDetail, HomeworkGradeRow, HomeworkListEntry, HomeworkPublishPayload }
