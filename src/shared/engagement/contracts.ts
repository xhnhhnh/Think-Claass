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
