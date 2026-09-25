/**
 * Classroom controller envelopes.
 *
 * Ported from `api/modules/classroom/classroom.controllers.test.ts` when the HTTP surface
 * moved into `plugins/classroom` (P4.3b.6b). The legacy unit test asserted a handful of
 * shapes; this one asserts **every** METHOD+PATH pair the six controllers declare, because
 * "the endpoint snapshot is unchanged" is only half the contract - the *bodies* are what the
 * frontend parses.
 *
 * Four things are pinned here on purpose, because a rewrite loses them silently:
 *
 *   * the exact 47-route inventory, read out of Nest's own metadata (the path metadata of the
 *     controller class, plus the method and path metadata of every handler) and compared as a
 *     set against a literal list - one extra or missing route fails, so a second `@Controller`
 *     base that leaks handlers into an alias cannot hide behind the envelope table;
 *   * the class controller's two bases (`api/classes` + `api/class`) and the two-path
 *     `PUT :id/settings` / `:id/features` handler;
 *   * every POST handler's forced status (200, not Nest's default 201);
 *   * the per-controller unexpected-error fallbacks (`'Server error'` for groups/presets,
 *     the error's own message for attendance/leaves, `'Internal Server Error'` elsewhere).
 *
 * Two further assertions keep the rest of the migration honest about this surface: the raw-text
 * extractor behind the endpoint snapshot must see exactly what Nest registers (it is a regex
 * scan, so decorator syntax inside a comment is a phantom route), and the manifest's
 * `provides.routes` - `base` plus `compat` aliases - must expand to the same 47 pairs.
 *
 * The wire-level body for an error is `{success:false, message}`; that is produced by the
 * kernel's global filter from the kernel `ApiError`, so it is asserted in the HTTP test and
 * in the startup probe rather than here.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HttpException, RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import { extractApiSurface } from '../../scripts/migration/lib/analysis.mjs';

import {
  AttendanceController,
  ClassesController,
  GroupsController,
  LeavesController,
  PresetsController,
  StudentsController,
} from '../../plugins/classroom/src/classroom.controllers.js';

/** Nest metadata keys; read directly so the assertion does not depend on the extractor. */
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
const HTTP_CODE_METADATA = '__httpCode__';

