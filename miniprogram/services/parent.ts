/**
 * 家长端 - the parent's own surfaces, as the mini program uses them.
 *
 * ## Where this comes from
 *
 * The web has a whole `/parent` layout (Dashboard / Report / Tasks / LeaveRequest / Assignments /
 * communication). The mini program had only a read-only mirror of the *student* pages until now,
 * which meant a parent could look but not do the one thing the product asks of them daily: cast the
 * blessing that turns into a points bonus (`POST /api/parent-buff`).
 *
 * Every call here mirrors an existing web contract (`src/features/<domain>/api` modules and the
 * query hooks beside them, plus `src/features/platform/api`) rather than inventing a shape: the
 * parent screens on the two clients answer the same questions and must not drift. The paths are the
 * same strings the web sends, which also keeps the endpoint parity guardrail
 * (`tests/guardrails/client-endpoint-parity.test.ts`) honest in both directions.
 *
 * (Wording note: this file deliberately never writes a glob like `features/*` followed by the api
 * segment - the parity guardrail scans for endpoint-shaped string literals in client sources and a
 * glob reads as one, which fails the build for a comment.)
 *
 * ## What a parent may do
 *
 * Reads are broad - a parent is `RECORD_READERS` on homework, `ASSET_READERS` on the economy, and
 * `parent` on the leaves/communication routes. Writes are narrow and deliberate: cast the daily
 * blessing, create a leave request, complete a family task. There is no parent-side grading, no
 * points editing, no class administration - those stay with the teacher and the console.
 */

import { get, post, put } from '../utils/request'
import type { CertificateDto, PublicAnnouncementDto, StudentDto, StudentMotivationSummary } from './student'

/** `GET /api/students/records?studentId=` - one row per points event. */
export interface StudentRecordDto {
  id: number
  student_id: number
  type: string
  points?: number
  amount?: number
  reason?: string | null
  created_at: string
}

/**
 * One row of `GET /api/family-tasks?studentId=`.
 *
 * The columns are the table's own (`family_tasks`): `points` is the reward, there is **no
 * `description` column**, and the creator is `parent_id`. A `reward_points`/`description` pair would
 * read `undefined` on every row (the list would print "奖励 0 分" forever) and, on the write side,
 * answer `400 Missing required fields` - the shape was measured against the running server, not
 * guessed from the web's older type.
 */
export interface FamilyTaskDto {
  id: number
  student_id: number
  parent_id?: number | null
  title: string
  /** Reward in credits; required on create (`points === undefined` is a 400). */
  points: number
  status: 'pending' | 'completed' | 'approved' | 'rejected' | string
  created_at?: string
}

/**
 * The child's pet, when the class has that feature on.
 *
 * `GET /api/pets/:studentId` answers `{ pet, has_parent_buff }`. The second field is whether today's
 * blessing is on record for this child - a second, cheaper source for the fact
 * `GET /api/students/:id/summary` reports as `parentBlessingActive`. Both exist because the summary
 * belongs to the student screens and this call to the pet card; a parent screen should not have to
 * fetch the other surface merely to decide whether to offer the blessing button.
 */
export interface PetDto {
  id?: number
  student_id?: number
  name?: string
  level?: number
  exp?: number
  stage?: string
  [key: string]: unknown
}

export interface PetAnswer {
  pet: PetDto | null
  /** True when today's blessing already exists - do not offer the button again. */
  hasParentBuff: boolean
}

/**
 * `GET /api/analytics/students/:id/report`.
 *
 * The top-level keys are the ones the route actually answers - measured, because the obvious guess
 * (`overview` / `subjects` / `knowledge` / `trend`) is the shape of a *different* analytics screen and
 * none of those four exist here. A client typed against them would read `undefined` for every field
 * and render an empty report with a 200.
 */
export interface StudentReportDto {
  student?: { id: number; class_id?: number; name?: string; total_points?: number }
  /** The eight numbers the report's summary card prints. */
  summary?: {
    weekly_earned?: number
    weekly_spent?: number
    total_earned?: number
    total_spent?: number
    average_exam_score?: number
    assignment_completion_rate?: number
    attendance_rate?: number
    praise_count?: number
    [key: string]: unknown
  }
  records?: Array<Record<string, unknown>>
  recent_exams?: Array<Record<string, unknown>>
  assignments?: Array<Record<string, unknown>>
  attendance?: Array<Record<string, unknown>>
  praises?: Array<Record<string, unknown>>
  leaves?: Array<Record<string, unknown>>
  [key: string]: unknown
}

/**
 * One row of `GET /api/leaves` (`leave_requests`).
 *
 * The column names are the ones the table actually has, which is not what the web's TypeScript type
 * guesses: the reviewer is `reviewer_id` and the note is `review_comment` (see
 * `classroom.repository.ts#updateLeave`). There is **no** `type` column - a leave has a date range
 * and a reason, and a form that offered "病假/事假" would have nowhere to put it.
 */
