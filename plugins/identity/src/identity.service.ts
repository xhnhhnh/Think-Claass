/**
 * Identity service.
 *
 * Behaviour is relocated from `api/modules/auth/auth.service.ts` (login / updateProfile /
 * register / activate) and `api/services/activationService.ts` (`activateUser`) unchanged: the
 * same guards in the same order, the same messages, the same response shapes - including the two
 * spellings of the class id and the login-time password upgrade, both of which the frontend and
 * the existing rows depend on.
 *
 * Three things are *not* unchanged, and each is a boundary decision rather than a translation:
 *
 *  1. **`users` is this plugin's table now.** The legacy service reached it through Prisma; here
 *     it is `ctx.db`, so the ownership check applies to the domain's own storage.
 *  2. **`students` / `classes` / `parent_students` go through `classroom.public`.** That is why
 *     `students.name` can be written at all: it is encrypted at rest, and the classroom port
 *     encrypts it (`bindStudentToUser`). The legacy code wrote it through Prisma, which for a
 *     plaintext `name` would have stored it unencrypted - the port closes that.
 *  3. **`parent_activity` goes through `parent_buff.public`.** The legacy code wrote that table
 *     directly, making identity a second writer of a table `plugins/parent-buff` owns. The port
 *     is resolved lazily and treated as optional: parent-buff is a `feature` plugin and may be
 *     disabled, and a disabled blessing feature must not stop a parent from logging in.
 *
 * `allow_teacher_registration` comes from `ctx.settings.getPlatform`, the read-only kernel
 * settings accessor. Before it existed, a plugin had no way to read a platform policy value at
 * all, which is why the legacy service read it through Prisma.
 */

import { randomBytes } from 'node:crypto';

import { ApiError, hashPassword, isPasswordHash, verifyPassword } from '@thinkclass/kernel';
import type {
  ActivationCodeListItem,
  GenerateActivationCodesResult,
  TeacherDetail,
  TeacherListItem,
} from '@thinkclass/contracts/domains/admin';
import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import type {
  ActivationEventRow as PortActivationEvent,
  ActivationResult,
  AdminAuditEntry,
  AdminCredentialActor,
  IdentityPort,
  SuperadminSnapshot,
  TeacherRow,
} from '@thinkclass/contracts/domains/identity';
import type { ParentActivityRecorder } from '@thinkclass/contracts/domains/parent-buff';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type {
  ActivationCodeListRow,
  ActivationEventSummaryRow,
  IdentityRepository,
  TeacherRowDetail,
} from './identity.repository.js';
import type { ActivationEventRow, LoginUserPayload, RequestActor, UserRow } from './identity.types.js';

/** Resolved at call time, never captured in `setup()` - see HANDOFF section 9 (P4.3b.6a). */
export type PortResolver<T> = () => T | null;

export interface IdentityServiceDeps {
  ctx: KernelContext;
  repository: IdentityRepository;
  classroom: ClassroomPort;
  /**
   * Optional: parent-buff may be disabled. A function, not a resolved value, because plugins
   * `setup()` in slug order and `identity` sorts before `parent-buff` - capturing the
   * registry entry in `setup()` would freeze it as `null`.
   */
  parentBuff: PortResolver<ParentActivityRecorder>;
}

/** The pre-migration `decrypt(student.name)`, injected by the host. */
function decryptName(ctx: KernelContext, value: string): string {
  return ctx.config.decryptName ? ctx.config.decryptName(value) : value;
}

export class IdentityService {
  private readonly ctx: KernelContext;
  private readonly repository: IdentityRepository;
  private readonly classroom: ClassroomPort;
  private readonly parentBuff: PortResolver<ParentActivityRecorder>;

  constructor(deps: IdentityServiceDeps) {
    this.ctx = deps.ctx;
    this.repository = deps.repository;
    this.classroom = deps.classroom;
    this.parentBuff = deps.parentBuff;
  }

