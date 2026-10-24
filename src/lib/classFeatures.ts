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

import {
  classFeatureKeys as generatedClassFeatureKeys,
  type ClassFeatureKey as GeneratedClassFeatureKey,
  type ClassFeatures as GeneratedClassFeatures,
} from './classFeatures.generated';

/**
 * Every flag on.
 *
 * The state the teacher console paints *before* it can know a class's real flags: classes still
 * loading, and a failed class or class-features read. Gating on all-`false` hides menu entries the
 * moment the app opens and flickers them back when the answer arrives - the same "unknown is not
 * off" mistake `useResolvedClassFeatures`'s `canDecide` exists to prevent for redirects.
 * `TeacherLayout` passes this set to the shell while the answer is unknown, so an entry can only be
 * hidden by a real "off".
 *
 * A class that genuinely has everything switched off resolves to `defaultClassFeatures`, never to
 * this set.
 */
export const allClassFeatures: GeneratedClassFeatures = Object.fromEntries(
  generatedClassFeatureKeys.map((key: GeneratedClassFeatureKey) => [key, true]),
) as GeneratedClassFeatures;

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