export interface LeaveDto {
  id: number
  student_id: number
  student_name?: string
  parent_id?: number | null
  start_date: string
  end_date: string
  reason?: string | null
  status: 'pending' | 'approved' | 'rejected' | string
  reviewer_id?: number | null
  review_comment?: string | null
  created_at?: string
}

/**
 * Body of `POST /api/leaves`.
 *
 * Exactly the four fields the route reads (`classroom.service.ts#createLeave`). The server ignores a
 * `parent_id` in the body on purpose - it records the submitting parent as the actor, so a request
 * cannot file leave on another family's behalf.
 */
export interface CreateLeavePayload {
  student_id: number
  start_date: string
  end_date: string
  reason?: string
}

// ---------------------------------------------------------------------------
// 温馨家园 (dashboard)
// ---------------------------------------------------------------------------

/**
 * `POST /api/parent-buff` - the one daily action this client exists to give a parent.
 *
 * The bonus is real but bounded: while today's blessing is on record, every positive teacher score
 * for that child carries an extra `parent_bonus_percent`% of the base, capped at 2 points per day
 * (`classroom.service.ts:207-209`), and only while the class has `enable_parent_buff` on.
 *
 * It is **once per day**, and the server answers `400 今日已经施放过祝福了` for a second attempt -
 * there is no "undo". That is why the screens must decide whether to offer the button from
 * `parentBlessingActive` on the summary rather than from local state: a client that remembered "I
 * tapped it" would be wrong after a reinstall, and a client that always offered the button would
 * hand the parent a guaranteed error.
 */
export async function blessChild(studentId: number): Promise<void> {
  await post<{ success: true }>('/api/parent-buff', { studentId })
}

/** `GET /api/students/:id` - the child's own row, including both points balances. */
export async function parentChild(studentId: number): Promise<StudentDto> {
  const res = await get<{ success: true; student: StudentDto }>(`/api/students/${studentId}`)
  return res.student
}

/**
 * `GET /api/students/records?studentId=` - the points ledger.
 *
 * The child is named by a **query parameter**, not by a path segment: there is no per-student
 * records route to call, which is why this is its own function rather than a hypothetical
 * `/students/:id/records`. (That path is spelled out nowhere in this file on purpose - the parity
 * guardrail reads endpoint-shaped literals, comments included, and would report a call to a route
 * that does not exist.)
 */
export async function parentRecords(studentId: number): Promise<StudentRecordDto[]> {
  const res = await get<{ success: true; records: StudentRecordDto[] }>(`/api/students/records?studentId=${studentId}`)
  return res.records || []
}

/**
 * `GET /api/pets/:studentId` - the pet card, plus today's blessing state.
 *
 * Never throws: a class with the pet feature off answers 404 (and family tasks answer 403 when their
 * flag is off), and a parent screen must not turn "this class does not use that feature" into a
 * network-error card. The blessing flag defaults to `false` on failure, which is the direction that
 * still offers the button - the server refuses a second blessing with a clear 400, whereas hiding the
 * button for a parent who has not blessed yet would silently lose the day's bonus.
 */
export async function parentPet(studentId: number): Promise<PetAnswer> {
  try {
    const res = await get<{ success: true; pet: PetDto | null; has_parent_buff?: boolean }>(`/api/pets/${studentId}`)
    return { pet: res.pet || null, hasParentBuff: res.has_parent_buff === true }
  } catch (error) {
    console.warn('[parent] pet unavailable', error)
    return { pet: null, hasParentBuff: false }
  }
}

// ---------------------------------------------------------------------------
// 家庭时光 (family tasks)
// ---------------------------------------------------------------------------

export async function familyTasks(studentId: number): Promise<FamilyTaskDto[]> {
  try {
    const res = await get<{ success: true; tasks: FamilyTaskDto[] }>(`/api/family-tasks?studentId=${studentId}`)
    return res.tasks || []
  } catch (error) {
    // Gated by `enable_family_tasks`: a class with it off answers an error, and an empty list is the
    // honest rendering of "this class does not use family time", not an error card.
    console.warn('[parent] family tasks unavailable', error)
    return []
  }
}

/**
 * `POST /api/family-tasks` - the parent writes a new 家庭约定.
 *
 * Exactly the three fields the route reads (`engagement.controllers.ts#createTask`): the child, the
 * title and the reward. `parent_id` is **derived from the token** by the server, so sending it would
 * be ignored at best; and `points` is spelled `points`, not `reward_points` - the wrong name is a
 * plain `400 Missing required fields`, which reads like a validation problem rather than a typo.
 */
export async function createFamilyTask(payload: {
  student_id: number
  title: string
  points: number
}): Promise<void> {
  await post<{ success: true; task?: FamilyTaskDto }>('/api/family-tasks', payload)
}

