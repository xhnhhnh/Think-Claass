/**
 * Student-scoped reads: the motivation summary, the student row, the class announcement, and the
 * certificates a pupil has been awarded.
 *
 * Each of these answers a *flat* envelope (`{ success: true, summary }`, `{ success: true, items }`)
 * rather than the nested `{ data }` shape homework uses, which is why the unwrapping here is per
 * route rather than one shared helper. That inconsistency is the kernel's, not this client's, and
 * it is confined to this file.
 */

import { get } from '../utils/request'

/**
 * `GET /api/students/:id/summary` - the growth ring's numbers.
 *
 * `availableCredits` is the spendable balance (the shop prices against it), `level` and
 * `schoolStage` are the labels the student sees, and the four 0-100 dimensions feed the summary
 * cards on 成长总览.
 */
export interface StudentMotivationSummary {
  studentId: number
  growth: number
  collaboration: number
  competition: number
  participation: number
  availableCredits: number
  level: string
  schoolStage: 'general' | 'primary' | 'middle' | 'high'
  parentBonusPercent: number
  parentBlessingActive: boolean
}

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

/** The active announcement: `announcement` is absent when the console has none switched on. */
export interface PublicAnnouncementDto {
  id: number
  title: string
  content: string
}

export interface CertificateDto {
  id: number
  student_id: number
  student_name: string
  title: string
  description: string
  created_at: string
}

/** GET /api/students/:id/summary */
export async function getSummary(studentId: number): Promise<StudentMotivationSummary> {
  const body = await get<{ success: true; summary: StudentMotivationSummary }>(`/api/students/${studentId}/summary`)
  return body.summary
}

/** GET /api/students/:id */
export async function getStudent(studentId: number): Promise<StudentDto> {
  const body = await get<{ success: true; student: StudentDto }>(`/api/students/${studentId}`)
  return body.student
}

/** GET /api/announcements/active - one banner, or `null` when nothing is active. */
export async function getActiveAnnouncement(): Promise<PublicAnnouncementDto | null> {
  const body = await get<{ success: true; announcement?: PublicAnnouncementDto | null }>('/api/announcements/active')
  return body.announcement || null
}

/** GET /api/certificates?studentId= - the 奖状 wall. */
export async function getCertificates(studentId: number): Promise<CertificateDto[]> {
  const body = await get<{ success: true; certificates: CertificateDto[] }>(`/api/certificates?studentId=${studentId}`)
  return body.certificates || []
}
