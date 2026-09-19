/**
 * slg domain types.
 *
 * The DTOs are re-exported from `@thinkclass/contracts` so the plugin and the frontend
 * share one definition; only what describes this plugin's own tables is declared here.
 *
 * Two details are load-bearing for the HTTP contract, because the repository returns
 * raw rows and the controller passes them straight through:
 *
 *   - `SELECT * FROM territories` rows ARE the response objects: `current_contribution`,
 *     `cost_to_unlock`, `x_pos`, `y_pos` and `status` are read by name in the client;
 *   - `class_resources` is keyed by `class_id` (no `id` column), which is why
 *     `ClassResources` declares `id` as optional.
 *
 * The pre-migration `SlgStudentRow` is gone on purpose: `students.available_points` is
 * classroom-owned and is now read through `classroom.public`.
 */

import type {
  ClassResources,
  CreateTerritoryPayload,
  Territory,
  TerritoryContributionPayload,
  TerritoryStatus,
} from '@thinkclass/contracts/domains/slg';

/** The resource increment `yieldResources` applies to `class_resources`. */
export type TerritoryYield = Omit<ClassResources, 'id' | 'class_id'>;

export interface SlgRepository {
  listTerritories(classId: number): Territory[];
  /** Read-and-insert: both map endpoints create the class resource row on first read. */
  getOrCreateResources(classId: number): ClassResources;
  getTerritory(territoryId: number): Territory | null;
  updateTerritoryContribution(territoryId: number, contribution: number, status: TerritoryStatus): void;
  createTerritory(input: Required<CreateTerritoryPayload>): number;
  listOwnedTerritoryYields(classId: number): Array<Pick<Territory, 'type' | 'level'>>;
  /**
   * Create the resource row if needed and add the yield, in one transaction.
   *
   * The pre-migration `yieldResources` wrapped resource creation and the increment in a
   * single better-sqlite3 transaction; both statements are against this plugin's own
   * tables, so that atomicity is preserved rather than approximated.
   */
  applyYield(classId: number, yieldInput: TerritoryYield): void;
}

export type { ClassResources, CreateTerritoryPayload, Territory, TerritoryContributionPayload, TerritoryStatus };
