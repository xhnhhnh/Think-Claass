/**
 * Class-scope feature flags - frontend entry point.
 *
 * The flag *catalogue* (which flags exist and what they are called) is generated from
 * `plugins/classroom/plugin.json`; see `classFeatures.generated.ts`. This module only
 * re-exports it, so the frontend has exactly one definition of the list and it originates
 * in the manifest.
 *
 * The route relationship - which page a flag governs - is frontend knowledge and lives in
 * `featureRoutes.ts`. Guardrail G5 ratchets catalogue files specifically, so the two
 * concerns are separate modules rather than one file that names every flag twice.
 *
 * Why the duplication mattered: the manifest declares each flag with its label, the backend
 * derives everything from the class row, and this file used to repeat all 19 keys and
 * labels by hand. Adding a flag meant editing three places, and missing the third produced
 * a page that 403s with no visible cause.
 */

export {
  classFeatureKeys,
  classFeatureLabels,
  defaultClassFeatures,
  type ClassFeatureKey,
  type ClassFeatures,
} from './classFeatures.generated';

export {
  classFeatureRouteMap,
  getFirstEnabledRoute,
  isFeatureRequirementEnabled,
  parentDefaultRouteOrder,
  parentFeatureRequirements,
  studentDefaultRouteOrder,
  studentFeatureRequirements,
  type FeatureRequirement,
} from './featureRoutes';
