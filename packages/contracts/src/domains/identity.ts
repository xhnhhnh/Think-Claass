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

/** The subset of a `users` row another plugin is allowed to depend on. */
export interface UserSnapshot {
  id: number;
  role: string;
  username: string;
  isActivated: boolean;
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
}
