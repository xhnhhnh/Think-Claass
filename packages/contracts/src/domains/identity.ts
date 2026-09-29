/**
 * identity domain contracts.
 *
 * Identity is the domain that owns `users` and the activation ledger. It is a foundation
 * plugin - the login route, the profile route and the activation flow all live here - and it
 * is the last domain that reaches into `api/**` today (`api/modules/auth/**` and
 * `api/services/activationService.ts`).
 *
 * ## Why the port carries the whole activation, not just a status
 *
 * The pre-migration `activateUser()` (`api/services/activationService.ts`) did four things in
 * one Prisma `$transaction`: find an existing identical event, flip `users.is_activated`,
 * insert `activation_events`, and mark the related payment order paid when there is one. The
 * same call is the last step of *both* activation entry points - the activation-code route
 * here and the payment webhook in `api/modules/platform` - which is exactly the shape a port
 * is for: two domains, one owner, one write path.
 *
 * So `activateUser` is the port method, and the payment side becomes a consumer of it instead
 * of a second writer of `users`/`activation_events`. Splitting it into
 * `markActivated` + `recordActivationEvent` would publish two half-operations and force every
 * caller to re-implement the transaction, which is how the "one writer per table" rule gets
 * quietly broken.
 *
 * Type-only, like every contracts module: guardrail G6.
 */

import type {
  ActivationCodeListItem,
  AdminRole,
  GenerateActivationCodesResult,
  TeacherDetail,
  TeacherListItem,
} from './admin.js';
import type { ClassFeatureFlags } from './auth.js';

/** The subset of a `users` row another plugin is allowed to depend on. */
export interface UserSnapshot {
  id: number;
  role: string;
  username: string;
  isActivated: boolean;
}

/**
 * An audit entry an admin operation wants recorded **in the same transaction** as the change.
 *
 * `operation_logs` is kernel-owned storage, so the write goes through `ctx.audit.record`, and it
 * belongs to the same unit of work as the row it describes: the pre-migration repository wrote both
 * inside one Prisma transaction, and the real-database test that pins the delete cascade records
 * that "the delete and the record of the delete are one unit". Since the `users` write lives in this
 * plugin and the entry travels with the call, the caller passes the entry as data - it names no
 * method of this domain, and the action vocabulary (`ADMIN_CREATE_TEACHER`, ...) stays where it is
 * authored.
 */
export interface AdminAuditEntry {
  action: string;
  detail?: string | null;
  /** Written to `user_id` - the acting administrator. */
  actorId: number | null;
  role: string | null;
  ip: string | null;
}

/** The actor an admin-console session is issued for. */
export interface AdminCredentialActor {
  id: number;
  /** Narrowed to the console's two roles: this method answers `null` for anything else. */
  role: AdminRole;
  username: string;
}

/**
 * The `user` object `POST /api/auth/login` answers with.
 *
 * Structurally the legacy payload: `studentId`/`classId` are what the student-facing clients key
 * their requests on, and the two legacy spellings (`class_id`, `parentId`) are named rather than left
 * to an index signature so that a producer of this shape is checked at the call site.
 */
export interface LoginUserSnapshot {
  id: number;
  role: string;
  username: string;
  name?: string | null;
  studentId?: number | null;
  parentId?: number | null;
  classId?: number | null;
  class_id?: number | null;
  is_activated?: boolean;
}

/** The credential pair a login route (or another surface standing in for one) verifies. */
export interface LoginCredentials {
  username: string;
  password: string;
  /** Narrows the lookup to one role, exactly as the route's body does when it carries a role. */
  role?: string;
}

/** What a successful credential check answers with, minus the session token the route adds. */
export interface LoginResult {
  user: LoginUserSnapshot;
  classFeatures: ClassFeatureFlags | null;
}

/** A teacher row as the account-deletion path needs it. */
export interface TeacherRow {
  id: number;
  username: string;
}

/**
 * A superadmin row preserved across a database reset.
 *
 * The console's "reset the database" flow reads every superadmin, drops everything, re-seeds and
 * writes them back, so the hash travels with the row - it is not re-derivable.
 */
