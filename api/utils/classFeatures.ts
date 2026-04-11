import db from '../db.js';
import { ApiError } from './asyncHandler.js';

export const classFeatureKeys = [
  'enable_chat_bubble',
  'enable_peer_review',
  'enable_tree_hole',
  'enable_shop',
  'enable_lucky_draw',
  'enable_challenge',
  'enable_family_tasks',
  'enable_world_boss',
  'enable_guild_pk',
  'enable_auction_blind_box',
  'enable_achievements',
  'enable_parent_buff',
  'enable_task_tree',
  'enable_danmaku',
  'enable_class_brawl',
  'enable_slg',
  'enable_gacha',
  'enable_economy',
  'enable_dungeon',
] as const;

export type ClassFeatureKey = (typeof classFeatureKeys)[number];

export function pickClassFeatures(source: Record<string, unknown> | null | undefined) {
  const features = {} as Record<ClassFeatureKey, boolean>;
  for (const key of classFeatureKeys) {
    features[key] = Boolean(source?.[key]);
  }
  return features;
}

export function getClassFeaturesByClassId(classId: number) {
  const columns = classFeatureKeys.join(', ');
  const row = db.prepare(`SELECT ${columns} FROM classes WHERE id = ?`).get(classId) as Record<string, unknown> | undefined;
  if (!row) {
    throw new ApiError(404, '班级未找到');
  }
  return pickClassFeatures(row);
}

export function assertClassFeatureEnabled(classId: number, feature: ClassFeatureKey) {
  const features = getClassFeaturesByClassId(classId);
  if (!features[feature]) {
    throw new ApiError(403, '该功能当前已关闭');
  }
  return features;
}

export function getClassIdByStudentId(studentId: number) {
  const row = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId) as { class_id: number } | undefined;
  if (!row) {
    throw new ApiError(404, '学生未找到');
  }
  return row.class_id;
}

export function getClassIdByUserId(userId: number, role: 'student' | 'parent' = 'student') {
  const row =
    role === 'parent'
      ? (db
          .prepare(
            `
            SELECT s.class_id
            FROM parent_students ps
            JOIN students s ON s.id = ps.student_id
            WHERE ps.parent_id = ?
            LIMIT 1
          `,
          )
          .get(userId) as { class_id: number } | undefined)
      : (db.prepare('SELECT class_id FROM students WHERE user_id = ?').get(userId) as { class_id: number } | undefined);

  if (!row) {
    throw new ApiError(404, '班级未找到');
  }

  return row.class_id;
}

export function assertAnyClassFeatureEnabled(classId: number, featuresToCheck: ClassFeatureKey[]) {
  const features = getClassFeaturesByClassId(classId);
  if (!featuresToCheck.some((feature) => features[feature])) {
    throw new ApiError(403, '该功能当前已关闭');
  }
  return features;
}

export function assertStudentFeatureEnabled(studentId: number, feature: ClassFeatureKey) {
  const classId = getClassIdByStudentId(studentId);
  return assertClassFeatureEnabled(classId, feature);
}

export function assertAnyStudentFeatureEnabled(studentId: number, featuresToCheck: ClassFeatureKey[]) {
  const classId = getClassIdByStudentId(studentId);
  return assertAnyClassFeatureEnabled(classId, featuresToCheck);
}

export function assertActorFeatureEnabled(userId: number, role: 'student' | 'parent', feature: ClassFeatureKey) {
  const classId = getClassIdByUserId(userId, role);
  return assertClassFeatureEnabled(classId, feature);
}