  // -- login ---------------------------------------------------------------

  /**
   * Authenticate and build the response the frontend already expects.
   *
   * The `classFeatures` map is the whole `enable_*` snapshot, keyed exactly as the legacy
   * `getClassFeaturesByClassId` returned it. `null` when the account has no class, which is what
   * the legacy code answered too.
   */
  async login(body: Record<string, any>) {
    const { username, password, role } = body ?? {};
    const user = this.repository.findUserByCredentials(String(username), String(role));

    if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
      throw new ApiError(401, '账号或密码错误，请重试');
    }

    // Legacy rows hold plaintext (`api/utils/password.ts` fell back to a direct comparison).
    // Upgrading on the first successful login is the behaviour the pre-migration service had,
    // and the reason `verifyPassword` still has a plaintext branch at all.
    if (!isPasswordHash(user.password_hash)) {
      this.repository.updateUserPasswordHash(user.id, hashPassword(String(password)));
    }

    if (role === 'student') {
      const student = await this.classroom.getStudentByUserId(user.id);
      const cls = student ? await this.classroom.getClassById(student.classId) : null;
      const features = student ? await this.classroom.getClassFeatureSnapshot(student.classId) : null;

      const payload: LoginUserPayload = {
        id: user.id,
        role: user.role,
        username: user.username,
        studentId: student?.id,
        classId: student?.classId ?? undefined,
        // Both spellings on purpose: the legacy response carried both and the client reads both.
        class_id: student?.classId ?? undefined,
        name: student ? decryptName(this.ctx, student.name) : undefined,
        is_activated: !!user.is_activated,
      };

      return { success: true, user: payload, classFeatures: cls ? features : null };
    }

    if (role === 'parent') {
      const students = await this.classroom.listStudentsByParent(user.id);
      const student = students[0];
      const cls = student ? await this.classroom.getClassById(student.classId) : null;
      const features = student ? await this.classroom.getClassFeatureSnapshot(student.classId) : null;

      if (student) {
        // The activity row belongs to parent-buff. Optional port: a disabled blessing feature
        // must not stop a parent logging in.
        const recorder = this.parentBuff();
        if (recorder) {
          await recorder.touchParentLogin(user.id, student.id, new Date().toISOString().split('T')[0]);
        } else {
          this.ctx.log.warn('parent login activity not recorded: parent-buff.public unavailable', {
            userId: user.id,
          });
        }
      }

      const payload: LoginUserPayload = {
        id: user.id,
        parentId: user.id,
        role: user.role,
        username: user.username,
        studentId: student?.id,
        classId: student?.classId ?? undefined,
        class_id: student?.classId ?? undefined,
        name: student ? decryptName(this.ctx, student.name) : undefined,
        is_activated: !!user.is_activated,
      };

      return { success: true, user: payload, classFeatures: cls ? features : null };
    }

