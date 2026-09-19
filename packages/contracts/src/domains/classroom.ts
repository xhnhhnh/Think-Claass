/**
 * classroom domain contracts.
 *
 * Moved from `src/shared/classroom/contracts.ts` in P2 so the backend no longer imports
 * from the frontend source tree. Type-only: see guardrail G6.
 */

export interface StudentDto {
  id: number;
  user_id?: number | null;
  class_id: number;
  group_id?: number | null;
  username?: string;
  name: string;
  total_points: number;
  available_points: number;
  group_name?: string | null;
  last_checkin_date?: string | null;
}

export interface ClassDto {
  id: number;
  name: string;
  teacher_id?: number | null;
  invite_code: string;
  pet_selection_mode?: string;
}

export interface GroupDto {
  id: number;
  name: string;
  class_id?: number;
}

export interface PresetDto {
  id: number;
  label: string;
  amount: number;
  teacher_id?: number | null;
}

export interface PointRecordDto {
  id: number;
  student_id: number;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
  student_name: string;
}

export interface AttendanceDto {
  id: number;
  class_id: number;
  student_id?: number | null;
  status: string;
  record_date?: string | null;
  created_at?: string;
}

export interface LeaveDto {
  id: number;
  student_id: number;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  review_comment?: string | null;
  created_at: string;
}

export interface CreateStudentPayload {
  username: string;
  name: string;
  class_id?: number | string;
}

export interface BatchImportStudentPayload {
  students: Array<{ name: string; username: string }>;
  class_id: number | string;
}

export interface BatchPointsPayload {
  studentIds: number[];
  amount: number;
  reason: string;
}

export interface ClassAnalyticsSummaryDto {
  total_students: number;
  average_points: number;
  max_points: number;
  min_points: number;
  average_exam_score: number;
  assignment_completion_rate: number;
  attendance_rate: number;
  praise_count: number;
  leave_count: number;
}

export interface ClassAnalyticsDto {
  class: ClassDto;
  summary: ClassAnalyticsSummaryDto;
  distributions: Array<{ label: string; value: number }>;
  exam_trend: Array<{ id: number; title: string; exam_date: string | null; average_score: number }>;
  assignment_trend: Array<{
    id: number;
    title: string;
    due_date: string | null;
    total_students: number;
    submitted_students: number;
    completion_rate: number;
  }>;
  top_students: Array<{ id: number; name: string; total_points: number }>;
}

export interface StudentReportDto {
  student: Pick<StudentDto, 'id' | 'class_id' | 'name' | 'total_points'>;
  summary: Record<string, number>;
  records: PointRecordDto[];
  recent_exams: Array<{ title: string; exam_date: string | null; total_score: number; score: number; feedback?: string | null }>;
  assignments: Array<{ title: string; due_date: string | null; status: string; score?: number | null; teacher_feedback?: string | null }>;
  attendance: Record<string, number>;
  praises: Array<{ title: string; message: string; created_at: string }>;
  leaves: LeaveDto[];
}

export interface StudentRadarDto {
  report: {
    studentName: string;
    metrics: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    advice: string[];
  };
}

// ---------------------------------------------------------------------------
// Cross-plugin port.
//
// `classroom` is a foundation-tier plugin: almost every other domain references
// students and classes, so the shape of that access is the most important public
// interface in the system. Plugin code must reach classroom data through this port
// rather than through the tables - guardrail G1 forbids importing another plugin's
// internals, and a `data.reads` declaration grants read access only.
// ---------------------------------------------------------------------------

/** The subset of a student another plugin is allowed to depend on. */
export interface StudentSnapshot {
  id: number;
  classId: number;
  userId: number | null;
  name: string;
  totalPoints: number;
  availablePoints: number;
  /**
   * The student's group within the class, or `null` when ungrouped.
   *
   * Added in P4.3b.3 because collaboration groups team-quest progress by it. It is
   * part of the same `students` row classroom already owns, so exposing it here is
   * cheaper and more honest than a second lookup path.
   */
  groupId: number | null;
}

/** The subset of a class another plugin is allowed to depend on. */
export interface ClassSnapshot {
  id: number;
  name: string;
  teacherId: number | null;
  inviteCode: string;
}

/** One entry of a student's point ledger. */
export interface PointLedgerEntry {
  studentId: number;
  /** Ledger type, e.g. `BANK_DEPOSIT`, `STOCK_BUY`, `ADD_POINTS`. */
  type: string;
  /** Signed amount: negative for a debit. */
  amount: number;
  description: string;
}

