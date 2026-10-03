/**
 * The operator surfaces, as the mini program uses them.
 *
 * Everything here hangs off the admin surface under `/api`, which is `admin` and `superadmin` only
 * (`plugins/admin/src/admin.controllers.ts` gates every handler on `requireAdmin`). The bearer token
 * this client already holds is the whole of the authentication - the same token the teacher and
 * student screens use, which is why a console account signs in through the ordinary login page:
 * there is no second session type and no `/api/admin/session` call here (that route exists for the
 * web console's own login form, and calling it twice would mint two tokens for one person).
 *
 * ## Why these three reads and not more
 *
 * The mini program shows the operator what is worth a phone screen: is the service healthy, who are
 * the teachers, and is the AI actually configured. Everything destructive or wide (`database/reset`,
 * `database/import`, the update runner, the payment keys) stays on the web console, where a
 * mis-tap costs a dialog rather than a class's data.
 *
 * ## The `data` envelope
 *
 * `plugins/admin` answers `{ success: true, data: {...} }` rather than the bare payload the student
 * and teacher services read. That is not a mistake here: these routes were built for the console
 * (which reads `data`) and are being reused as-is, so each function unwraps exactly one level and
 * the callers see a plain object.
 */

import { get, put } from '../utils/request'

/** `GET /api/admin/system/stats` */
export interface AdminSystemStats {
  server: {
    cpuUsage: number
    cpuCount: number
    totalMem: number
    usedMem: number
    freeMem: number
    memUsage: number
    uptime: number
    platform: string
  }
  database: {
    totalUsers: number
    teachers: number
    students: number
    classes: number
    totalActivity: number
    totalAssignments: number
    totalLeaves: number
    draftArticles: number
    inactiveTeachers: number
    totalTeamQuests: number
    totalPoints: number
  }
}

/** One row of `GET /api/admin/users`. */
export interface AdminUser {
  id: number
  username: string
  role: string
  isActivated: boolean
}

export async function adminStats(): Promise<AdminSystemStats> {
  const res = await get<{ success: true; data: AdminSystemStats }>('/api/admin/system/stats')
  return res.data
}

export async function adminUsers(): Promise<AdminUser[]> {
  const res = await get<{ success: true; data: { items: AdminUser[]; total: number } }>('/api/admin/users')
  return res.data.items || []
}

/**
 * The AI half of `GET /api/admin/system/settings`.
 *
 * Only the five `ai_*` keys are modelled. The route answers the *whole* settings row - payment
 * credentials, site title and all - and this client deliberately never renders the rest: a
 * `payment_wechat_private_key` has no business on a phone screen, and a client that displayed it
 * would be one screenshot away from a leak. The extra keys are simply ignored.
 */
export interface AdminAiSettings {
  ai_provider?: string
  ai_base_url?: string
  ai_api_key?: string
  ai_model?: string
  ai_timeout_ms?: string
}

export async function adminSettings(): Promise<AdminAiSettings> {
  const res = await get<{ success: true; data: AdminAiSettings }>('/api/admin/system/settings')
  return res.data
}

/**
 * `PUT /api/admin/system/settings` - a partial update, exactly the keys handed in.
 *
 * `plugins/admin` merges what it receives into the stored settings, so sending only `ai_model`
 * changes only the model. The caller decides what to include; `ai_api_key` is only sent when the
 * operator typed a new one, because the server masks it on read and an empty string would otherwise
 * be indistinguishable from "leave it alone".
 */
export async function saveAdminSettings(patch: AdminAiSettings): Promise<AdminAiSettings> {
  const res = await put<{ success: true; data: AdminAiSettings }>('/api/admin/system/settings', patch)
  return res.data
}
