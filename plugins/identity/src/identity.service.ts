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

import { ApiError, hashPassword, isPasswordHash, verifyPassword } from '@thinkclass/kernel';
import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import type { ActivationEventRow as PortActivationEvent, ActivationResult, IdentityPort } from '@thinkclass/contracts/domains/identity';
import type { ParentActivityRecorder } from '@thinkclass/contracts/domains/parent-buff';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { IdentityRepository } from './identity.repository.js';
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

/** Structural check used by the plugin entry to fail loudly on a mis-shaped port. */
export function assertIdentityPort(service: IdentityService): IdentityPort {
  return {
    getUserById: (userId) => service.getUserById(userId),
    activateUser: (input) => service.activateUser(input),
  };
}
