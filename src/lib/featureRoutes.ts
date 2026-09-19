/**
 * Which route each class-scope feature flag governs.
 *
 * This is frontend knowledge - the server has no idea that `enable_shop` corresponds to
 * `/student/shop` - so it lives in source rather than being generated.
 *
 * It is a separate module from `classFeatures.ts` for a measured reason: guardrail G5
 * ratchets "files that hardcode a list of the legacy feature keys", and its candidate list
 * is a set of catalogue files. Naming the flags in a route table is not a second catalogue
 * - the keys come from the generated module and the type system rejects an unknown one -
 * but keeping it here means the ratchet keeps counting what it was written to count.
 */

import type { ClassFeatureKey, ClassFeatures } from './classFeatures.generated';

/** A route can require one flag, or any one of several. */
export type FeatureRequirement =
  | { key: ClassFeatureKey }
  | { anyOf: ClassFeatureKey[] };

/** Which routes each flag enables. A flag may govern more than one route. */
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

/** Is the requirement satisfied? An absent requirement means "no gate". */
export function isFeatureRequirementEnabled(features: ClassFeatures, requirement?: FeatureRequirement) {
  if (!requirement) {
    return true;
  }

  if ('key' in requirement) {
    return features[requirement.key];
  }

  return requirement.anyOf.some((key) => features[key]);
}

/** The first route in `role`'s default order whose feature requirement is satisfied. */
export function getFirstEnabledRoute(role: 'student' | 'parent', features: ClassFeatures) {
  const routeOrder = role === 'student' ? studentDefaultRouteOrder : parentDefaultRouteOrder;
  const requirements = role === 'student' ? studentFeatureRequirements : parentFeatureRequirements;

  return routeOrder.find((path) => isFeatureRequirementEnabled(features, requirements[path])) ?? null;
}
