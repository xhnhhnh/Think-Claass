/**
 * The seventeen engagement routes, relocated from
 * `api/modules/engagement/engagement.controllers.ts`.
 *
 * METHOD+PATH unchanged; the seven controller prefixes are kept (announcements, class-announcements,
 * praises, certificates, redemption, messages, family-tasks, lucky-draw, danmaku - nine, counting
 * the two that share a prefix family), so the endpoint surface does not move.
 *
 * Error translation is the legacy module's own, kept per controller because it was not uniform:
 * `legacyError(status, message)` built an `HttpException` with `{success:false, message}`, and each
 * handler chose its own fallback text ('获取公告失败', 'Internal Server Error', 'Server error', or the
 * error's own message). The kernel's global filter renders a kernel `ApiError` into exactly the same
 * body, so this helper now only builds that `ApiError`.
 *
 * Two handlers answer through `@Res()` and therefore bypass the filter - `POST /api/redemption/verify`
 * and `POST /api/lucky-draw/draw` - because the service returns a `{status, body}` pair. They keep
 * writing the response themselves, exactly as before, and their authorization refusals are written
 * through the same `{success:false, message}` body rather than escaping to the filter.
 *
 * ## Authorization
 *
 * Every route except `GET /api/announcements/active` (a public banner, named public-by-design in
 * `scripts/security/route-authorization-audit.mjs`) resolves the caller first and refuses an
 * anonymous request with 401 before it reads or writes anything. Roles are the matrix's minimal
 * sets (`docs/security/route-authorization-matrix.md`), and the identity columns the routes used to
 * trust are now derived from the actor:
 *
 *   - `POST /api/class-announcements`   `teacher_id`  <- actor (was body)
 *   - `POST /api/praises`               `teacher_id`  <- actor (was body)
 *   - `GET  /api/redemption/my`         student id    <- actor (was an enumerable `?studentId=`)
 *   - `POST /api/messages`              `sender_id`/`sender_role` <- actor (was body)
 *   - `GET|POST /api/family-tasks`      student/parent ids <- actor (were query/body)
 *   - `GET|POST /api/lucky-draw/config` teacher id   <- actor (was query/body)
 *   - `POST /api/lucky-draw/draw`       student id    <- actor (was body)
 *   - `POST /api/danmaku`               `sender_name` <- actor (was body: impersonation)
 *
 * The scope checks live in `EngagementService` because `students`/`classes` are classroom's tables:
 * the service resolves who an actor owns through `classroom.public` and answers 403 with the same
 * message. They are called *before* the legacy `try/catch` clauses below, because those clauses
 * flatten a kernel `ApiError` into 500 - the pre-existing defect this file's `_known_debt` records.
 *
 * Two routes admit one role more than the matrix's minimal set, and both are narrower in *data*
 * than the matrix's ruling, not wider:
 *
 *   - `POST /api/messages` also admits the teacher, because the teacher's communication page
 *     replies through it (`TeacherCommunicationPage.tsx:95`, `sender_role: 'teacher'`); the sender
 *     is still derived from the actor and the class must still be the actor's.
 *   - `GET /api/lucky-draw/config` also admits the student, because the student's draw page renders
 *     its prize grid from it (`StudentLuckyDrawPage.tsx:43-45`); `?teacherId=` is ignored for them
 *     and replaced with their own class's teacher, so the anonymous enumeration the matrix flags is
 *     closed. A parent is not admitted to either, and staff keep the console's access.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ApiError } from '@thinkclass/kernel';

import { requireActorRole, STAFF_ROLES, type RequestActor } from './engagement.authorization.js';
import { EngagementService } from './engagement.service.js';

/**
 * The legacy `legacyError(status, message)`.
 *
 * Returns a Nest `HttpException`, **not** the kernel's `ApiError`, and the difference is observable.
 * The legacy handlers rethrow `HttpException` and swallow everything else into a 500, so the
 * controller's own sentinels (the 400s for bad input, the 404s for a missing task) survived while
 * the application's `ApiError` - which the class-feature gate and `getStudentById` threw - did not.
 *
 * Using the kernel's `ApiError` here instead looked tidier and silently changed three statuses:
 * `GET /api/family-tasks` with no query answered 500 instead of the legacy 400, and the same
 * mistake turned the gate's documented 500s into 403/404. The probe caught it; see the comment on
 * `FamilyTasksController`.
 */
function legacyError(status: number, message: string): HttpException {
  return new HttpException({ success: false, message }, status);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Server error';
}