/** `PUT /api/family-tasks/:id` - the parent approves (or rejects) what the child finished. */
export async function reviewFamilyTask(taskId: number, status: 'approved' | 'rejected'): Promise<void> {
  await put<{ success: true }>(`/api/family-tasks/${taskId}`, { status })
}

// ---------------------------------------------------------------------------
// 成长足迹 (report)
// ---------------------------------------------------------------------------

/**
 * `GET /api/analytics/students/:id/report`.
 *
 * Gated by the `enable_parent_report` system setting on the server; a deployment with it off answers
 * an error, which the page renders as "老师还没有开放成长报告" rather than as a network failure.
 */
export async function childReport(studentId: number): Promise<StudentReportDto> {
  const res = await get<{ success: true } & StudentReportDto>(`/api/analytics/students/${studentId}/report`)
  return res
}

// ---------------------------------------------------------------------------
// 请假假条 (leaves)
// ---------------------------------------------------------------------------

/**
 * `GET /api/leaves`.
 *
 * A parent's own requests come back scoped by the server (they are the actor); the `studentId` query
 * is what the student-side screens use, so it is left off here on purpose.
 *
 * The envelope is `{ success, data: [...] }`, **not** `{ success, leaves: [...] }` - measured against
 * the running server, and the reason this unwraps `data`. Reading `res.leaves` would have produced a
 * permanently empty list with a 200, which is the kind of bug that looks like "no leave requests yet".
 */
export async function myLeaves(): Promise<LeaveDto[]> {
  const res = await get<{ success: true; data: LeaveDto[] }>('/api/leaves')
  return res.data || []
}

export async function createLeave(payload: CreateLeavePayload): Promise<void> {
  await post<{ success: true }>('/api/leaves', payload)
}

// ---------------------------------------------------------------------------
// Re-exports the parent screens share with the student ones
// ---------------------------------------------------------------------------

export type { CertificateDto, PublicAnnouncementDto, StudentMotivationSummary }

// ---------------------------------------------------------------------------
// 家校信箱 (home-school messages)
// ---------------------------------------------------------------------------

/**
 * One row of the message feed (`packages/contracts/src/domains/engagement.ts` `MessageDto`).
 *
 * The fields are the contract's, snake_case and all: the wire carries `class_id`, `sender_role` and
 * `sender_id`, and `sender_name` is joined by the server for a teacher or parent sender (a student
 * sender is named from the roster). Nothing here is guessed - a camelCase guess would have read
 * `undefined` on every row and rendered an anonymous thread.
 */
export interface HomeSchoolMessageDto {
  id: number
  class_id: number
  sender_id: number
  receiver_id: number | null
  content: string
  type: string
  is_anonymous: number
  sender_role: string
  created_at: string
  sender_name?: string
  receiver_name?: string
}

/** Body of the message write - the contract's `SendMessagePayload`, which the web posts verbatim. */
export interface SendHomeSchoolMessagePayload {
  class_id: number
  sender_id: number
  content: string
  is_anonymous: boolean
  type: string
  sender_role: string
}

/** The one thread this page reads and writes; the server accepts this and three other types. */
export const HOME_SCHOOL_MESSAGE_TYPE = 'HOME_SCHOOL'

/**
 * `GET /api/messages?classId=&type=HOME_SCHOOL`.
 *
 * Only the class and the type are sent, which is the web's parent usage: the route's two optional
 * filters (`role`, `involvedId`) narrow a *student's* feed, and the role it uses to decide whether an
 * anonymous sender stays masked is derived from the actor anyway.
 *
 * The answer is every `HOME_SCHOOL` row of the class - the route does not know which family is
 * asking, and its filters cannot name one (they are validated against the actor's children, while a
 * parent's own letters are keyed by the parent's user id). Which of those rows belong to this family
 * is therefore decided by the page, exactly as the web's parent mailbox decides it.
 */
export async function homeSchoolMessages(classId: number): Promise<HomeSchoolMessageDto[]> {
  const res = await get<{ success: true; messages: HomeSchoolMessageDto[] }>(
    `/api/messages?classId=${classId}&type=${HOME_SCHOOL_MESSAGE_TYPE}`,
  )
  return res.messages || []
}

/**
 * `POST /api/messages` - one letter to the child's teacher.
 *
 * The sender is the caller: the route overwrites `sender_id`/`sender_role` from the token, so the
 * two fields in the payload are contract-filling rather than identity - the web sends them for the
 * same reason.
 *
 * The role list used to be `student`/`teacher` only, which made this call answer
 * 403 无权限执行该操作 for every parent even though the web's parent mailbox posts the same payload -
 * the family side of 家校信箱 had never been able to write. It now admits `parent`; the boundaries are
 * unchanged, because `assertClassAccess` limits a parent to a class their child is in and the sender
 * columns are derived from the actor rather than the body.
 */
export async function sendHomeSchoolMessage(payload: SendHomeSchoolMessagePayload): Promise<void> {
  await post<{ success: true; message?: string }>('/api/messages', payload)
}
