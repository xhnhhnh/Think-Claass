/**
 * Coverage: every table the pre-migration cascade deleted has exactly one cleanup owner.
 *
 * This is the guardrail the ruling in `docs/migration/admin-cascade-decision.md` promised. The
 * pre-migration `deleteTeacherCascade` deleted from **58 tables**, hard-coded, inside one Prisma
 * transaction - atomic, and invisible to every ownership check the runtime enforces. The mechanism
 * that replaced it (each plugin registers a rule for its own tables, the runtime runs them in one
 * transaction) trades that single hard-coded list for a distributed one - and a distributed list is
 * only safe if something checks that it is *complete*.
 *
 * So this test compares the registry's table set against the list the measurement probe produced
 * (`node scripts/migration/probes/admin-cascade-inventory.mjs`, and its corrected statement counts
 * in the ruling's section 8). One table removed from a rule fails here by name; one table claimed
 * that the cascade never touched fails here too.
 *
 * `operation_logs` is the single deliberate exception: it is kernel-owned storage, so it is not a
 * plugin's rule but `ctx.audit.purgeFor` - called by the admin service inside the same transaction.
 * `tests/plugins/admin-cascade.test.ts` pins that half behaviourally (the seeded log row is gone and
 * the summary row exists).
 *
 * Asserting the *set* rather than "at least" is the point: an extra table would mean a plugin
 * claiming rows it has no business deleting with the account.
 *
 * The one addition since the baseline measurement is the homework domain's six `p_homework_*`
 * tables, which did not exist when the cascade was measured. They are appended to `CASCADE_TABLES`
 * with their own note rather than excluded, because the coverage question ("does every table with
 * account-scoped rows have exactly one owner?") is exactly the question that must still be asked of
 * a brand-new domain.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createKernel, type Kernel } from '@thinkclass/kernel';
import { createPluginHost, type PluginHost } from '@thinkclass/plugin-runtime';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The 58 tables measured from the pre-migration cascade, minus the kernel-owned one.
 *
 * Copied from `scripts/migration/probes/admin-cascade-inventory.mjs` output (which lists the same
 * names alphabetically). Kept as a literal on purpose: a test that re-derived this from the plugins
 * would agree with whatever the plugins happen to say.
 */
const CASCADE_TABLES = [
  'activation_codes',
  'activation_events',
  'assignments',
  'attendance_records',
  'bank_accounts',
  'certificates',
  'challenge_records',
  'class_announcements',
  'class_battles',
  'class_resources',
  'classes',
  'danmaku_messages',
  'dungeon_runs',
  'exams',
  'family_tasks',
  'gacha_pools',
  'leave_requests',
  'lucky_draw_config',
  'messages',
  'notes',
  'paper_answers',
  'paper_items',
  'paper_submissions',
  'papers',
  'parent_activity',
  'parent_students',
  'payment_orders',
  'payment_transactions',
  'peer_reviews',
  'pets',
  'point_presets',
  'praises',
  'question_bank',
  'questions',
  'records',
  'redemption_tickets',
  'rubric_point_scores',
  'rubric_points',
  'shop_items',
  'stocks',
  'student_assignments',
  'student_exams',
  'student_groups',
  'student_pets',
  'student_stocks',
  'student_task_nodes',
  'students',
  'study_plan_items',
  'study_plans',
  'task_nodes',
  'team_quest_progress',
  'team_quests',
  'territories',
  'user_achievements',
  'users',
  'wrong_question_attempts',
  'wrong_questions',
  /*
   * The six homework tables, which the pre-migration cascade never saw because the domain did not
   * exist then. They are listed here rather than exempted from the check for the reason this file
   * exists: the registry is only trustworthy if its table set is compared against a list kept
   * *somewhere else*. Leaving them out would make "every table has exactly one owner" silently
   * false for the newest domain - and these are the tables the check matters most for, because
   * homework rows carry a pupil's work and their photographs, so a missed table is data left behind
   * after an account is erased.
   *
   * Keep sorted; a duplicate or a typo fails the set comparison by name.
   */
  'p_homework_answers',
  'p_homework_assignments',
  'p_homework_photos',
  'p_homework_qa_messages',
  'p_homework_questions',
  'p_homework_submissions',

  /*
   * The AI 智学 domain's three `p_ai_study_*` tables, appended for the same reason as homework's.
   * A practice set reaches an account three ways - the student whose set it is, the teacher who
   * dispatched it, and the class it was dispatched into - so a rule that missed any of them would
   * leave rows naming a deleted user. They are the newest domain and therefore the ones the question
   * "does every account-scoped table have exactly one owner?" most needs to be asked of.
   *
   * Keep sorted; a duplicate or a typo fails the set comparison by name.
   */
  'p_ai_study_answers',
  'p_ai_study_items',
  'p_ai_study_sets',
];

/** `operation_logs` is the kernel's; see the header. */
const KERNEL_OWNED_IN_CASCADE = ['operation_logs'];

let kernel: Kernel;
let host: PluginHost;

beforeAll(async () => {
  kernel = await createKernel({
    inMemoryDatabase: true,
    overrides: { logLevel: 'silent', pluginsEnabled: true, pluginDirs: [], env: 'test' },
    migrations: APP_MIGRATIONS,
    mountPlugins: async (hooks) => {
      host = await createPluginHost({
        ...hooks,
        pluginDirs: [path.join(ROOT, 'plugins')],
        authProvider: { current: null },
      });
      return host;
    },
  });
});

afterAll(async () => {
  await host?.stop();
  await kernel?.shutdown();
});

describe('account-deletion cleanup coverage', () => {
  it('activates every plugin, including the admin plugin that runs the cascade', () => {
    expect(host.rejections).toEqual([]);
    expect(host.active.map((entry) => entry.manifest.id)).toContain('admin');
  });

  it('registers exactly one cleanup rule per table the pre-migration cascade deleted', () => {
    const registered = host.cleanup.tables();

    // One name per failing table, not a count: "57 vs 58" is not an answer anyone can act on.
    expect(CASCADE_TABLES.filter((table) => !registered.includes(table))).toEqual([]);
    expect(registered.filter((table) => !CASCADE_TABLES.includes(table))).toEqual([]);
    expect(registered).toHaveLength(CASCADE_TABLES.length);
  });

  it('keeps the kernel-owned table out of the registry, and says where it is handled', () => {
    // `operation_logs` is kernel storage: the audit sink owns it, so it is purged through
    // `ctx.audit.purgeFor` rather than claimed by a plugin. Asserting the absence pins the boundary -
    // if a plugin ever claims it, the previous test fails *and* this one explains why.
    for (const table of KERNEL_OWNED_IN_CASCADE) {
      expect(host.cleanup.tables()).not.toContain(table);
    }
  });

  it('claims the shared-write table exactly once, by the plugin that owns its lifecycle', () => {
    const claims = host.cleanup.rules().filter((rule) => rule.tables.includes('redemption_tickets'));
    expect(claims.map((rule) => rule.pluginId)).toEqual(['marketplace']);
  });

  it('orders the collaboration rule before the assignments rule it derives ids from', () => {
    // collaboration's `peer_reviews` deletion reads `assignments` to find the assignments of the
    // deleted classes. If the assignments rule ran first, that subquery would return nothing and the
    // peer reviews would survive - the order comes from `peer_reviews.assignment_id -> assignments.id`.
    const order = host.cleanup.executionOrder();
    expect(order.indexOf('collaboration')).toBeLessThan(order.indexOf('assignments'));
    // And the deepest parent last: identity owns `users`, which everything else references.
    expect(order.at(-1)).toBe('identity');
  });
});