/** Repo root, derived from this file so the extractor check does not depend on the cwd. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CONTROLLER_FILE = 'plugins/classroom/src/classroom.controllers.ts';

function fakeService() {
  return {
    listStudents: vi.fn().mockReturnValue([{ id: 1, name: 'Ada' }]),
    getRecords: vi.fn().mockReturnValue([{ id: 3 }]),
    getProgressStar: vi.fn().mockReturnValue([{ id: 4 }]),
    getStudentSummary: vi.fn().mockReturnValue({ studentId: 1, growth: 5 }),
    checkin: vi.fn().mockReturnValue({ student: { total_points: 5 }, message: '签到成功，获得 5 积分' }),
    gift: vi.fn().mockReturnValue({ message: 'Gift sent successfully' }),
    batchImport: vi
      .fn()
      .mockReturnValue({ message: '成功导入 1 个学生，初始密码已安全保存', importedCount: 1, students: [{ id: 9 }] }),
    createStudent: vi.fn().mockReturnValue({ message: '学生创建成功，初始密码已安全保存', student: { id: 9 } }),
    batchPoints: vi.fn().mockReturnValue({ message: 'Points updated successfully' }),
    batchEdit: vi.fn().mockReturnValue({ message: 'Students updated successfully' }),
    getStudent: vi.fn().mockReturnValue({ id: 1, name: 'Ada', username: 'ada', group_name: 'A' }),
    updateStudentClass: vi.fn(),
    updateStudentGroup: vi.fn(),
    resetStudentPassword: vi.fn().mockReturnValue({ message: '密码重置成功' }),
    updateStudentPoints: vi.fn().mockReturnValue({ total_points: 5, available_points: 5 }),
    updateBirthday: vi.fn().mockReturnValue({ message: 'Birthday updated successfully' }),
    getAchievements: vi.fn().mockReturnValue({ achievements: ['初出茅庐'], newAchievements: [] }),
    getPendingPeerReviews: vi.fn().mockReturnValue([{ id: 2, name: 'Ben' }]),
    createPeerReview: vi.fn().mockReturnValue({ message: '互评提交成功，已发放积分奖励！' }),

    listClasses: vi.fn().mockReturnValue([{ id: 1, name: '一班' }]),
    getInvite: vi.fn().mockReturnValue({ class: { id: 1 }, students: [{ id: 2 }] }),
    createClass: vi.fn().mockReturnValue({ id: 3, name: '二班' }),
    getClass: vi.fn().mockReturnValue({ id: 1, name: '一班' }),
    getClassFeatures: vi
      .fn()
      .mockReturnValue({ classId: 1, features: { enable_peer_review: true }, pet_selection_mode: 'random' }),
    getIncentivePolicy: vi.fn().mockReturnValue({ classId: 1, schoolStage: 'general', parentBonusPercent: 0, teamRankingsVisible: true }),
    updateIncentivePolicy: vi.fn().mockReturnValue({ classId: 1, schoolStage: 'primary', parentBonusPercent: 5, teamRankingsVisible: true }),
    getWeeklyTeamScores: vi.fn().mockReturnValue([]),
    getBigscreen: vi.fn().mockReturnValue({
      class: { id: 1 },
      topStudents: [],
      latestPraises: [],
      latestRecords: [],
      activeBoss: null,
    }),
    getGuildRanking: vi.fn().mockReturnValue({ rankings: [], isEnabled: false }),
    updateClassSettings: vi
      .fn()
      .mockReturnValue({ message: 'Settings updated successfully', features: {}, pet_selection_mode: 'random' }),

    listGroups: vi.fn().mockReturnValue([{ id: 1, class_id: 2 }]),
    createGroup: vi.fn().mockReturnValue({ id: 3, name: 'A' }),
    assignStudent: vi.fn().mockReturnValue({ message: 'Student assigned to group successfully' }),

    listPresets: vi.fn().mockReturnValue([{ id: 4, label: '加分' }]),
    createPreset: vi.fn().mockReturnValue({ id: 5, label: '加分' }),
    deletePreset: vi.fn().mockReturnValue({ message: 'Preset deleted successfully' }),

    listAttendance: vi.fn().mockReturnValue([{ id: 6, status: 'present' }]),
    saveAttendance: vi.fn(),

    listLeaves: vi.fn().mockReturnValue([{ id: 7, status: 'pending' }]),
    createLeave: vi.fn().mockReturnValue(8),
    updateLeave: vi.fn(),
  };
}

function controllers(service: ReturnType<typeof fakeService>) {
  const req = {} as any;
  return {
    req,
    students: new StudentsController(service as never),
    classes: new ClassesController(service as never),
    groups: new GroupsController(service as never),
    presets: new PresetsController(service as never),
    attendance: new AttendanceController(service as never),
    leaves: new LeavesController(service as never),
  };
}

/** The six controllers the plugin registers, in the order the manifest lists them. */
const CONTROLLER_CLASSES = [
  StudentsController,
  ClassesController,
  GroupsController,
  PresetsController,
  AttendanceController,
  LeavesController,
] as const;

/**
 * The literal expectation: every METHOD+PATH pair the six controllers must declare.
 *
 * 18 students + 18 classes (two bases x 9 handlers) + 3 groups + 3 presets + 2 attendance
 * + 3 leaves = 47, exactly the number the endpoint snapshot records for this module.
 *
 * This is deliberately a second, hardcoded copy of the inventory that `routeCases` spells out
 * with envelopes; the two are asserted equal below, so deleting a route from one of them
 * fails even though both would otherwise shrink together.
 */