/**
 * Write an authorization refusal from an `@Res()` handler.
 *
 * Those two handlers bypass the global filter, so a thrown `ApiError` would reach Express as an
 * unhandled error. They write the same `{success:false, message}` body every other failure in this
 * file writes, with the status the error carries - the envelope the frontend already parses.
 */
function respondApiError(res: Response, error: unknown): Response {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: 'Server error' });
}

/** The actor, already gated by the caller's `requireActorRole`. Kept for readability. */
type Actor = RequestActor;

@Controller('api/announcements')
export class AnnouncementsController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  /**
   * Public by design: one active banner string, listed in `PUBLIC_BY_DESIGN` by the audit script.
   * The frontend reads it from the logged-in shell, but it carries no user data, so it stays
   * anonymous on purpose rather than by omission.
   */
  @Get('active')
  getActiveAnnouncement() {
    try {
      return { success: true, announcement: this.engagementService.getActiveAnnouncement() };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, '获取公告失败');
    }
  }
}

@Controller('api/class-announcements')
export class ClassAnnouncementsController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  async getClassAnnouncements(@Req() req: Request, @Query('classId') classId?: string) {
    const actor = requireActorRole(req, ['teacher', 'student']);
    if (!classId) throw legacyError(HttpStatus.BAD_REQUEST, 'classId is required');

    await this.engagementService.assertClassAccess(actor, classId);