export interface SuperadminSnapshot {
  id: number;
  username: string;
  passwordHash: string;
  isActivated: number;
}

/**
 * One `activation_events` row, as read back.
 *
 * The column names are projected to camelCase here because this is a *port* return value, not
 * an HTTP body - the routes that serialise activation data keep their own response shapes.
 */
export interface ActivationEventRow {
  id: number;
  userId: number;
  source: string;
  activationCode: string | null;
  orderId: number | null;
  remark: string | null;
  createdAt: string;
}

/** Why an activation was refused. Data, not a throw - see `ClassroomRefusal` for the reasoning. */
export type ActivationRefusalCode = 'user-not-found' | 'already-activated';

export interface ActivationRefusal {
  code: ActivationRefusalCode;
  message: string;
}

/**
 * Result of an activation attempt.
 *
 * `value` is the event row that represents the activation; `null` means an identical event
 * already existed (the legacy `activateUser` returned the existing row without writing
 * anything). `refusal` is present when the request could not be honoured at all.
 */
export interface ActivationResult {
  value?: ActivationEventRow;
  refusal?: ActivationRefusal;
}

export interface ActivateUserInput {
  userId: number;
  source: 'activation_code' | 'payment';
  activationCode?: string | null;
  /**
   * The payment order this activation belongs to, when the source is `payment`.
   *
   * It is part of the *dedupe key* (with `userId`, `source` and `activationCode`), which is what
   * the pre-migration query used. Identity does not write `payment_orders` - the payment domain
   * owns that row - so a caller that needs the order flipped marks it paid in its own
   * transaction. The original `activateUser` did both in one transaction; that atomicity is the
   * one behaviour this port deliberately does not reproduce, and the cost of keeping it would be
   * a second writer of a table identity does not own.
   */
  orderId?: number | null;
  remark?: string | null;
}

/**
 * `identity.public` - the port `plugins/identity` publishes.
 *
 * Kept deliberately small: the only cross-domain operation identity owns is activation. Login
 * and profile updates are HTTP concerns of the plugin's own routes and are reached through the
 * routes, not through an import.
 */
export interface IdentityPort {
  /** The user row a session would be issued for, or `null`. */
  getUserById(userId: number): Promise<UserSnapshot | null>;

  /**
   * The lowest-numbered user id for a role, or `null`.
   *
   * Engagement's lucky-draw config is keyed by `teacher_id`, and its routes accept an optional
   * `teacherId`; when it is omitted the pre-migration code ran
   * `SELECT id FROM users WHERE role = 'teacher' LIMIT 1` - choosing an arbitrary teacher. `users`
   * is identity's table, so the lookup belongs here.
   *
   * `ORDER BY id` makes it deterministic, which the original `LIMIT 1` without an ORDER BY was not:
   * for a single-teacher deployment that is invisible, and for a multi-teacher one it turns a
   * query-planner detail into a stated rule.
   */
  getFirstUserIdByRole(role: string): Promise<number | null>;

  /**
   * Verify a username/password pair and build the body `POST /api/auth/login` answers with.
   *
   * This exists for the one surface that logs a user in **without** owning `users`: the WeChat mini
   * program (`plugins/wechat`) binds an openid to an existing account and then has to answer exactly
   * what the credential login answers, or the two clients drift.
   *
   * It is `IdentityService.login` itself rather than a second implementation on purpose - the
   * parent-login activity record, the plaintext-password upgrade and the class-feature resolution
   * are behaviour, not plumbing, and a copy would be a second place to change. Rejects with the same
   * 401-shaped error the route raises (`账号或密码错误，请重试`); it never returns a token, because
   * minting sessions is the caller's step and `ctx.sessions` is available to every plugin.
   */
  loginWithCredentials(credentials: LoginCredentials): Promise<LoginResult>;