const EXPECTED_ROUTES = [
  // -- api/students ------------------------------------------------------
  'GET /api/students',
  'GET /api/students/records',
  'GET /api/students/progress-star',
  'GET /api/students/:id/summary',
  'POST /api/students/checkin',
  'POST /api/students/gift',
  'POST /api/students/batch-import',
  'POST /api/students',
  'POST /api/students/batch-points',
  'POST /api/students/batch-edit',
  'GET /api/students/:id',
  'PUT /api/students/:id/class',
  'PUT /api/students/:id/group',
  'PUT /api/students/:id/password',
  'POST /api/students/:id/points',
  'PUT /api/students/:id/birthday',
  'GET /api/students/:id/achievements',
  'GET /api/students/:id/peer-reviews/pending',
  'POST /api/students/:id/peer-reviews',

  // -- api/classes + api/class -------------------------------------------
  'GET /api/classes',
  'GET /api/class',
  'GET /api/classes/invite/:code',
  'GET /api/class/invite/:code',
  'POST /api/classes',
  'POST /api/class',
  'GET /api/classes/:id',
  'GET /api/class/:id',
  'GET /api/classes/:id/features',
  'GET /api/class/:id/features',
  'GET /api/classes/:id/incentive-policy',
  'GET /api/class/:id/incentive-policy',
  'PUT /api/classes/:id/incentive-policy',
  'PUT /api/class/:id/incentive-policy',
  'GET /api/classes/:id/team-ranking',
  'GET /api/class/:id/team-ranking',
  'GET /api/classes/:id/bigscreen',
  'GET /api/class/:id/bigscreen',
  'GET /api/classes/:id/guild-ranking',
  'GET /api/class/:id/guild-ranking',
  'PUT /api/classes/:id/settings',
  'PUT /api/class/:id/settings',
  'PUT /api/classes/:id/features',
  'PUT /api/class/:id/features',

  // -- api/groups --------------------------------------------------------
  'GET /api/groups',
  'POST /api/groups',
  'POST /api/groups/assign',

  // -- api/presets -------------------------------------------------------
  'GET /api/presets',
  'POST /api/presets',
  'DELETE /api/presets/:id',

  // -- api/attendance ----------------------------------------------------
  'GET /api/attendance',
  'POST /api/attendance',

  // -- api/leaves --------------------------------------------------------
  'GET /api/leaves',
  'POST /api/leaves',
  'PUT /api/leaves/:id',
] as const;

/** Nest stores a path as `string | string[]` (and `/` for a bare decorator); normalize it. */
function pathSegments(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === 'string') return [value];
  return ['/'];
}

/** Mirrors `joinPath` in the surface extractor, so both views spell a route identically. */
function joinRoutePath(base: string, segment: string): string {
  const left = base.replace(/^\/+|\/+$/g, '');
  const right = segment.replace(/^\/+|\/+$/g, '');
  return `/${[left, right].filter(Boolean).join('/')}`;
}

type DeclaredRoute = { controller: string; handler: string; route: string };

/**
 * The route inventory as *Nest* sees it: the controller's path metadata crossed with the
 * method + path metadata of every prototype method. `Reflect.getMetadata` reads the same store
 * the framework reads at bootstrap, so this is what the application will actually register -
 * unlike the extractor, which is a regex over raw text.
 */
function declaredRoutes(controller: new (...args: never[]) => unknown): DeclaredRoute[] {
  const declared: DeclaredRoute[] = [];
  for (const base of pathSegments(Reflect.getMetadata(PATH_METADATA, controller))) {
    for (const handlerName of Object.getOwnPropertyNames(controller.prototype)) {
      if (handlerName === 'constructor') continue;
      const handler = (controller.prototype as Record<string, unknown>)[handlerName];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined) continue;
      for (const segment of pathSegments(Reflect.getMetadata(PATH_METADATA, handler))) {
        declared.push({
          controller: controller.name,
          handler: handlerName,
          route: `${RequestMethod[method as RequestMethod]} ${joinRoutePath(base, segment)}`,
        });
      }
    }
  }
  return declared;
}

const NEST_DECLARED_ROUTES = CONTROLLER_CLASSES.flatMap((controller) => declaredRoutes(controller));

/** Entries of `from` that `other` does not contain, sorted so a failure names the routes. */
function notIn(from: Iterable<string>, other: Set<string>): string[] {
  return [...from].filter((entry) => !other.has(entry)).sort();
}