    return {
      success: true,
      user: {
        id: user.id,
        role: user.role,
        username: user.username,
        is_activated: !!user.is_activated,
      },
    };
  }

  // -- profile -------------------------------------------------------------

  async updateProfile(actor: RequestActor, body: Record<string, any>) {
    if (!actor.id || !actor.role) {
      throw new ApiError(403, '无权限执行该操作');
    }

    const username = String(body?.username ?? '').trim();
    const password = typeof body?.password === 'string' ? body.password.trim() : '';
    if (!username) {
      throw new ApiError(400, '用户名不能为空');
    }

    const currentUser = this.repository.findUserById(actor.id);
    if (!currentUser || currentUser.role !== actor.role) {
      throw new ApiError(403, '无权限执行该操作');
    }

    if (this.repository.findUserByUsernameOtherThan(username, actor.id)) {
      throw new ApiError(400, '用户名已存在');
    }

    this.repository.updateUsernameAndPassword(actor.id, username, password ? hashPassword(password) : null);

    const updated = this.repository.findUserById(actor.id) as UserRow;
    return {
      success: true,
      user: {
        id: updated.id,
        role: updated.role,
        username: updated.username,
        is_activated: !!updated.is_activated,
      },
      message: '个人信息已更新',
    };
  }

  // -- register ------------------------------------------------------------

  async register(body: Record<string, any>) {
    const { username, password, role, name, invite_code, student_id } = body ?? {};

    if (role === 'student' || role === 'parent') {
      if (!invite_code) {
        throw new ApiError(400, '注册需要班级邀请码');
      }
      if (!student_id) {
        throw new ApiError(400, '请选择绑定的学生信息');
      }

      const cls = await this.classroom.findClassByInviteCode(String(invite_code));
      if (!cls) {
        throw new ApiError(400, '无效的班级邀请码');
      }

      const student = await this.classroom.getStudentById(Number(student_id));
      if (!student || student.classId !== cls.id) {
        throw new ApiError(400, '未找到该学生记录');
      }
      if (role === 'student' && student.userId) {
        throw new ApiError(400, '该学生已被绑定');
      }
    } else if (role === 'teacher') {
      const setting = this.ctx.settings.getPlatform<string>('allow_teacher_registration');
      if (setting === '0') {
        throw new ApiError(403, '系统暂未开放教师注册');
      }
    }

    // `users.username` is UNIQUE across *all* roles, while the pre-migration login looked a user
    // up by `(username, role)`. So a same-role duplicate is the friendly 400 the old code
    // produced, and a cross-role duplicate is the raw unique-violation Prisma reported as P2002 -
    // both mapped to 400 用户名已存在, which is what the legacy catch did.
    if (this.repository.findUserByUsername(String(username))) {
      throw new ApiError(400, '用户名已存在');
    }

    let userId: number;
    try {
      userId = this.repository.createUser({
        role: String(role),
        username: String(username),
        passwordHash: hashPassword(String(password ?? '')),
      });
    } catch (error) {
      if (String((error as { code?: string }).code ?? '').startsWith('SQLITE_CONSTRAINT')) {
        throw new ApiError(400, '用户名已存在');
      }
      throw error;
    }

    if (role === 'student') {
      const bound = await this.classroom.bindStudentToUser({
        studentId: Number(student_id),
        userId,
        // The legacy update passed `name || username`, so an empty body name became the
        // username - and a body carrying neither passed `undefined`.
        name: name || username,
      });
      if (bound.refusal) {
        throw new ApiError(400, bound.refusal.message);
      }
    } else if (role === 'parent') {
      await this.classroom.linkParentToStudent(userId, Number(student_id));
    }

    return { success: true };
  }

  // -- activate ------------------------------------------------------------

  async activate(body: Record<string, any>) {
    const { code, userId } = body ?? {};
    if (!code || !userId) {
      throw new ApiError(400, '激活码或用户ID缺失');
    }

    const activationCode = this.repository.findActivationCode(String(code));
    if (!activationCode) {
      throw new ApiError(400, '无效的激活码');
    }
    if (activationCode.status === 'used') {
      throw new ApiError(400, '该激活码已被使用');
    }

    this.repository.claimActivationCode(activationCode.id, Number(userId), new Date().toISOString());

    const result = await this.activateUser({
      userId: Number(userId),
      source: 'activation_code',
      activationCode: String(code),
      remark: '通过激活码完成开通',
    });
    if (result.refusal) {
      throw new ApiError(result.refusal.code === 'user-not-found' ? 404 : 409, result.refusal.message);
    }

    return { success: true, message: '激活成功' };
  }

  // -- the published port --------------------------------------------------

  /**
   * The `identity.public.activateUser` implementation.
   *
   * Idempotent by the pre-migration dedupe key: an identical event short-circuits, which is what
   * makes a retried payment webhook safe. `null` cannot happen for a user row that exists, so a
   * missing user is reported as a refusal rather than a crash.
   */
  async activateUser(input: {
    userId: number;
    source: 'activation_code' | 'payment';
    activationCode?: string | null;
    orderId?: number | null;
    remark?: string | null;
  }): Promise<ActivationResult> {
    const userId = Number(input.userId);
    if (!this.repository.findUserById(userId)) {
      return { refusal: { code: 'user-not-found', message: '用户不存在' } };
    }

    const activationCode = input.activationCode ?? null;
    const orderId = input.orderId ?? null;

    const existing = this.repository.findActivationEvent({
      userId,
      source: input.source,
      activationCode,
      orderId,
    });
    if (existing) {
      return { value: toPortEvent(existing) };
    }

    const created = this.repository.applyActivation({
      userId,
      source: input.source,
      activationCode,
      orderId,
      remark: input.remark ?? null,
    });

    return { value: toPortEvent(created) };
  }

  /**
   * Verify a username/password pair for the kernel's own login route.
   *
   * `POST /api/kernel/auth/login` lives in the kernel router and needs an `AuthProvider`; the
   * kernel cannot import a plugin, so the plugin registers this through `ctx.auth.registerProvider`.
   * It replaces `api/modules/auth/legacyAuthProvider.ts`, whose `authenticate` mapped a failed
   * login to `null` rather than letting a 401 escape - the port models failure as absence and the
   * kernel decides the HTTP shape. That mapping is preserved.
   *
   * Deliberately credential-only: no classroom lookup, no activation check. The route's job is to
   * turn credentials into a session, and an `AuthProvider` that needed a port would make the
   * kernel's login depend on plugin setup order.
   */
  authenticate(username: unknown, password: unknown, role: unknown) {
    const user = this.repository.findUserByCredentials(String(username), String(role ?? ''));
    if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
      return null;
    }

    if (!isPasswordHash(user.password_hash)) {
      this.repository.updateUserPasswordHash(user.id, hashPassword(String(password)));
    }

    return { userId: user.id, role: user.role };
  }

  /** The port's `getUserById`: a read, so the shape is a snapshot rather than a row. */
  async getUserById(userId: number) {
    const user = this.repository.findUserById(userId);
    if (!user) return null;
    return {
      id: user.id,
      role: user.role,
      username: user.username,
      isActivated: !!user.is_activated,
    };
  }

  /**
   * The lowest-numbered user id for a role, or `null`.
   *
   * `ORDER BY id` where the pre-migration code had a bare `LIMIT 1`: identical when there is one
   * candidate, and a stated rule instead of a planner detail when there are several.
   */
  async getFirstUserIdByRole(role: string) {
    return this.repository.findFirstUserIdByRole(role)?.id ?? null;
  }

  // -- the admin console's view (P4.3b.14) ---------------------------------
  //
  // Ported from the Prisma calls in `api/modules/admin/admin.repository.ts`, statement by
  // statement; every method cites the lines it reproduces. The admin console used to be a second
  // writer of `users`, `activation_codes` and `activation_events`; these nine operations are what
  // replaces that, so the semantics are the pre-migration ones down to the error messages.
  //
  // Auditing travels with the call as data (`AdminAuditEntry`): `operation_logs` is kernel-owned,
  // so the write goes through `ctx.audit.record`, which runs on the same connection as `ctx.db` -
  // called inside a `tx()` it is part of that unit of work, which is what makes "the change and the
  // record of the change are one" true here as it was inside the Prisma transaction.

  /**
   * `admin.repository.ts:598-632`.
   *
   * The three refusals - no such user, wrong role, wrong password - are one `null`, deliberately:
   * the console must not learn which of the three it hit. A successful check with a legacy
   * plaintext hash upgrades it in place, the same write-time migration the login route does.
   */
  async verifyAdminCredentials(username: string, password: string): Promise<AdminCredentialActor | null> {
    const user = this.repository.findAdminByCredentials(String(username));
    if (
      !user ||
      (user.role !== 'admin' && user.role !== 'superadmin') ||
      !verifyPassword(String(password ?? ''), user.password_hash)
    ) {
      return null;
    }

    if (!isPasswordHash(user.password_hash)) {
      this.repository.updateUserPasswordHash(user.id, hashPassword(String(password)));
    }

    return { id: user.id, role: user.role, username: user.username };
  }

  /** `admin.repository.ts:701-713`. */
  async listTeachers(): Promise<TeacherListItem[]> {
    return this.repository.listTeacherRows().map(toTeacherDetail);
  }

  /**
   * `admin.repository.ts:715-748`.
   *
   * The insert, the row read back and the audit entry share one transaction. A UNIQUE violation on
   * `users.username` becomes the friendly 400 the console used to get from Prisma's P2002 branch -
   * the translation now happens next to the constraint instead of in a driver error code.
   */
  async createTeacher(
    input: { username: string; password: string },
    audit?: AdminAuditEntry,
  ): Promise<TeacherDetail> {
    try {
      return this.repository.tx(() => {
        const id = this.repository.insertTeacher({
          username: input.username,
          passwordHash: hashPassword(input.password ?? ''),
        });
        const row = this.repository.findTeacherRow(id) as TeacherRowDetail;

        if (audit) {
          // `logAdminMutation` composed `{ teacherId, username }` (`:732-738`) - but the caller owns
          // the action vocabulary and the detail format, so a supplied detail wins and this is only
          // the fallback that keeps the legacy entry when the caller passes none.
          this.recordAudit(audit, JSON.stringify({ teacherId: row.id, username: row.username }));
        }

        return toTeacherDetail(row);
      });
    } catch (error) {
      throw mapTeacherUsernameConflict(error);
    }
  }

  /**
   * `admin.repository.ts:750-791`.
   *
   * The existence check, the update, the read-back and the audit entry are one transaction, and a
   * missing teacher is the same 404 `教师不存在`. The password is optional: `null` leaves the stored
   * hash untouched, exactly as the pre-migration spread did.
   */
  async updateTeacher(
    id: number,
    input: { username: string; password?: string },
    audit?: AdminAuditEntry,
  ): Promise<TeacherDetail> {
    try {
      return this.repository.tx(() => {
        if (!this.repository.findTeacherRow(id)) {
          throw new ApiError(404, '教师不存在');
        }

        this.repository.updateTeacherRow(id, {
          username: input.username,
          passwordHash: input.password ? hashPassword(input.password) : null,
        });
        const row = this.repository.findTeacherRow(id) as TeacherRowDetail;

        if (audit) {
          // The legacy detail carried `passwordUpdated` (`:775-781`); the port knows the flag, so it
          // composes that fallback - a supplied detail still wins.
          this.recordAudit(
            audit,
            JSON.stringify({
              teacherId: row.id,
              username: row.username,
              passwordUpdated: Boolean(input.password),
            }),
          );
        }

        return toTeacherDetail(row);
      });
    } catch (error) {
      throw mapTeacherUsernameConflict(error);
    }
  }

  /** The `users` row a deletion is about - `admin.repository.ts:189-195` narrowed to identity's columns. */
  async findTeacher(id: number): Promise<TeacherRow | null> {
    const row = this.repository.findTeacherRow(id);
    return row ? { id: row.id, username: row.username } : null;
  }

  /**
   * `admin.repository.ts:797-819`, which is the code list (`:798-815`) plus the newest event per
   * code (`:120-154`).
   *
   * `createdAt` / `usedAt` are passed through as SQLite returned them (`YYYY-MM-DD HH:MM:SS`): the
   * pre-migration `toIsoString` (`:39-43`) only converted `Date` objects, and those only existed
   * because Prisma parsed the column - the strings travelled unchanged, so they still do.
   */
  async listActivationCodes(): Promise<ActivationCodeListItem[]> {
    const rows = this.repository.listActivationCodeRows();
    const events = newestEventByCode(this.repository.findActivationEventSummaries(rows.map((row) => row.code)));
    return rows.map((row) => toActivationCodeListItem(row, events.get(row.code)));
  }

  /**
   * `admin.repository.ts:821-874` plus `:156-181`.
   *
   * The whole generation is one transaction: uniqueness against the table, the inserts, the audit
   * entry and the read-back. `count` codes are minted per call, so the returned list is the codes
   * this call created - not a re-read of the table.
   */
  async generateActivationCodes(
    input: { count: number },
    audit?: AdminAuditEntry,
  ): Promise<GenerateActivationCodesResult> {
    return this.repository.tx(() => {
      const codes = this.uniqueActivationCodes(input.count);
      for (const code of codes) this.repository.insertActivationCode(code);

      if (audit) {
        // The caller cannot compose this detail - the codes are minted here - so the legacy
        // `{ count, codes }` (`:838-844`) is the fallback, and a supplied detail still wins.
        this.recordAudit(audit, JSON.stringify({ count: input.count, codes }));
      }

      const persisted = this.repository.listActivationCodeRowsByCodes(codes);
      const events = newestEventByCode(this.repository.findActivationEventSummaries(codes));

      return {
        message: `成功生成 ${codes.length} 个激活码`,
        createdCount: codes.length,
        codes: persisted.map((row) => toActivationCodeListItem(row, events.get(row.code))),
      };
    });
  }

  /** `admin.repository.ts:1009-1027`. */
  async listSuperadmins(): Promise<SuperadminSnapshot[]> {
    return this.repository.listSuperadminRows().map((row) => ({
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      isActivated: row.is_activated ?? 0,
    }));
  }

  /**
   * `admin.repository.ts:1029-1045`.
   *
   * Delete-then-insert in one transaction (the original issued the two statements back to back
   * without one, so this is the same observable result with the crash window closed), and each row
   * keeps its explicit id: the reset flow restores the accounts it read, and other tables already
   * reference those ids.
   */
  async restoreSuperadmins(superadmins: SuperadminSnapshot[]): Promise<void> {
    this.repository.tx(() => {
      this.repository.deleteSuperadmins();
      for (const row of superadmins) {
        this.repository.insertSuperadmin({
          id: row.id,
          username: row.username,
          password_hash: row.passwordHash,
          is_activated: row.isActivated,
        });
      }
    });
  }

  /**
   * `count` codes of the pre-migration shape (`TC-` + 8 uppercase hex), unique both within this
   * batch and against the table (`admin.repository.ts:156-181`).
   */
  private uniqueActivationCodes(count: number): string[] {
    const codes: string[] = [];
    const generated = new Set<string>();

    while (codes.length < count) {
      const candidate = `TC-${randomBytes(4).toString('hex').toUpperCase()}`;

      if (generated.has(candidate)) continue;
      if (this.repository.findActivationCode(candidate)) continue;

      generated.add(candidate);
      codes.push(candidate);
    }

    return codes;
  }

  /**
   * Record one admin mutation through the kernel's audit log.
   *
   * `teacherId: null` is load-bearing: the pre-migration `logAdminMutation`
   * (`admin.repository.ts:101-118`) wrote the acting administrator to `user_id` and left
   * `teacher_id` null. Letting `ctx.audit` default `teacherId` to `actorId` would attribute every
   * console action to the acting superadmin's teacher column as well.
   */
  private recordAudit(entry: AdminAuditEntry, fallbackDetail: string): void {
    this.ctx.audit.record({
      action: entry.action,
      detail: entry.detail ?? fallbackDetail,
      actorId: entry.actorId,
      teacherId: null,
      role: entry.role,
      ip: entry.ip,
    });
  }

  /**
   * Mint a session for a successful login.
   *
   * The TTL and the recorder fields are the ones the legacy controller passed
   * (`kernel.config.sessionTtlMs`, `req.header('user-agent')`, `req.ip`), and `ctx.sessions` is the
   * same service the request middleware verifies against - which is what makes the token usable on
   * the very next request.
   */
  issueSession(input: { userId: number; role: string; userAgent: string | null; ip: string | null }) {
    return this.ctx.sessions.issue({
      userId: input.userId,
      role: input.role as never,
      ttlMs: this.ctx.config.sessionTtlMs,
      userAgent: input.userAgent,
      ip: input.ip,
    });
  }
}

