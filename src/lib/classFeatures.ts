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
export type ClassFeatures = Record<ClassFeatureKey, boolean>;

export const defaultClassFeatures: ClassFeatures = {
  enable_chat_bubble: true,
  enable_peer_review: true,
  enable_tree_hole: true,
  enable_shop: true,
  enable_lucky_draw: true,
  enable_challenge: true,
  enable_family_tasks: true,
  enable_world_boss: true,
  enable_guild_pk: true,
  enable_auction_blind_box: true,
  enable_achievements: true,
  enable_parent_buff: true,
  enable_task_tree: true,
  enable_danmaku: true,
  enable_class_brawl: true,
  enable_slg: true,
  enable_gacha: true,
  enable_economy: true,
  enable_dungeon: true,
};

export const classFeatureLabels: Record<ClassFeatureKey, string> = {
  enable_chat_bubble: '聊天气泡',
  enable_peer_review: '同伴互评',
  enable_tree_hole: '互动墙',
  enable_shop: '积分商城',
  enable_lucky_draw: '翻牌抽奖',
  enable_challenge: '挑战模式',
  enable_family_tasks: '家校任务',
  enable_world_boss: '世界 Boss',
  enable_guild_pk: '公会 PK',
  enable_auction_blind_box: '拍卖盲盒',
  enable_achievements: '成就系统',
  enable_parent_buff: '家长增益',
  enable_task_tree: '技能树',
  enable_danmaku: '弹幕互动',
  enable_class_brawl: '大乱斗',
  enable_slg: '版图玩法',
  enable_gacha: '召唤法阵',
  enable_economy: '经济系统',
  enable_dungeon: '无尽塔',
};

export const classFeatureRouteMap: Partial<Record<ClassFeatureKey, string[]>> = {
  enable_shop: ['/student/shop'],
  enable_auction_blind_box: ['/student/auction'],
  enable_challenge: ['/student/challenge'],
  enable_world_boss: ['/student/challenge'],
  enable_lucky_draw: ['/student/lucky-draw'],
  enable_achievements: ['/student/achievements'],
  enable_chat_bubble: ['/student/interactive-wall'],
  enable_tree_hole: ['/student/interactive-wall'],
  enable_peer_review: ['/student/peer-review'],
  enable_task_tree: ['/student/task-tree'],
  enable_class_brawl: ['/student/brawl'],
  enable_slg: ['/student/territory'],
  enable_gacha: ['/student/gacha'],
  enable_economy: ['/student/bank'],
  enable_dungeon: ['/student/dungeon'],
  enable_guild_pk: ['/student/guild-pk'],
  enable_family_tasks: ['/parent/tasks'],
};

export type FeatureRequirement =
  | { key: ClassFeatureKey }
  | { anyOf: ClassFeatureKey[] };

export const studentFeatureRequirements: Partial<Record<string, FeatureRequirement>> = {
  '/student/shop': { key: 'enable_shop' },
  '/student/auction': { key: 'enable_auction_blind_box' },
  '/student/challenge': { key: 'enable_challenge' },
  '/student/lucky-draw': { key: 'enable_lucky_draw' },
  '/student/achievements': { key: 'enable_achievements' },
  '/student/interactive-wall': { anyOf: ['enable_chat_bubble', 'enable_tree_hole'] },
  '/student/peer-review': { key: 'enable_peer_review' },
  '/student/guild-pk': { key: 'enable_guild_pk' },
  '/student/task-tree': { key: 'enable_task_tree' },
  '/student/brawl': { key: 'enable_class_brawl' },
  '/student/territory': { key: 'enable_slg' },
  '/student/gacha': { key: 'enable_gacha' },
  '/student/bank': { key: 'enable_economy' },
  '/student/dungeon': { key: 'enable_dungeon' },
};

export const parentFeatureRequirements: Partial<Record<string, FeatureRequirement>> = {
  '/parent/tasks': { key: 'enable_family_tasks' },
};

export const studentDefaultRouteOrder = [
  '/student/pet',
  '/student/shop',
  '/student/auction',
  '/student/challenge',
  '/student/lucky-draw',
  '/student/my-redemptions',
  '/student/certificates',
  '/student/achievements',
  '/student/interactive-wall',
  '/student/peer-review',
  '/student/dungeon',
  '/student/brawl',
  '/student/gacha',
  '/student/task-tree',
  '/student/territory',
  '/student/bank',
  '/student/guild-pk',
  '/student/assignments',
  '/student/team-quests',
] as const;

export const parentDefaultRouteOrder = [
  '/parent/dashboard',
  '/parent/communication',
  '/parent/report',
  '/parent/tasks',
  '/parent/leave-request',
  '/parent/assignments',
] as const;

export function isFeatureRequirementEnabled(features: ClassFeatures, requirement?: FeatureRequirement) {
  if (!requirement) {
    return true;
  }

  if ('key' in requirement) {
    return features[requirement.key];
  }

  return requirement.anyOf.some((key) => features[key]);
}

export function getFirstEnabledRoute(
  role: 'student' | 'parent',
  features: ClassFeatures,
) {
  const routeOrder = role === 'student' ? studentDefaultRouteOrder : parentDefaultRouteOrder;
  const requirements = role === 'student' ? studentFeatureRequirements : parentFeatureRequirements;

  return routeOrder.find((path) => isFeatureRequirementEnabled(features, requirements[path])) ?? null;
}
