/**
 * Feature-flag facade.
 *
 * Kept so existing imports across `api/**` keep working while the capability
 * migration completes. It is a pure re-export: there is no logic here, and the key
 * list this module used to re-export is gone - flag names are derived from the class
 * row by the compatibility layer.
 *
 * P7 deletes this file once callers import the capability layer directly.
 */

export {
  assertActorFeatureEnabled,
  assertAnyClassFeatureEnabled,
  assertAnyStudentFeatureEnabled,
  assertClassFeatureEnabled,
  assertStudentFeatureEnabled,
  capabilityKeyFor,
  getClassFeaturesByClassId,
  getClassIdByStudentId,
  getClassIdByUserId,
  legacyKeysOf,
  pickClassFeatures,
  setClassFeatures,
} from '../utils/classFeatures.js';

export type { ClassFeatureKey, ClassFeatures } from '../utils/classFeatures.js';