/** `activation_events` row -> the port's camelCase projection. */
function toPortEvent(row: ActivationEventRow): PortActivationEvent {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    activationCode: row.activation_code ?? null,
    orderId: row.order_id ?? null,
    remark: row.remark ?? null,
    createdAt: String(row.created_at),
  };
}

/** `users` row -> the console's teacher projection (`admin.repository.ts:49-56`). */
function toTeacherDetail(row: TeacherRowDetail): TeacherDetail {
  return {
    id: row.id,
    username: row.username,
    role: 'teacher',
    isActivated: Boolean(row.is_activated),
  };
}

/**
 * `activation_codes` row + its newest event -> the console's list item
 * (`admin.repository.ts:74-99`). `status ?? 'unused'` covers a legacy row whose column is NULL.
 */
function toActivationCodeListItem(
  row: ActivationCodeListRow,
  event: ActivationEventSummaryRow | undefined,
): ActivationCodeListItem {
  return {
    id: row.id,
    code: row.code,
    status: row.status ?? 'unused',
    usedByUserId: row.used_by ?? null,
    usedByUsername: row.used_by_username ?? null,
    createdAt: row.created_at ?? null,
    usedAt: row.used_at ?? null,
    activationSource: event?.source ?? null,
    activationRemark: event?.remark ?? null,
  };
}