/** A stored ledger row, as read back. */
export interface PointLedgerRow {
  id: number;
  studentId: number;
  type: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

/**
 * Why a classroom operation was refused.
 *
 * A port cannot throw the kernel's `ApiError` (that would need a runtime import, and
 * contracts are type-only - guardrail G6), and it should not throw a bespoke error
 * class either, for the same reason. So a refusal is *data*: the port returns it and
 * each caller maps it onto its own HTTP status.
 *
 * `classroom` is the only plugin that knows about students and classes, so it is the
 * only place that can answer these questions at all.
 */
export type ClassroomPortErrorCode =
  | 'student-not-found'
  | 'class-not-found'
  | 'feature-disabled'
  | 'insufficient-credits'
  | 'invalid-amount'
  | 'already-bound';

export interface ClassroomRefusal {
  code: ClassroomPortErrorCode;
  message: string;
}

/**
 * Result of an operation that can be refused.
 *
 * Deliberately not a discriminated union on a boolean literal (`{ok:true}|{ok:false}`).
 * This project compiles with `strict: false`, where TypeScript widens a boolean
 * literal discriminant to `boolean` and union narrowing stops working - verified: even
 * a locally declared `{ ok: true; value: T } | { ok: false; refusal: R }` fails to
 * narrow here. An optional discriminant sidesteps that entirely and narrows on
 * `refusal == null` / `refusal != null` in every strictness mode.
 *
 * Because `strictNullChecks` is off, `refusal` is typed `ClassroomRefusal` rather than
 * `ClassroomRefusal | null`; `undefined` is always assignable to it. Read it as
 * "absent means the operation succeeded".
 */
export interface ClassroomResult<T> {
  value?: T;
  refusal?: ClassroomRefusal;
}

/** A class-scope feature flag map, keyed by the legacy flag name (`enable_shop`). */
export type ClassFeatureSnapshot = Record<string, boolean>;

export interface ClassroomPort {
  getStudentById(studentId: number): Promise<StudentSnapshot | null>;
  /**
   * Resolve a student from the *user* id a request actor carries.
   *
   * `RequestContext.actor` only guarantees `userId` and `role` - the session and the
   * legacy-header bridge never populate `studentId`. A route that is gated per-actor
   * rather than per-student therefore has to look the student up, and `students` is
   * classroom-owned, so the lookup belongs here rather than in the caller.
   */
  getStudentByUserId(userId: number): Promise<StudentSnapshot | null>;
  getClassById(classId: number): Promise<ClassSnapshot | null>;
  /**
   * Resolve an invitation code to the class it belongs to.
   *
   * Registration is the reason this exists: the caller has only the code the student typed, and
   * `invite_code` is classroom's column (UNIQUE since P4.3c.3a). Without this, identity would
   * have to read `classes` to turn a code into an id before it could ask the port anything else.
   */
  findClassByInviteCode(code: string): Promise<ClassSnapshot | null>;
  listClassStudents(classId: number): Promise<StudentSnapshot[]>;
  /**
   * Name-fragment search over classes, excluding one id.
   *
   * `query` matches as a case-insensitive substring (`LIKE %query%`, which SQLite
   * already treats case-insensitively for ASCII); omit it to list without filtering.
   * `excludeClassId` exists because the caller is usually searching for an *opponent*.
   *
   * `limit` defaults to "no limit" for a filtered search and 10 for an unfiltered
   * listing, which is exactly what the pre-migration callers did. Pass an explicit
   * value to override either.
   */
  searchClasses(query: string | undefined, excludeClassId: number, limit?: number): Promise<ClassSnapshot[]>;
  /**
   * The class a student belongs to, or the legacy 404 when the student row is gone.
   *
   * `students` is classroom-owned, so the lookup belongs here rather than in the caller.
   */
  getClassIdByStudentId(studentId: number): Promise<number>;

  // -- the parent <-> student relation --------------------------------------
  //
  // `parent_students` is a join table between two domains' rows: `parent_id` references
  // `users` (identity) and `student_id` references `students` (classroom). Classroom owns it,
  // because every read of it in the product is a classroom read - the parent's class list, the
  // parent dashboard, the class roster - and because `students` is on this side.
  //
  // Identity still *writes* it during registration and *reads* it during parent login, which is
  // why these three operations exist instead of identity touching the table: the assertion that
  // the student belongs to the invited class and the write of `students.user_id` must happen
  // together, and only this plugin can make that true.

  /** The students a parent account is linked to, ordered by student id. */
  listStudentsByParent(parentId: number): Promise<StudentSnapshot[]>;

  /**
   * Link a parent account to a student.
   *
   * Insert-only and idempotent: the table's PRIMARY KEY is `(parent_id, student_id)`, and the
   * pre-migration registration path simply inserted, so a repeat is a no-op rather than a
   * duplicate or an error.
   */
  linkParentToStudent(parentId: number, studentId: number): Promise<void>;

  /**
   * Bind a login account to an existing student row, and store the displayed name.
   *
   * This is the write half of student registration, and it replaces the pre-migration
   * `tx.students.update({ where: { id }, data: { user_id, name } })`. It lives here for two
   * reasons: `students` must keep exactly one writer, and `students.name` is encrypted at rest,
   * so a caller writing it directly would store plaintext and silently drop at-rest encryption
   * for a name the product displays (the same trap `classroom.support.ts` documents).
   *
   * `name` is stored verbatim - the caller passes the value the legacy code passed, including
   * the `name || username` fallback, so an empty name stores `''` exactly as before. It is
   * optional because the pre-migration `update` was called with `name: name || username`, which
   * is `undefined` when a body carries neither; that lands as NULL in the nullable column, and
   * collapsing it to `''` here would be a silent behaviour change.
   *
   * Refuses with `student-not-found` for an unknown id and `already-bound` when the student
   * already has a *different* user, because the pre-migration registration rejected that case
   * with 400 该学生已被绑定 rather than rebinding.
   */
  bindStudentToUser(input: {
    studentId: number;
    userId: number;
    name?: string | null;
  }): Promise<ClassroomResult<StudentSnapshot>>;