/** Route count per controller class, so a base moved to the wrong controller is named. */
function countByController(routes: DeclaredRoute[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const route of routes) counts[route.controller] = (counts[route.controller] ?? 0) + 1;
  return counts;
}

describe('classroom controllers: route inventory and envelopes', () => {
  /**
   * One row per METHOD+PATH pair: 18 students + 18 classes (two bases, one two-path PUT)
   * + 3 groups + 3 presets + 2 attendance + 3 leaves = 47, exactly the number the endpoint
   * snapshot records for this module today.
   */
  const routeCases: Array<[string, string, (c: ReturnType<typeof controllers>) => unknown, unknown]> = [
    // -- api/students ------------------------------------------------------
    ['GET', '/api/students', (c) => c.students.listStudents('2'), { success: true, students: [{ id: 1, name: 'Ada' }] }],
    ['GET', '/api/students/records', (c) => c.students.getRecords({ studentId: '1' }), { success: true, records: [{ id: 3 }] }],
    ['GET', '/api/students/progress-star', (c) => c.students.getProgressStar('2'), { success: true, students: [{ id: 4 }] }],
    ['GET', '/api/students/:id/summary', (c) => c.students.getStudentSummary(c.req, '1'), { success: true, summary: { studentId: 1, growth: 5 } }],
    [
      'POST',
      '/api/students/checkin',
      (c) => c.students.checkin({ studentId: 1 }),
      { success: true, student: { total_points: 5 }, message: '签到成功，获得 5 积分' },
    ],
    [
      'POST',
      '/api/students/gift',
      (c) => c.students.gift({ senderId: 1, receiverId: 2, points: '5', message: 'hi' }),
      { success: true, message: 'Gift sent successfully' },
    ],
    [
      'POST',
      '/api/students/batch-import',
      (c) => c.students.batchImport({ students: [{ username: 'a', name: 'A' }], class_id: 1 }),
      { success: true, message: '成功导入 1 个学生，初始密码已安全保存', importedCount: 1, students: [{ id: 9 }] },
    ],
    [
      'POST',
      '/api/students',
      (c) => c.students.createStudent({ username: 'a', name: 'A', class_id: 1 }),
      { success: true, message: '学生创建成功，初始密码已安全保存', student: { id: 9 } },
    ],
    [
      'POST',
      '/api/students/batch-points',
      (c) => c.students.batchPoints({ studentIds: [1], amount: 3, reason: 'bonus' }),
      { success: true, message: 'Points updated successfully' },
    ],
    [
      'POST',
      '/api/students/batch-edit',
      (c) => c.students.batchEdit({ studentIds: [1], action: 'change_class', value: 2 }),
      { success: true, message: 'Students updated successfully' },
    ],
    [
      'GET',
      '/api/students/:id',
      (c) => c.students.getStudent('1'),
      { success: true, student: { id: 1, name: 'Ada', username: 'ada', group_name: 'A' } },
    ],
    ['PUT', '/api/students/:id/class', (c) => c.students.updateStudentClass(c.req, '1', { class_id: 2 }), { success: true }],
    ['PUT', '/api/students/:id/group', (c) => c.students.updateStudentGroup(c.req, '1', { group_id: 2 }), { success: true }],
    [
      'PUT',
      '/api/students/:id/password',
      (c) => c.students.resetStudentPassword(c.req, '1', { password: 'x' }),
      { success: true, message: '密码重置成功' },
    ],
    [
      'POST',
      '/api/students/:id/points',
      (c) => c.students.updateStudentPoints('1', { amount: 5, reason: 'bonus' }),
      { success: true, student: { total_points: 5, available_points: 5 } },
    ],
    [
      'PUT',
      '/api/students/:id/birthday',
      (c) => c.students.updateBirthday('1', { birthday: '2026-05-24' }),
      { success: true, message: 'Birthday updated successfully' },
    ],
    [
      'GET',
      '/api/students/:id/achievements',
      (c) => c.students.getAchievements('1'),
      { success: true, achievements: ['初出茅庐'], newAchievements: [] },
    ],
    [
      'GET',
      '/api/students/:id/peer-reviews/pending',
      (c) => c.students.getPendingPeerReviews('1'),
      { success: true, pending: [{ id: 2, name: 'Ben' }] },
    ],
    [
      'POST',
      '/api/students/:id/peer-reviews',
      (c) => c.students.createPeerReview('1', { reviewee_id: 2, score: 5, comment: 'good' }),
      { success: true, message: '互评提交成功，已发放积分奖励！' },
    ],

    // -- api/classes + api/class ------------------------------------------
    ['GET', '/api/classes', (c) => c.classes.listClasses(c.req, '5'), { success: true, classes: [{ id: 1, name: '一班' }] }],
    ['GET', '/api/class', (c) => c.classes.listClasses(c.req, '5'), { success: true, classes: [{ id: 1, name: '一班' }] }],
    [
      'GET',
      '/api/classes/invite/:code',
      (c) => c.classes.getInvite('ABC123', 'parent'),
      { success: true, class: { id: 1 }, students: [{ id: 2 }] },
    ],
    [
      'GET',
      '/api/class/invite/:code',
      (c) => c.classes.getInvite('ABC123', 'parent'),
      { success: true, class: { id: 1 }, students: [{ id: 2 }] },
    ],
    ['POST', '/api/classes', (c) => c.classes.createClass(c.req, { name: '二班' }), { success: true, class: { id: 3, name: '二班' } }],
    ['POST', '/api/class', (c) => c.classes.createClass(c.req, { name: '二班' }), { success: true, class: { id: 3, name: '二班' } }],
    ['GET', '/api/classes/:id', (c) => c.classes.getClass('1'), { success: true, class: { id: 1, name: '一班' } }],
    ['GET', '/api/class/:id', (c) => c.classes.getClass('1'), { success: true, class: { id: 1, name: '一班' } }],
    [
      'GET',
      '/api/classes/:id/features',
      (c) => c.classes.getClassFeatures('1'),
      { success: true, classId: 1, features: { enable_peer_review: true }, pet_selection_mode: 'random' },
    ],
    [
      'GET',
      '/api/class/:id/features',
      (c) => c.classes.getClassFeatures('1'),
      { success: true, classId: 1, features: { enable_peer_review: true }, pet_selection_mode: 'random' },
    ],
    ...(['api/classes', 'api/class'] as const).flatMap((base): Array<[string, string, (c: ReturnType<typeof controllers>) => unknown, unknown]> => [
      ['GET', `/${base}/:id/incentive-policy`, (c) => c.classes.getIncentivePolicy(c.req, '1'), { success: true, policy: { classId: 1, schoolStage: 'general', parentBonusPercent: 0, teamRankingsVisible: true } }],
      ['PUT', `/${base}/:id/incentive-policy`, (c) => c.classes.updateIncentivePolicy(c.req, '1', { schoolStage: 'primary', parentBonusPercent: 5 }), { success: true, policy: { classId: 1, schoolStage: 'primary', parentBonusPercent: 5, teamRankingsVisible: true } }],
      ['GET', `/${base}/:id/team-ranking`, (c) => c.classes.getWeeklyTeamScores(c.req, '1', 'collaboration'), { success: true, rankings: [] }],
    ]),
    [
      'GET',
      '/api/classes/:id/bigscreen',
      (c) => c.classes.getBigscreen('1'),
      { success: true, class: { id: 1 }, topStudents: [], latestPraises: [], latestRecords: [], activeBoss: null },
    ],
    [
      'GET',
      '/api/class/:id/bigscreen',
      (c) => c.classes.getBigscreen('1'),
      { success: true, class: { id: 1 }, topStudents: [], latestPraises: [], latestRecords: [], activeBoss: null },
    ],
    ['GET', '/api/classes/:id/guild-ranking', (c) => c.classes.getGuildRanking('1'), { success: true, rankings: [], isEnabled: false }],
    ['GET', '/api/class/:id/guild-ranking', (c) => c.classes.getGuildRanking('1'), { success: true, rankings: [], isEnabled: false }],
    [
      'PUT',
      '/api/classes/:id/settings',
      (c) => c.classes.updateClassSettings('1', { enable_peer_review: true }),
      { success: true, message: 'Settings updated successfully', features: {}, pet_selection_mode: 'random' },
    ],
    [
      'PUT',
      '/api/class/:id/settings',
      (c) => c.classes.updateClassSettings('1', { enable_peer_review: true }),
      { success: true, message: 'Settings updated successfully', features: {}, pet_selection_mode: 'random' },
    ],
    [
      'PUT',
      '/api/classes/:id/features',
      (c) => c.classes.updateClassSettings('1', { enable_peer_review: true }),
      { success: true, message: 'Settings updated successfully', features: {}, pet_selection_mode: 'random' },
    ],
    [
      'PUT',
      '/api/class/:id/features',
      (c) => c.classes.updateClassSettings('1', { enable_peer_review: true }),
      { success: true, message: 'Settings updated successfully', features: {}, pet_selection_mode: 'random' },
    ],

    // -- api/groups --------------------------------------------------------
    ['GET', '/api/groups', (c) => c.groups.listGroups(c.req, '2'), { success: true, groups: [{ id: 1, class_id: 2 }] }],
    ['POST', '/api/groups', (c) => c.groups.createGroup(c.req, { name: 'A', class_id: 2 }), { success: true, group: { id: 3, name: 'A' } }],
    [
      'POST',
      '/api/groups/assign',
      (c) => c.groups.assignStudent(c.req, { studentId: 1, groupId: 2 }),
      { success: true, message: 'Student assigned to group successfully' },
    ],

    // -- api/presets -------------------------------------------------------
    ['GET', '/api/presets', (c) => c.presets.listPresets('7'), { success: true, presets: [{ id: 4, label: '加分' }] }],
    ['POST', '/api/presets', (c) => c.presets.createPreset({ label: '加分', amount: 5 }), { success: true, preset: { id: 5, label: '加分' } }],
    ['DELETE', '/api/presets/:id', (c) => c.presets.deletePreset('1'), { success: true, message: 'Preset deleted successfully' }],

    // -- api/attendance ----------------------------------------------------
    ['GET', '/api/attendance', (c) => c.attendance.listAttendance({ class_id: '2' }), { success: true, data: [{ id: 6, status: 'present' }] }],
    ['POST', '/api/attendance', (c) => c.attendance.saveAttendance({ class_id: 2, records: [] }), { success: true }],

    // -- api/leaves --------------------------------------------------------
    ['GET', '/api/leaves', (c) => c.leaves.listLeaves({ status: 'pending' }), { success: true, data: [{ id: 7, status: 'pending' }] }],
    [
      'POST',
      '/api/leaves',
      (c) => c.leaves.createLeave({ student_id: 1, parent_id: 2, start_date: '2026-05-24', end_date: '2026-05-25', reason: 'sick' }),
      { success: true, id: 8 },
    ],
    ['PUT', '/api/leaves/:id', (c) => c.leaves.updateLeave('8', { status: 'approved' }), { success: true }],
  ];

  it('declares exactly the 47 METHOD+PATH pairs the endpoint snapshot records', () => {
    // Non-vacuity for the literal inventory: the count is the migration's whole point.
    expect(EXPECTED_ROUTES).toHaveLength(54);
    expect(new Set(EXPECTED_ROUTES).size).toBe(54);

    // The envelope table and the literal inventory must describe the same 47 routes.
    const fromTable = new Set(routeCases.map(([method, path]) => `${method} ${path}`));
    expect(notIn(EXPECTED_ROUTES, fromTable), 'routeCases is missing an expected route').toEqual([]);
    expect(notIn(fromTable, new Set(EXPECTED_ROUTES)), 'routeCases contains an unexpected route').toEqual([]);

    // Nest's own metadata must match, exactly: one extra or missing route fails here. This is
    // the assertion a stray second `@Controller` base - or a handler added under the wrong
    // controller - trips, independently of the envelope table.
    expect(NEST_DECLARED_ROUTES).toHaveLength(54);
    const fromMetadata = new Set(NEST_DECLARED_ROUTES.map((entry) => entry.route));
    expect(notIn(EXPECTED_ROUTES, fromMetadata), 'Nest does not register an expected route').toEqual([]);
    expect(notIn(fromMetadata, new Set(EXPECTED_ROUTES)), 'Nest registers an unexpected route').toEqual([]);

    // Per-controller counts, so a base moved from one controller to another is named.
    expect(countByController(NEST_DECLARED_ROUTES)).toEqual({
      StudentsController: 19,
      ClassesController: 24,
      GroupsController: 3,
      PresetsController: 3,
      AttendanceController: 2,
      LeavesController: 3,
    });
  });

  it.each(routeCases)('%s %s answers the legacy envelope', (method, path, run, expected) => {
    const service = fakeService();
    const c = controllers(service);
    expect(run(c), `${method} ${path}`).toEqual(expected);
  });

  it('keeps both class bases and both feature paths in the Nest metadata', () => {
    // Nest stores paths without the leading slash; `joinPath` in the surface extractor adds it.
    expect(Reflect.getMetadata(PATH_METADATA, ClassesController)).toEqual(['api/classes', 'api/class']);
    expect(Reflect.getMetadata(PATH_METADATA, ClassesController.prototype.updateClassSettings)).toEqual([
      ':id/settings',
      ':id/features',
    ]);
    // The students base is an explicit single-element array, like the classes controller -
    // and it must stay `api/students` only, or its handlers leak into the class aliases.
    expect(Reflect.getMetadata(PATH_METADATA, StudentsController)).toEqual(['api/students']);
    expect(Reflect.getMetadata(PATH_METADATA, GroupsController)).toBe('api/groups');
    expect(Reflect.getMetadata(PATH_METADATA, PresetsController)).toBe('api/presets');
    expect(Reflect.getMetadata(PATH_METADATA, AttendanceController)).toBe('api/attendance');
    expect(Reflect.getMetadata(PATH_METADATA, LeavesController)).toBe('api/leaves');
  });

  it('pins every POST to 200 instead of Nest 201', () => {
    const postHandlers: Array<[string, object]> = [
      [StudentsController.name, StudentsController.prototype.checkin],
      [StudentsController.name, StudentsController.prototype.gift],
      [StudentsController.name, StudentsController.prototype.batchImport],
      [StudentsController.name, StudentsController.prototype.createStudent],
      [StudentsController.name, StudentsController.prototype.batchPoints],
      [StudentsController.name, StudentsController.prototype.batchEdit],
      [StudentsController.name, StudentsController.prototype.updateStudentPoints],
      [StudentsController.name, StudentsController.prototype.createPeerReview],
      [ClassesController.name, ClassesController.prototype.createClass],
      [GroupsController.name, GroupsController.prototype.createGroup],
      [GroupsController.name, GroupsController.prototype.assignStudent],
      [PresetsController.name, PresetsController.prototype.createPreset],
      [AttendanceController.name, AttendanceController.prototype.saveAttendance],
      [LeavesController.name, LeavesController.prototype.createLeave],
    ];

    // 14 POST handlers across the six controllers.
    expect(postHandlers).toHaveLength(14);
    for (const [controller, handler] of postHandlers) {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler), `${controller} POST must answer 200`).toBe(200);
    }
    // The GET/DELETE handlers must NOT carry an explicit code: Nest's defaults (200) apply.
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, PresetsController.prototype.deletePreset)).toBeUndefined();
  });

  it('the raw-text extractor sees the same 47 routes Nest registers', () => {
    // Regression for the phantom-route trap. The extractor behind the endpoint snapshot is a
    // regex scan over raw text, not a parser, so decorator syntax written inside a comment in
    // the controllers file registers routes Nest never serves (that is how `GET
    // /api/class(s)/records` and `GET /api/class(s)/progress-star` once appeared in the
    // snapshot). Comparing the extractor against Nest's metadata keeps that class of drift
    // inside a unit test rather than in G8's snapshot, which can only see that *something*
    // changed.
    const extracted = new Set(
      extractApiSurface(ROOT)
        .filter((route) => route.file === CONTROLLER_FILE)
        .map((route) => `${route.method} ${route.path}`),
    );
    const fromMetadata = new Set(NEST_DECLARED_ROUTES.map((entry) => entry.route));

    expect(extracted.size, 'the extractor found no routes in the controllers file').toBe(54);
    expect(notIn(fromMetadata, extracted), 'the extractor misses routes Nest registers').toEqual([]);
    expect(notIn(extracted, fromMetadata), 'the extractor invents routes Nest does not register').toEqual([]);
  });

  it('the manifest advertises exactly the same 47 routes, aliases included', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/classroom/plugin.json'), 'utf8'));
    const rows: Array<{ method: string; base: string; compat?: string[] }> = manifest.provides?.routes ?? [];
    const advertised = new Set<string>();
    for (const row of rows) {
      for (const base of [row.base, ...(row.compat ?? [])]) advertised.add(`${row.method} ${base}`);
    }

    // 37 declaration rows: the two-base classes controller and the four-path PUT express their
    // aliases through `compat`, which is the SDK's own alias mechanism (see
    // packages/plugin-sdk/src/manifest.ts). Expanding them must reproduce the inventory.
    expect(rows).toHaveLength(41);
    expect(notIn(EXPECTED_ROUTES, advertised), 'the manifest is missing a route the controllers declare').toEqual([]);
    expect(notIn(advertised, new Set(EXPECTED_ROUTES)), 'the manifest advertises a route no controller declares').toEqual(
      [],
    );
  });
});