    try {
      return { success: true, announcements: this.engagementService.getClassAnnouncements(classId) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createClassAnnouncement(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher']);
    const { class_id, title, content } = body ?? {};
    if (!class_id || !title || !content) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Missing required fields');
    }

    // The teacher must own the class, and the announcement is signed by the caller - the body's
    // `teacher_id` used to let anyone publish under any teacher's name.
    await this.engagementService.assertClassAccess(actor, class_id);

    try {
      return {
        success: true,
        announcement: this.engagementService.createClassAnnouncement({ ...body, teacher_id: actor.id }),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Delete(':id')
  async deleteClassAnnouncement(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, ['teacher', ...STAFF_ROLES]);
    this.assertAuthor('teacher', actor, this.engagementService.classAnnouncementAuthor(id));

    try {
      this.engagementService.deleteClassAnnouncement(id);
      return { success: true, message: 'Announcement deleted successfully' };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  /**
   * The matrix's teacher（作者）/admin: a teacher may delete only what they announced, an
   * admin anything. A missing row keeps the legacy no-op success rather than becoming a 403.
   */
  private assertAuthor(role: string, actor: Actor, authorId: number | null): void {
    if (authorId === null || actor.role !== role) return;
    if (authorId !== actor.id) throw new ApiError(403, '无权限执行该操作');
  }
}

@Controller('api/praises')
export class PraisesController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  async getPraises(@Req() req: Request, @Query('classId') classId?: string) {
    const actor = requireActorRole(req, ['teacher', 'student', 'parent']);
    if (!classId) throw legacyError(HttpStatus.BAD_REQUEST, 'classId is required');

    await this.engagementService.assertClassAccess(actor, classId);

    try {
      return { success: true, praises: await this.engagementService.getPraisesByClass(classId) };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }

  @Get('student/:id')
  async getStudentPraises(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, ['teacher', 'student', 'parent']);
    await this.engagementService.assertStudentAccess(actor, id);

    try {
      return { success: true, praises: await this.engagementService.getPraisesByStudent(id) };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createPraise(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher']);
    const { student_id, content } = body ?? {};
    if (!student_id || !content) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'student_id and content are required');
    }

    // "本班": the praised student has to be one of the teacher's own, and the praise is signed by
    // the caller - `teacher_id` came from the body and could name anyone.
    await this.engagementService.assertStudentAccess(actor, student_id);

    try {
      return { success: true, praise: await this.engagementService.createPraise({ ...body, teacher_id: actor.id }) };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }

  @Delete(':id')
  async deletePraise(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, ['teacher', ...STAFF_ROLES]);
    const authorId = this.engagementService.praiseAuthor(id);
    if (authorId !== null && actor.role === 'teacher' && authorId !== actor.id) {
      throw new ApiError(403, '无权限执行该操作');
    }

    try {
      this.engagementService.deletePraise(id);
      return { success: true, message: 'Praise deleted successfully' };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal Server Error');
    }
  }
}

@Controller('api/certificates')
export class CertificatesController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  /**
   * The read is filtered by the actor's roster: their own certificates, their children's, or the
   * students of their classes. `studentId` may only narrow that set - it used to be optional and
   * was the only filter, so an anonymous caller could pull every certificate in the school.
   */
  @Get()
  async getCertificates(@Req() req: Request, @Query('studentId') studentId?: string) {
    const actor = requireActorRole(req, ['teacher', 'student', 'parent']);

    try {
      return { success: true, certificates: await this.engagementService.getCertificatesFor(actor, studentId) };
    } catch (error) {
      // The scope refusal is the kernel's `ApiError`; the legacy clause below would flatten it
      // into 500 (the defect this file's `_known_debt` records), so it is rethrown first.
      if (error instanceof ApiError) throw error;
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createCertificate(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', ...STAFF_ROLES]);
    const { student_id, title } = body ?? {};
    if (!student_id || !title) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'student_id and title are required');
    }

    await this.engagementService.assertStudentAccess(actor, student_id);

    try {
      return { success: true, certificate: this.engagementService.createCertificate(body) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}

@Controller('api/redemption')
export class RedemptionController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  /**
   * The student's own tickets - a ticket is an asset, and `?studentId=` used to enumerate anyone's
   * codes. The id is derived from the actor; the query parameter is ignored, not merely validated.
   */
  @Get('my')
  async getMyTickets(@Req() req: Request) {
    const actor = requireActorRole(req, ['student']);
    const studentId = await this.engagementService.ownStudentId(actor);
    if (studentId === null) throw new ApiError(403, '无权限执行该操作');

    try {
      return { success: true, tickets: this.engagementService.getRedemptionTickets(studentId) };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
    }
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Req() req: Request, @Body() body: Record<string, any>, @Res() res: Response) {
    // @Res() bypasses the global filter, so the refusal is written here in the same body shape the
    // handler uses for its own 400/404/500 answers.
    try {
      requireActorRole(req, ['teacher', ...STAFF_ROLES]);
    } catch (error) {
      return respondApiError(res, error);
    }

    const { code } = body ?? {};
    if (!code) {
      return res.status(400).json({ success: false, message: '核销码不能为空' });
    }

    try {
      const result = await this.engagementService.verifyRedemption(code);
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
}

@Controller('api/messages')
export class MessagesController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  /**
   * The message feed, narrowed to the actor.
   *
   * A named class must be one the actor belongs to; with no class named the page is every class
   * they own rather than the whole table. A student's or parent's `involvedId`/`receiverId` must be
   * their own row or one of their children, and the `role` the service uses to decide whether an
   * anonymous sender stays masked is the actor's role - a client could previously ask for
   * `role=teacher` and unmask every anonymous author.
   */
  @Get()
  async getMessages(@Req() req: Request, @Query() query: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'student', 'parent']);

    const filter: Record<string, any> = { ...(query ?? {}) };
    const classId = filter.classId;
    if (classId !== undefined && classId !== null && classId !== '') {
      await this.engagementService.assertClassAccess(actor, classId);
    } else {
      // No class named: the page is every class the actor owns, never the whole table.
      filter.classIds = (await this.engagementService.scopedClassIds(actor)) ?? [];
      delete filter.classId;
    }

    if (actor.role !== 'teacher') {
      // A student's or a parent's feed can only be asked about their own row.
      const allowed = await this.engagementService.scopedStudentIds(actor);
      for (const key of ['involvedId', 'receiverId']) {
        const value = filter[key];
        if (value === undefined || value === null || value === '') continue;
        if (allowed !== null && !allowed.includes(Number(value))) throw new ApiError(403, '无权限执行该操作');
      }
    }

    // Derived, never a query parameter: the anonymity rule follows who is asking.
    filter.role = actor.role;

    try {
      return { success: true, messages: await this.engagementService.getMessages(filter) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createMessage(@Req() req: Request, @Body() body: Record<string, any>) {
    // The matrix's minimal set for this write is student（本人）. The teacher is admitted as well
    // because `TeacherCommunicationPage.tsx:95` answers a tree-hole message through this same route
    // (`sender_role: 'teacher'`); refusing it would break the reply the teacher's page is built
    // around. Both are bound the same way - the sender is the actor and the class must be theirs -
    // so the impersonation the matrix names (`sender_id` from the body) is closed either way. A
    // parent is *not* admitted: no parent flow posts here.
    const actor = requireActorRole(req, ['student', 'teacher']);
    const { class_id, content, type } = body ?? {};
    if (!class_id || !content || !type) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'class_id, content, and type are required');
    }

    if (type !== 'PEER_REVIEW' && type !== 'TREE_HOLE' && type !== 'HOME_SCHOOL') {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Invalid message type');
    }

    const classId = await this.engagementService.assertClassAccess(actor, class_id);

    // The sender is the caller: `sender_id` and `sender_role` used to be free body fields, so
    // anyone could post as any student or teacher of any class.
    const senderId =
      actor.role === 'student' ? await this.engagementService.ownStudentId(actor) : actor.id;
    if (senderId === null) throw new ApiError(403, '无权限执行该操作');

    try {
      return {
        success: true,
        message: 'Message sent successfully',
        id: await this.engagementService.createMessage({
          ...body,
          class_id: classId,
          sender_id: senderId,
          sender_role: actor.role,
        }),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}

@Controller('api/family-tasks')
export class FamilyTasksController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  /**
   * The four handlers below reproduce the legacy catch clause **exactly**: they rethrow Nest's
   * `HttpException` - which is what the controller's own `legacyError` produces - and turn every
   * other error into `500 errorMessage(error)`.
   *
   * That looks like a bug, and it is one, but it is the pre-migration behaviour, verified against
   * git rather than assumed. The legacy handlers caught `HttpException`, while the class-feature
   * gate and `getStudentById` threw the *application's* `ApiError` (`api/utils/apiError.ts`, a
   * different class). So:
   *
   *   - a student whose class has the feature off answered **500 该功能当前已关闭**, not 403;
   *   - a student with no row answered **500 学生未找到**, not 404;
   *   - `PUT`/`DELETE` on a missing task answered **500 Task not found**, not 404.
   *
   * The first version of this file "fixed" that by rethrowing `ApiError` too, which silently turned
   * three documented 500s into 404s - exactly the kind of unrequested behaviour change HANDOFF
   * section 11 warns about. Reverted; the defect is recorded in the manifest's `_known_debt`.
   *
   * `errorMessage` is used rather than a fixed string because that is what the legacy handlers
   * passed, so the 500 body carries the gate's own message.
   *
   * Authorization is the one thing that runs *before* the try/catch, for the same reason: the
   * 401/403 refusals are the kernel's `ApiError` and the legacy clause would swallow them into 500.
   */
  @Get()
  async getTasks(@Req() req: Request, @Query() query: Record<string, any>) {
    const actor = requireActorRole(req, ['parent', 'student']);
    // `?studentId=`/`?parentId=` used to be the whole filter and were taken at face value.
    const bound = await this.engagementService.familyTaskQueryFor(actor, query);

    try {
      const tasks = await this.engagementService.getFamilyTasks(bound);
      if (!tasks) throw legacyError(HttpStatus.BAD_REQUEST, 'Missing studentId or parentId');

      return { success: true, tasks };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createTask(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['parent']);
    const { student_id, title, points } = body ?? {};
    if (!student_id || !title || points === undefined) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Missing required fields');
    }

    // The task is created by the caller for one of *their* children: both ids used to come from
    // the body, so an anonymous request could attach a task to any student/parent pair.
    await this.engagementService.assertStudentAccess(actor, student_id);

    try {
      return {
        success: true,
        task: await this.engagementService.createFamilyTask({ ...body, parent_id: actor.id }),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Put(':id')
  async updateTask(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['parent', 'teacher']);
    // A parent may update a task of their own child, a teacher one of their own class. A missing
    // row returns null here and the service keeps answering its legacy 404.
    await this.engagementService.assertFamilyTaskAccess(actor, id);

    try {
      const updated = await this.engagementService.updateFamilyTask(id, body?.status);
      if (!updated) throw legacyError(HttpStatus.NOT_FOUND, 'Task not found');

      return { success: true, message: 'Task updated successfully' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Delete(':id')
  async deleteTask(@Req() req: Request, @Param('id') id: string) {
    const actor = requireActorRole(req, ['parent', ...STAFF_ROLES]);
    // "本人": the parent who created the task, or staff. See `assertFamilyTaskOwner`.
    await this.engagementService.assertFamilyTaskOwner(actor, id);

    try {
      const deleted = await this.engagementService.deleteFamilyTask(id);
      if (!deleted) throw legacyError(HttpStatus.NOT_FOUND, 'Task not found');

      return { success: true, message: 'Task deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}

@Controller('api/lucky-draw')
export class LuckyDrawController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  /**
   * The prize list a draw is run against.
   *
   * The matrix's minimal set is teacher（本人）/admin, which would leave `StudentLuckyDrawPage`
   * (it reads this route for the prize grid, `StudentLuckyDrawPage.tsx:43-45`) with nothing to
   * render. A student is therefore allowed to read **their own class teacher's** config: the
   * `?teacherId=` parameter is ignored for them and replaced with the teacher of the class the
   * actor is in, so the enumeration the matrix flags is still closed while the page keeps working.
   * A teacher reads their own config the same way; only the console may name somebody else.
   */
  @Get('config')
  async getConfig(@Req() req: Request, @Query('teacherId') teacherId?: string) {
    const actor = requireActorRole(req, ['teacher', 'student', ...STAFF_ROLES]);

    let scopedTeacherId: unknown = teacherId;
    if (actor.role === 'teacher') {
      scopedTeacherId = actor.id;
    } else if (actor.role === 'student') {
      const classIds = await this.engagementService.scopedClassIds(actor);
      const classId = classIds && classIds.length > 0 ? classIds[0] : null;
      scopedTeacherId = classId === null ? null : await this.engagementService.classTeacherId(classId);
      if (scopedTeacherId === null) throw new ApiError(403, '无权限执行该操作');
    }

    try {
      const result = await this.engagementService.getLuckyDrawConfig(scopedTeacherId);
      return { success: true, ...result };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
    }
  }

  @Post('config')
  @HttpCode(HttpStatus.OK)
  async saveConfig(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', ...STAFF_ROLES]);
    const { configs } = body ?? {};
    if (!Array.isArray(configs) || configs.length !== 9) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'configs 必须是长度为 9 的数组');
    }

    // A teacher rewrites their own nine probabilities; the body's `teacher_id` used to point the
    // write at any teacher's config.
    const scopedBody = actor.role === 'teacher' ? { ...body, teacher_id: actor.id } : body;

    try {
      await this.engagementService.updateLuckyDrawConfig(scopedBody);
      return { success: true, message: 'Config updated successfully' };
    } catch {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, 'Server error');
    }
  }

  @Post('draw')
  @HttpCode(HttpStatus.OK)
  async draw(@Req() req: Request, @Body() body: Record<string, any>, @Res() res: Response) {
    // @Res() bypasses the global filter: the refusal is written here, in the handler's own shape.
    let actor: Actor;
    try {
      actor = requireActorRole(req, ['student']);
    } catch (error) {
      return respondApiError(res, error);
    }

    // The draw spends the caller's points and mints their prize; the body's `studentId` used to
    // name any student.
    let studentId: number | null;
    try {
      studentId = await this.engagementService.ownStudentId(actor);
    } catch {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    if (studentId === null) {
      return res.status(403).json({ success: false, message: '无权限执行该操作' });
    }

    try {
      const result = await this.engagementService.drawLuckyPrize(studentId);
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
}

@Controller('api/danmaku')
export class DanmakuController {
  constructor(@Inject(EngagementService) private readonly engagementService: EngagementService) {}

  @Get()
  async getMessages(
    @Req() req: Request,
    @Query('classId') classId?: string,
    @Query('since') since?: string,
  ) {
    const actor = requireActorRole(req, ['teacher', 'student', 'parent', ...STAFF_ROLES]);
    if (!classId) throw legacyError(HttpStatus.BAD_REQUEST, 'classId required');

    await this.engagementService.assertClassAccess(actor, classId);

    try {
      return { success: true, messages: await this.engagementService.getDanmakuMessages(classId, since) };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async createMessage(@Req() req: Request, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['student', 'teacher']);
    const { class_id, content } = body ?? {};
    if (!class_id || !content) {
      throw legacyError(HttpStatus.BAD_REQUEST, 'Missing required fields');
    }

    await this.engagementService.assertClassAccess(actor, class_id);

    // The name on the big screen is the actor's. `sender_name` came from the body, so anyone could
    // speak under any student's or teacher's name.
    const senderName = await this.engagementService.displayNameOf(actor);

    try {
      return {
        success: true,
        message: await this.engagementService.createDanmakuMessage({ ...body, sender_name: senderName }),
      };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }

  @Delete('cleanup')
  cleanup(@Req() req: Request) {
    requireActorRole(req, ['teacher', ...STAFF_ROLES]);

    try {
      this.engagementService.cleanupDanmakuMessages();
      return { success: true };
    } catch (error) {
      throw legacyError(HttpStatus.INTERNAL_SERVER_ERROR, errorMessage(error));
    }
  }
}
