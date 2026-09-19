/**
 * engagement domain contracts.
 *
 * Moved from `src/shared/engagement/contracts.ts` in P2 so the backend no longer imports
 * from the frontend source tree. Type-only: see guardrail G6.
 */

import type { InsightsResult } from './insights.js';

// ---------------------------------------------------------------------------
// Cross-plugin port (P4.3b.12)
//
// `praises` moved to `plugins/engagement` in P4.3b.10, and the insights domain reads it in three
// places: a class-wide count for the overview, and the newest five snippets plus a count for the
// student report and radar. Those are the only engagement-owned reads in the whole report surface.
//
// Declared here, next to the DTOs they serve, because the port belongs to the plugin that owns the
// table - a consumer resolves it as `engagement.public`, not through classroom.
// ---------------------------------------------------------------------------

/** One praise as the report shows it - not the raw row. */
export interface PraiseSnippet {
  /** The constant title the report displays; the stored row has no title column. */
  title: string;
  message: string;
  created_at: string;
}

export interface EngagementPort {
  /** How many praises a student has received. */
  countPraisesForStudent(studentId: number): Promise<number>;

  /** How many praises every student of a class has received, summed. */
  countPraisesForClass(classId: number): Promise<number>;

  /**
   * The newest `limit` praise snippets for a student, newest first.
   *
   * A refusal is possible in principle (the caller resolves the roster itself), but an empty list is
   * a legitimate answer and the report shows it as a zero count.
   */
  listPraiseSnippetsForStudent(studentId: number, limit: number): Promise<InsightsResult<PraiseSnippet[]>>;
}

export interface MessageDto {
  id: number;
  class_id: number;
  sender_id: number;
  receiver_id: number | null;
  content: string;
  type: string;
  is_anonymous: number;
  sender_role: string;
  created_at: string;
  sender_name?: string;
  receiver_name?: string;
}

export interface SendMessagePayload {
  class_id: number;
  sender_id: number;
  receiver_id?: number | null;
  content: string;
  is_anonymous: boolean;
  type: string;
  sender_role: string;
}

export interface FamilyTaskDto {
  id: number;
  student_id: number;
  parent_id: number;
  title: string;
  points: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  created_at: string;
}

export interface FamilyTaskPayload {
  student_id: number;
  parent_id: number;
  title: string;
  points: number;
}

export interface PraiseDto {
  id: number;
  teacher_id: number;
  student_id: number;
  content: string;
  color: string;
  student_name: string;
  created_at: string;
}

export interface CertificateDto {
  id: number;
  student_id: number;
  student_name: string;
  title: string;
  description: string;
  created_at: string;
}

export interface IssueCertificatePayload {
  student_id: number;
  title: string;
  description?: string;
}

export interface RedemptionTicketDto {
  id: number;
  student_id?: number;
  item_name: string;
  code: string;
  status: 'pending' | 'used';
  created_at: string;
  used_at: string | null;
}

export interface LuckyDrawPrizeDto {
  id?: number;
  prize_name: string;
  probability?: number;
  quantity?: number;
}

export interface LuckyDrawConfigPayload {
  teacher_id: number;
  cost_points: number;
  configs: LuckyDrawPrizeDto[];
}

export interface PublicAnnouncementDto {
  id: number;
  title: string;
  content: string;
}

export interface DanmakuMessageDto {
  id: number;
  class_id: number;
  sender_name: string;
  content: string;
  color: string;
  created_at: string;
}

export interface SendDanmakuPayload {
  class_id: number;
  sender_name: string;
  content: string;
  color?: string;
}
