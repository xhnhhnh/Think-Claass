/**
 * Date, status and score formatting - all of it Chinese, all of it defensive about the two
 * things that actually break a mini program's date handling:
 *
 *   1. `new Date('2024-05-06 10:00:00')` is `Invalid Date` on iOS. The kernel writes SQLite
 *      timestamps in exactly that shape, so every string goes through `toTimestamp` below
 *      rather than straight into `new Date`.
 *   2. A due date is only useful next to *how long is left*, not as an absolute date. A pupil
 *      reading 「2024-05-06」 has to do the arithmetic themselves; 「今天 20:00 截止」 does not.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/

/** Parse a kernel timestamp (or epoch ms) into epoch ms. `0` means "no usable value". */
export function toTimestamp(input?: string | number | null): number {
  if (input === null || input === undefined || input === '') {
    return 0
  }
  if (typeof input === 'number') {
    return input > 0 ? input : 0
  }
  const match = DATE_PATTERN.exec(input)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    const hour = match[4] ? Number(match[4]) : 0
    const minute = match[5] ? Number(match[5]) : 0
    const second = match[6] ? Number(match[6]) : 0
    return new Date(year, month, day, hour, minute, second).getTime()
  }
  const parsed = new Date(input).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function parts(timestamp: number): { y: number; m: number; d: number; hh: string; mm: string } {
  const date = new Date(timestamp)
  return {
    y: date.getFullYear(),
    m: date.getMonth() + 1,
    d: date.getDate(),
    hh: pad2(date.getHours()),
    mm: pad2(date.getMinutes()),
  }
}

function sameDay(a: number, b: number): boolean {
  const left = parts(a)
  const right = parts(b)
  return left.y === right.y && left.m === right.m && left.d === right.d
}

/** `5月6日`, or `2023年5月6日` when the date is not this year. */
export function formatDate(input?: string | number | null): string {
  const timestamp = toTimestamp(input)
  if (!timestamp) {
    return '—'
  }
  const value = parts(timestamp)
  const thisYear = new Date().getFullYear()
  return value.y === thisYear ? `${value.m}月${value.d}日` : `${value.y}年${value.m}月${value.d}日`
}

/** `5月6日 20:00` - the shape a deadline and an announcement timestamp both want. */
export function formatDateTime(input?: string | number | null): string {
  const timestamp = toTimestamp(input)
  if (!timestamp) {
    return '—'
  }
  const value = parts(timestamp)
  return `${value.m}月${value.d}日 ${value.hh}:${value.mm}`
}

export function formatTime(input?: string | number | null): string {
  const timestamp = toTimestamp(input)
  if (!timestamp) {
    return '—'
  }
  const value = parts(timestamp)
  return `${value.hh}:${value.mm}`
}

/** `刚刚` / `12 分钟前` / `3 小时前` / `昨天` / `5月6日`. */
export function formatRelative(input?: string | number | null): string {
  const timestamp = toTimestamp(input)
  if (!timestamp) {
    return ''
  }
  const diff = Date.now() - timestamp
  if (diff < 60_000) {
    return '刚刚'
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} 分钟前`
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)} 小时前`
  }
  if (sameDay(timestamp, Date.now() - 86_400_000)) {
    return '昨天'
  }
  return formatDate(timestamp)
}

export type DueTone = 'muted' | 'warning' | 'danger'

export interface DueLabel {
  text: string
  tone: DueTone
}

/**
 * How a deadline reads in a list row.
 *
 * Three tones and not five: `danger` is "already closed" (which changes what the student can
 * do), `warning` is "within three days", `muted` is everything else.
 */
export function formatDueLabel(dueAt?: string | null): DueLabel {
  const timestamp = toTimestamp(dueAt)
  if (!timestamp) {
    return { text: '不限时间', tone: 'muted' }
  }
  const now = Date.now()
  if (timestamp < now) {
    return { text: `${formatDate(timestamp)} 已截止`, tone: 'danger' }
  }
  if (sameDay(timestamp, now)) {
    return { text: `今天 ${formatTime(timestamp)} 截止`, tone: 'warning' }
  }
  if (sameDay(timestamp, now + 86_400_000)) {
    return { text: `明天 ${formatTime(timestamp)} 截止`, tone: 'warning' }
  }
  const days = Math.ceil((timestamp - now) / 86_400_000)
  if (days <= 3) {
    return { text: `${days} 天后截止`, tone: 'warning' }
  }
  return { text: `${formatDate(timestamp)} 截止`, tone: 'muted' }
}

/** `85 / 100`, or `—` while nothing has been graded. */
export function formatScore(score?: number | null, total?: number | null): string {
  if (score === null || score === undefined) {
    return '—'
  }
  return total ? `${score} / ${total}` : String(score)
}

/** `已完成 6/8` style progress, used by the AI 智学 set header. */
export function formatProgress(done: number, total: number): string {
  if (!total) {
    return '还没有题目'
  }
  return `已完成 ${done}/${total}`
}

export function homeworkStatusText(status?: string | null): string {
  switch (status) {
    case 'draft':
      return '草稿'
    case 'published':
      return '进行中'
    case 'closed':
      return '已结束'
    default:
      return '未知状态'
  }
}

export function submissionStatusText(status?: string | null): string {
  switch (status) {
    case 'draft':
      return '未提交'
    case 'submitted':
      return '已提交 · 待批改'
    case 'graded':
      return '已批改'
    case 'returned':
      return '待订正'
    default:
      return ''
  }
}

export function questionTypeText(type?: string | null): string {
  switch (type) {
    case 'single':
      return '单选题'
    case 'multiple':
      return '多选题'
    case 'blank':
      return '填空题'
    case 'short':
      return '简答题'
    default:
      return '题目'
  }
}

/** `student` -> `学生`; the console's roles, in the words a pupil or teacher uses. */
export function roleText(role?: string | null): string {
  switch (role) {
    case 'student':
      return '学生'
    case 'teacher':
      return '老师'
    case 'parent':
      return '家长'
    case 'admin':
      return '管理员'
    case 'superadmin':
      return '超级管理员'
    default:
      return '用户'
  }
}

export function ticketStatusText(status?: string | null): string {
  switch (status) {
    case 'pending':
      return '待核销'
    case 'used':
      return '已核销'
    default:
      return ''
  }
}

/** `+5` / `-3` - the sign is the whole message for a point record. */
export function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

/** `3 分钟前`-style text for a page footer: when this screen was last refreshed. */
export function formatFetchedAt(timestamp: number | null): string {
  if (!timestamp) {
    return ''
  }
  return `更新于 ${formatRelative(timestamp) || '刚刚'}`
}