  /** Rejects when the student is not in the class; used to authorise requests. */
  assertStudentInClass(studentId: number, classId: number): Promise<void>;
  /** Add or subtract points, emitting `classroom.student.points.changed`. */
  adjustPoints(input: {
    studentId: number;
    delta: number;
    reason: string;
    actorId: number;
  }): Promise<{ totalPoints: number; availablePoints: number }>;

  // -- credit balance -------------------------------------------------------
  // Feature plugins spend and earn a student's *available* points (the spendable
  // half of the balance). They must not write `students.available_points`
  // themselves: `students` is classroom-owned, so a second writer would make that
  // ownership declaration a lie. These two operations are the sanctioned path.

  /**
   * Move a student's available balance by `delta` (negative spends).
   *
   * Refuses with `insufficient-credits` when a debit would take the balance below
   * zero, so a caller cannot overdraw by ignoring a prior read.
   */
  transferStudentCredits(input: {
    studentId: number;
    delta: number;
    reason: string;
    actorId: number;
  }): Promise<ClassroomResult<{ availablePoints: number }>>;

  /**
   * Record a point ledger entry.
   *
   * The ledger is a shared table (points, gacha, marketplace, pet, dungeon, battles,
   * challenge, collaboration, engagement and economy all append to it), so it belongs
   * to no single feature domain. `classroom` owns it because it owns student points.
   */
  recordStudentLedgerEntry(entry: PointLedgerEntry): Promise<void>;

  /**
   * Read a student's recent ledger, newest first.
   *
   * Reading is a separate concern from appending for the same ownership reason: the
   * table belongs to classroom, so a consumer asks rather than queries. `limit`
   * defaults to the whole history.
   */
  listStudentLedger(studentId: number, limit?: number): Promise<PointLedgerRow[]>;

  /**
   * Sum the points a class *earned* (`type = 'ADD_POINTS'`) at or after `since`.
   *
   * Exists because a reader sometimes needs the aggregate rather than the rows, and the
   * aggregate needs the `students` join - which only classroom can do. `since` is
   * compared against the stored `created_at` string, so pass the same
   * `YYYY-MM-DD HH:MM:SS` format the column uses.
   */
  sumClassPointsEarnedSince(classId: number, since: string): Promise<number>;

  // -- feature flags --------------------------------------------------------

  /**
   * Every class-scope flag for one class, in the legacy key space (`enable_shop` -> boolean).
   *
   * This is the *whole-map* read, and it exists because the login response embeds it verbatim:
   * `POST /api/auth/login` answers `classFeatures: { enable_chat_bubble: true, ... }` and the
   * frontend stores that map. `checkClassFeature` cannot serve that call site - it answers one
   * boolean at a time, and calling it 19 times would both multiply queries and publish a
   * different key space (`classroom.enable_shop`).
   *
   * Returns `null` when the class does not exist, because the only pre-migration caller
   * (`auth.service.login`) treated a missing class as "no features" and answered `null`, not an
   * error. The plugin-internal 404 stays internal.
   *
   * Resolution order is the same as the single-key checks: capability assignment first, then
   * the legacy `classes.enable_*` column.
   */
  getClassFeatureSnapshot(classId: number): Promise<ClassFeatureSnapshot | null>;

  /**
   * Check whether the class that owns `student` has `feature` turned on.
   *
   * `feature` is the legacy flag name (`enable_economy`). Resolution order is
   * capability assignment first, then the legacy `classes.enable_*` column - the same
   * semantics the pre-migration `api/utils/classFeatures.ts` implemented, moved behind
   * the plugin boundary so feature plugins never import `api/**`.
   */
  checkStudentFeature(studentId: number, feature: string): Promise<ClassroomResult<true>>;

  /**
   * The class-scoped form of the same check.
   *
   * Needed because four pre-migration call sites hold a class id (a stock belongs to a
   * class) and no student id. Deriving the class from an arbitrary student instead
   * would be both wrong and a query per request.
   */
  checkClassFeature(classId: number, feature: string): Promise<ClassroomResult<true>>;

  /**
   * Check a set of flags and pass if **any** one is on.
   *
   * The pre-migration helper had a "any of" variant (`assertAnyClassFeatureEnabled`)
   * because an interaction wall can be served by more than one feature: the tree-hole
   * surface is enabled by either `enable_tree_hole` or `enable_chat_bubble`, and
   * requiring both would have been wrong. Returning `true` rather than the feature that
   * matched keeps the caller from branching on which flag opened the door.
   */
  checkAnyClassFeature(classId: number, features: string[]): Promise<ClassroomResult<true>>;
}