/**
 * First row per code wins, which is the "newest" row because the query was ordered
 * `created_at DESC` (`admin.repository.ts:142-151`). Keeping the fold here rather than in SQL is
 * what makes "the newest event" a stated rule instead of a window-function detail.
 */
function newestEventByCode(rows: ActivationEventSummaryRow[]): Map<string, ActivationEventSummaryRow> {
  const map = new Map<string, ActivationEventSummaryRow>();
  for (const row of rows) {
    if (!row.activation_code || map.has(row.activation_code)) continue;
    map.set(row.activation_code, row);
  }
  return map;
}

/**
 * A UNIQUE violation on `users.username` is the console's 400, not a driver error.
 *
 * The pre-migration code translated Prisma's P2002 (`admin.repository.ts:742-747`, `:785-790`);
 * better-sqlite3 reports the same condition as `SQLITE_CONSTRAINT_UNIQUE`. Any other failure - the
 * 404 above included - travels on unchanged.
 */
function mapTeacherUsernameConflict(error: unknown): unknown {
  if ((error as { code?: string } | null)?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new ApiError(400, '用户名已存在');
  }
  return error;
}

/** Structural check used by the plugin entry to fail loudly on a mis-shaped port. */
export function assertIdentityPort(service: IdentityService): IdentityPort {
  return {
    getUserById: (userId) => service.getUserById(userId),
    getFirstUserIdByRole: (role) => service.getFirstUserIdByRole(role),
    activateUser: (input) => service.activateUser(input),
    verifyAdminCredentials: (username, password) => service.verifyAdminCredentials(username, password),
    listTeachers: () => service.listTeachers(),
    createTeacher: (input, audit) => service.createTeacher(input, audit),
    updateTeacher: (id, input, audit) => service.updateTeacher(id, input, audit),
    findTeacher: (id) => service.findTeacher(id),
    listActivationCodes: () => service.listActivationCodes(),
    generateActivationCodes: (input, audit) => service.generateActivationCodes(input, audit),
    listSuperadmins: () => service.listSuperadmins(),
    restoreSuperadmins: (superadmins) => service.restoreSuperadmins(superadmins),
  };
}