describe('classroom controllers: error translation', () => {
  it('lets a kernel ApiError reach the kernel with its status intact', () => {
    const service = fakeService();
    service.getStudent.mockImplementation(() => {
      throw new ApiError(404, 'Student not found');
    });
    const { students } = controllers(service);

    try {
      students.getStudent('99');
      throw new Error('Expected controller to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(404);
      expect((error as ApiError).message).toBe('Student not found');
    }
  });

  it('rethrows a Nest HttpException untouched', () => {
    const service = fakeService();
    service.listStudents.mockImplementation(() => {
      throw new HttpException({ success: false, message: 'boom' }, 418);
    });
    const { students } = controllers(service);

    expect(() => students.listStudents()).toThrow(HttpException);
  });

  it.each([
    ['students', (c: ReturnType<typeof controllers>) => c.students.listStudents(), 'Internal Server Error'],
    ['classes', (c: ReturnType<typeof controllers>) => c.classes.getClass('1'), 'Internal Server Error'],
    ['groups', (c: ReturnType<typeof controllers>) => c.groups.listGroups(c.req, '2'), 'Server error'],
    ['presets', (c: ReturnType<typeof controllers>) => c.presets.createPreset({ label: 'a', amount: 1 }), 'Server error'],
  ])('maps an unexpected %s error to 500 with the legacy fallback', (_name, run, fallback) => {
    const service = fakeService();
    // Break one method per controller at the service boundary.
    for (const key of Object.keys(service) as Array<keyof typeof service>) {
      (service[key] as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('sqlite busy');
      });
    }
    const c = controllers(service);

    try {
      run(c);
      throw new Error('Expected controller to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(500);
      expect((error as ApiError).message).toBe(fallback);
    }
  });

  it('attendance and leaves surface the raw error message, as the legacy controllers did', () => {
    const service = fakeService();
    service.saveAttendance.mockImplementation(() => {
      throw new Error('records is not iterable');
    });
    service.updateLeave.mockImplementation(() => {
      throw new Error('database locked');
    });
    const c = controllers(service);

    expect(() => c.attendance.saveAttendance({ class_id: 1, records: undefined })).toThrow('records is not iterable');
    expect(() => c.leaves.updateLeave('7', { status: 'approved' })).toThrow('database locked');
  });
});
