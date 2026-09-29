/**
 * Domain contracts, one module per business domain.
 *
 * Imported as `@thinkclass/contracts/domains/<domain>` so domain names cannot
 * collide with each other or with the core vocabulary.
 *
 * Deliberately NOT re-exported from the package root: two domains may legitimately
 * declare the same DTO name, and a merged root surface would make that a silent
 * conflict.
 *
 * `core` is absent by design - the HTTP envelope it used to hold lives in `../http.ts`.
 */

export type * from './admin.js';
export type * from './ai-study.js';
export type * from './auth.js';
export type * from './battles.js';
export type * from './challenge.js';
export type * from './classroom.js';
export type * from './collaboration.js';
export type * from './dungeon.js';
export type * from './economy.js';
export type * from './engagement.js';
export type * from './gacha.js';
export type * from './homework.js';
export type * from './identity.js';
export type * from './insights.js';
export type * from './learning.js';
export type * from './marketplace.js';
export type * from './parent-buff.js';
export type * from './pet.js';
export type * from './platform.js';
export type * from './portal.js';
export type * from './slg.js';
export type * from './wechat.js';
