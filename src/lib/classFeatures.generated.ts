/**
 * GENERATED FILE - do not edit by hand.
 *
 * The class-scope feature catalogue, projected from `plugins/classroom/plugin.json`, which
 * is where the flags and their labels are declared. Regenerate with:
 *
 *   npm run class-features          # rewrite
 *   npm run class-features:check    # verify (also runs in the guardrail suite)
 *
 * Editing this by hand reintroduces exactly the duplication it exists to remove: the
 * frontend and the server would disagree about which features exist, and the failure mode
 * is a page that 403s with no visible cause.
 */

export const classFeatureKeys = [
  'enable_achievements',
  'enable_ai_study',
  'enable_auction_blind_box',
  'enable_challenge',
  'enable_chat_bubble',
  'enable_class_brawl',
  'enable_danmaku',
  'enable_dungeon',
  'enable_economy',
  'enable_family_tasks',
  'enable_gacha',
  'enable_guild_pk',
  'enable_lucky_draw',
  'enable_parent_buff',
  'enable_peer_review',
  'enable_shop',
  'enable_slg',
  'enable_task_tree',
  'enable_tree_hole',
  'enable_world_boss',
] as const;

export type ClassFeatureKey = (typeof classFeatureKeys)[number];

export type ClassFeatures = Record<ClassFeatureKey, boolean>;

/** Every flag off: the state before a class's settings have loaded. */
export const defaultClassFeatures: ClassFeatures = {
  'enable_achievements': false,
  'enable_ai_study': false,
  'enable_auction_blind_box': false,
  'enable_challenge': false,
  'enable_chat_bubble': false,
  'enable_class_brawl': false,
  'enable_danmaku': false,
  'enable_dungeon': false,
  'enable_economy': false,
  'enable_family_tasks': false,
  'enable_gacha': false,
  'enable_guild_pk': false,
  'enable_lucky_draw': false,
  'enable_parent_buff': false,
  'enable_peer_review': false,
  'enable_shop': false,
  'enable_slg': false,
  'enable_task_tree': false,
  'enable_tree_hole': false,
  'enable_world_boss': false,
};

export const classFeatureLabels: Record<ClassFeatureKey, string> = {
  'enable_achievements': '成就系统',
  'enable_ai_study': 'AI 智学',
  'enable_auction_blind_box': '拍卖盲盒',
  'enable_challenge': '挑战模式',
  'enable_chat_bubble': '聊天气泡',
  'enable_class_brawl': '大乱斗',
  'enable_danmaku': '弹幕互动',
  'enable_dungeon': '无尽塔',
  'enable_economy': '经济系统',
  'enable_family_tasks': '家校任务',
  'enable_gacha': '召唤法阵',
  'enable_guild_pk': '公会 PK',
  'enable_lucky_draw': '翻牌抽奖',
  'enable_parent_buff': '家长增益',
  'enable_peer_review': '同伴互评',
  'enable_shop': '积分商城',
  'enable_slg': '版图玩法',
  'enable_task_tree': '技能树',
  'enable_tree_hole': '互动墙',
  'enable_world_boss': '世界 Boss',
};