  /**
   * The same body, for an account that has already been authenticated by other means.
   *
   * The WeChat mini program's silent re-login is the caller: it holds an openid it has verified
   * against its own binding table, so there is no password to check, but the client still has to
   * receive the payload the web login returns. `null` means the account no longer exists - the
   * caller must treat that as "the binding is stale", not as a server fault.
   *
   * It grants nothing on its own: `plugins/wechat` is the only consumer, and it has already
   * established the account before calling. Issuing a session is a separate step, because
   * `ctx.sessions` is available to every plugin without going through this port.
   */
  getLoginPayload(userId: number): Promise<LoginResult | null>;

  /**
   * Activate a user, idempotently.
   *
   * Returns the existing event row when one with the same `(userId, source, activationCode,
   * orderId)` already exists, so a retried webhook or a double-clicked activation does not
   * write a second event - the behaviour the pre-migration service had, and the reason its
   * dedupe query is part of this contract rather than an implementation detail.
   *
   * **Idempotency is also the payment retry contract.** The pre-migration
   * `activationService.activateUser` wrote the event and flipped `payment_orders.status` inside
   * one transaction, and `paymentService.markOrderPaid` short-circuited when the order was
   * already `PAID`. That combination had a hole: if the process died between the two writes, a
   * retry returned the existing event and the order stayed unpaid forever. Since this port does
   * not touch `payment_orders` at all (the payment domain owns that table), the caller can order
   * the writes the other way round - activate here first, then mark the order paid - so a retry
   * re-enters, gets the same event back, and still completes the order update. See
   * `plugins/payment` for the call site.
   */
  activateUser(input: ActivateUserInput): Promise<ActivationResult>;

  // ---------------------------------------------------------------------------
  // The admin console's view of this domain
  //
  // `api/modules/admin` used to reach `users`, `activation_codes` and `activation_events` through
  // Prisma: it created and updated teachers, listed and generated activation codes, and preserved
  // superadmins across a database reset. Those are operations on *identity's* tables, so the console
  // consumes them here rather than becoming a second writer. The DTOs come from
  // `domains/admin.ts`, which describes what the admin console renders - the port is where that
  // meets the table's owner.
  // ---------------------------------------------------------------------------

  /**
   * Verify a username/password pair that must hold an admin or superadmin role.
   *
   * Returns the actor shape `/api/admin/session` needs, or `null` - the same "no such user, wrong
   * role or wrong password" answer the console got before, which deliberately does not tell the
   * caller which of the three it was.
   *
   * The pre-migration implementation also *upgraded* a legacy plaintext password to a hash on a
   * successful login (`isPasswordHash` check). That write stays with the table's owner.
   */
  verifyAdminCredentials(username: string, password: string): Promise<AdminCredentialActor | null>;

  /** Teachers in id order - the console's user table. */
  listTeachers(): Promise<TeacherListItem[]>;

  /**
   * Create a teacher account. `audit` is recorded inside the same transaction as the insert.
   *
   * Rejects with a 400-shaped error when the username is taken (the pre-migration code translated
   * Prisma's P2002 into `用户名已存在`; the translation now happens next to the constraint).
   */
  createTeacher(input: { username: string; password: string }, audit?: AdminAuditEntry): Promise<TeacherDetail>;

  /** Update a teacher's username and, when given, their password. 404-shaped when it is not a teacher. */
  updateTeacher(
    id: number,
    input: { username: string; password?: string },
    audit?: AdminAuditEntry,
  ): Promise<TeacherDetail>;

  /** The teacher row a deletion is about, or `null` when the id is not a teacher's. */
  findTeacher(id: number): Promise<TeacherRow | null>;

  /** Every activation code with its used-by username and the newest activation event, newest first. */
  listActivationCodes(): Promise<ActivationCodeListItem[]>;

  /** Generate `count` codes; `audit` shares the transaction with the inserts. */
  generateActivationCodes(
    input: { count: number },
    audit?: AdminAuditEntry,
  ): Promise<GenerateActivationCodesResult>;

  /** Superadmins, for the reset flow to preserve. */
  listSuperadmins(): Promise<SuperadminSnapshot[]>;

  /** Replace the superadmin rows with this snapshot (the reset flow writes back what it read). */
  restoreSuperadmins(superadmins: SuperadminSnapshot[]): Promise<void>;
}
