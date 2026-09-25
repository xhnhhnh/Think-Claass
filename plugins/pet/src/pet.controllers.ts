/**
 * Pet HTTP surface.
 *
 * Two controllers, and both exist because the *frontend* needs both:
 *
 *   `api/pet/*`   the routes `src/features/pet/api/petApi.ts` and
 *                 `src/features/parentDashboardApi.ts` call today;
 *   `api/pets/*`  the older alias family, still called by `parentDashboardApi`
 *                 (`/api/pets/${studentId}`) and by nothing else, kept because removing a
 *                 reachable route is an API change, not a cleanup.
 *
 * Relocated from `api/modules/pet/pet.controllers.ts` with the paths, envelopes and status
 * codes unchanged, because the deployed frontend parses them field by field. Three details
 * are easy to lose in a rewrite and are deliberate:
 *
 *   * **Every POST is `@HttpCode(200)`.** Nest's default for POST is 201. The legacy
 *     controller set 200 explicitly; the frontend treats non-2xx as failure but the endpoint
 *     snapshot and the e2e flows were written against 200.
 *   * **Envelope duplication.** These routes put the payload both under `data` and at the
 *     top level (`ok(data, undefined, { pet, has_parent_buff })`). `petApi.ts` reads the flat
 *     copies. Dropping either one is a breaking change.
 *   * **Declaration order inside `api/pets`.** `@Get(':studentId')` is declared last so that
 *     `admin/class/:classId`, `classmates/:studentId` and `leaderboard/:classId` match first.
 *     Moving it up silently turns those three into student lookups.
 *
 * The legacy controllers were unauthenticated and, apart from the permission-gated writes below,
 * still are; the tree-wide authorization round is tracked per endpoint in
 * `docs/security/route-authorization-matrix.md` and `plugins/pet` is one of its batches. The four
 * write routes are the exception and are the ones the frontend actually reaches: `/adoptions`,
 * `/actions` and this plugin's own `/adopt`, `/action` aliases all run the same
 * `requireActor` + `ctx.permissions.require` gate, so `pet.adopt` / `pet.interact` cannot be
 * bypassed by choosing the twin route.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';

import { badRequest, forbidden, getRequestContext } from '@thinkclass/kernel';
import { PLUGIN_CONTEXT, type KernelContext } from '@thinkclass/plugin-sdk';

import { PetAuthorization, requireActor, requireActorRole } from './pet.authorization.js';
import { PetService } from './pet.service.js';

function ok<T>(data: T, message?: string, legacyPayload: Record<string, unknown> = {}) {
  return message ? { success: true, data, message, ...legacyPayload } : { success: true, data, ...legacyPayload };
}

/**
 * Authorise an actor-scoped request and return the caller.
 *
 * Students may only act on themselves; teachers and admins may act on anyone.
 *
 * `actor.studentId` is the kernel's *resolved* scope, not something this plugin looks up. It used
 * to be permanently `undefined`: the request-context middleware returned only `{ userId, role }`
 * from `sessions.verify`, so the `actor.studentId === undefined` branch below was the only one a
 * student could ever reach and both permission-gated routes answered 403「当前账号未绑定学生」for
 * every student. `api/app.ts` now supplies a `scopeResolver` that fills it from
 * `classroom.public.getStudentByUserId`, so a student who owns the row gets through.
 *
 * The check stays here rather than moving into the service because the *port* is the authority on
 * membership: this only rejects a caller who is claiming to be a student they are not.
 */
function requireSelf(req: Request, studentId: number): { actorId: number; role: string } {
  const { actor } = getRequestContext(req);
  if (!actor) throw forbidden('未登录或登录已过期');

  if (actor.role === 'student') {
    if (actor.studentId === undefined) throw forbidden('当前账号未绑定学生');
    if (actor.studentId !== studentId) throw forbidden('只能操作自己的精灵');
  }
  return { actorId: actor.userId, role: actor.role };
}

/** Roles that may read a student's pet: the student, their parent, their teacher, staff. */
const PET_READERS = ['student', 'parent', 'teacher', 'admin', 'superadmin'];
/** Roles that may read a class's pet board. */
const CLASS_READERS = ['student', 'parent', 'teacher', 'admin', 'superadmin'];

/**
 * The student id a body names, validated.
 *
 * The alias family takes the student from the body rather than the path, so the value has to be
 * checked before it can be compared against the actor: `Number(undefined)` is `NaN`, which would
 * make every comparison false and every gate refuse with the wrong reason.
 */
function parseStudentId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('studentId 无效');
  return id;
}

@Controller('api/pet')
export class PetController {
  /** Built on first use: the classroom port is resolved from the context, which needs a live host. */
  private authz: PetAuthorization | null = null;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly ctx: KernelContext,
    @Inject(PetService) private readonly petService: PetService,
  ) {}

  /** The scope checker. Lazy so the port is resolved per call rather than captured at construction. */
  private authorization(): PetAuthorization {
    this.authz ??= new PetAuthorization(this.ctx.use('classroom.public'));
    return this.authz;
  }

  /**
   * Authorise + enforce the permission for an adoption.
   *
   * The permission gate used to live only on the `/adopt` alias, which made it decorative: the
   * `petApi.ts` the frontend actually calls posts to `/adoptions`, so the ungated twin was the
   * reachable one and `pet.adopt` gated nothing a user could hit. Both now go through here.
   */
  private authorizeAdopt(req: Request, studentId: string) {
    const id = Number(studentId);
    if (!Number.isFinite(id)) throw badRequest('studentId 无效');
    const { actorId, role } = requireSelf(req, id);
    this.ctx.permissions.require({ userId: actorId, role: role as never, studentId: id }, 'pet.adopt');
    return { id, actorId };
  }

  /** Authorise + enforce the permission for an interaction. Counterpart of `authorizeAdopt`. */
  private authorizeInteract(req: Request, studentId: string) {
    const id = Number(studentId);
    if (!Number.isFinite(id)) throw badRequest('studentId 无效');
    const { actorId, role } = requireSelf(req, id);
    this.ctx.permissions.require({ userId: actorId, role: role as never, studentId: id }, 'pet.interact');
    return { id, actorId };
  }

  @Get('students/:studentId')
  async getStudentPet(@Req() req: Request, @Param('studentId') studentId: string) {
    // The matrix rules every read `student（本人）/ parent（孩子）/ teacher（本班）`. The role gate runs
    // first so an anonymous caller is refused before any scope lookup touches the database.
    const actor = requireActorRole(req, PET_READERS);
    await this.authorization().assertStudentAccess(actor, Number(studentId), '无权限查看该学生的精灵');
    const data = await this.petService.getStudentPet(studentId);
    return ok(data, undefined, { pet: data.pet, has_parent_buff: data.hasParentBuff });
  }

  @Get('students/:studentId/dashboard')
  async getStudentDashboard(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, PET_READERS);
    await this.authorization().assertStudentAccess(actor, Number(studentId), '无权限查看该学生的精灵');
    return ok(await this.petService.getStudentDashboard(studentId));
  }

  @Get('students/:studentId/classmates')
  async getClassmates(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, PET_READERS);
    await this.authorization().assertStudentAccess(actor, Number(studentId), '无权限查看该学生的同学');
    const classmatesPets = await this.petService.listClassmates(studentId);
    return ok({ classmatesPets }, undefined, { classmatesPets });
  }

  @Post('students/:studentId/adoptions')
  @HttpCode(HttpStatus.OK)
  async adoptPet(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const { actorId } = this.authorizeAdopt(req, studentId);
    const data = await this.petService.adoptPet(studentId, { elementType: body?.elementType }, actorId);
    return ok(data, undefined, { petId: data.petId, pet: data.pet });
  }

  @Post('students/:studentId/actions')
  @HttpCode(HttpStatus.OK)
  async interact(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const { actorId } = this.authorizeInteract(req, studentId);
    const data = await this.petService.interact(studentId, body as never, actorId);
    return ok(data, undefined, { pet: data.pet, points: data.points });
  }

  @Put('students/:studentId')
  async updatePet(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    // A write to another account's pet: teacher of the student's class, or staff. A student may not
    // edit their own pet's stats either - this is the admin/teacher surface.
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    await this.authorization().assertStudentAccess(actor, Number(studentId), '无权限修改该学生的精灵');
    const data = await this.petService.updatePet(studentId, body);
    return ok(data, 'Pet updated successfully', { pet: data.pet });
  }

  @Get('classes/:classId')
  async listClassPets(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    await this.authorization().assertClassAccess(actor, Number(classId), '无权限查看该班级的精灵');
    const students = await this.petService.listClassPets(classId);
    return ok({ students }, undefined, { students });
  }

  @Get('classes/:classId/leaderboard')
  async listLeaderboard(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    await this.authorization().assertClassAccess(actor, Number(classId), '无权限查看该班级的精灵榜');
    const leaderboard = await this.petService.listLeaderboard(classId);
    return ok({ leaderboard }, undefined, { leaderboard });
  }

  @Post('battles')
  @HttpCode(HttpStatus.OK)
  async battle(@Req() req: Request, @Body() body: Record<string, any>) {
    // A battle settles against the challenger's own pet - the body names both students, so the
    // actor (not the body) decides which side is allowed to be the caller.
    const actor = requireActor(req);
    const challenger = Number(body?.studentId);
    await this.authorization().assertStudentAccess(actor, challenger, '无权限发起该对战');
    const result = await this.petService.battle(body as never);
    return ok({ result }, undefined, { result });
  }

  // -- plugin-only aliases --------------------------------------------------
  //
  // These two paths never existed in `api/modules/pet`; they are this plugin's own routes and
  // the only place its declared permissions are enforced. They delegate to the same service
  // methods as `/adoptions` and `/actions` and answer the same envelope, so there is exactly
  // one implementation of "adopt" and one of "act" - the difference is the permission gate.

  @Post('students/:studentId/adopt')
  @HttpCode(HttpStatus.OK)
  async adopt(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const { actorId } = this.authorizeAdopt(req, studentId);
    const data = await this.petService.adoptPet(studentId, { elementType: body?.elementType }, actorId);
    return ok(data, undefined, { petId: data.petId, pet: data.pet });
  }

  @Post('students/:studentId/action')
  @HttpCode(HttpStatus.OK)
  async act(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const { actorId } = this.authorizeInteract(req, studentId);
    const data = await this.petService.interact(studentId, body as never, actorId);
    return ok(data, undefined, { pet: data.pet, points: data.points });
  }

  @Get('health')
  health() {
    return { success: true, data: { plugin: this.ctx.plugin.id, version: this.ctx.plugin.version } };
  }
}

@Controller('api/pets')
export class LegacyPetsController {
  private authz: PetAuthorization | null = null;

  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly ctx: KernelContext,
    @Inject(PetService) private readonly petService: PetService,
  ) {}

  /** Same scope checker as `PetController`; see its comment for why it is lazy. */
  private authorization(): PetAuthorization {
    this.authz ??= new PetAuthorization(this.ctx.use('classroom.public'));
    return this.authz;
  }

  @Get('admin/class/:classId')
  async listClassPets(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    await this.authorization().assertClassAccess(actor, Number(classId), '无权限查看该班级的精灵');
    return { success: true, students: await this.petService.listClassPets(classId) };
  }

  @Get('classmates/:studentId')
  async listClassmates(@Req() req: Request, @Param('studentId') studentId: string) {
    const actor = requireActorRole(req, PET_READERS);
    await this.authorization().assertStudentAccess(actor, Number(studentId), '无权限查看该学生的同学');
    return { success: true, classmatesPets: await this.petService.listClassmates(studentId) };
  }

  @Post('battle')
  @HttpCode(HttpStatus.OK)
  async battle(@Req() req: Request, @Body() body: Record<string, any>) {
    // The third route into `battle` (with `/api/pet/battles` and the plugin's own surface), and the
    // one that made the permission gate bypassable: the body names the challenger, so the actor has
    // to be checked against it here exactly as in `PetController`.
    const actor = requireActor(req);
    await this.authorization().assertStudentAccess(actor, Number(body?.studentId), '无权限发起该对战');
    return { success: true, result: await this.petService.battle(body as never) };
  }

  @Get('leaderboard/:classId')
  async listLeaderboard(@Req() req: Request, @Param('classId') classId: string) {
    const actor = requireActorRole(req, CLASS_READERS);
    await this.authorization().assertClassAccess(actor, Number(classId), '无权限查看该班级的精灵榜');
    return { success: true, leaderboard: await this.petService.listLeaderboard(classId) };
  }

  @Post('adopt')
  @HttpCode(HttpStatus.OK)
  async adoptPet(@Req() req: Request, @Body() body: Record<string, any>) {
    const parsed = parseStudentId(body?.studentId);
    // This alias family carried NO gate at all, while its twin `/api/pet/students/:id/adopts` and the
    // plugin's own alias both enforced `pet.adopt` - so the declared permission was decorative as
    // long as a caller knew this path.
    const { actorId, role } = requireSelf(req, parsed);
    this.ctx.permissions.require({ userId: actorId, role: role as never, studentId: parsed }, 'pet.adopt');

    const data = await this.petService.adoptPet(body?.studentId, {
      ...body,
      elementType: body?.elementType ?? body?.element_type,
      custom_image: body?.custom_image ?? body?.customImage,
    }, actorId);
    return { success: true, petId: data.petId, pet: data.pet };
  }

  @Post('interact')
  @HttpCode(HttpStatus.OK)
  async interact(@Req() req: Request, @Body() body: Record<string, any>) {
    const parsed = parseStudentId(body?.studentId);
    const { actorId, role } = requireSelf(req, parsed);
    this.ctx.permissions.require({ userId: actorId, role: role as never, studentId: parsed }, 'pet.interact');

    const data = await this.petService.interact(body?.studentId, body as never, actorId);
    return { success: true, pet: data.pet, points: data.points };
  }

  @Get(':studentId')
  async getStudentPet(@Req() req: Request, @Param('studentId') studentId: string) {
    // `parentDashboardApi` reads this one, which is why it could not simply be deleted.
    const actor = requireActorRole(req, PET_READERS);
    await this.authorization().assertStudentAccess(actor, Number(studentId), '无权限查看该学生的精灵');
    const data = await this.petService.getStudentPet(studentId);
    return { success: true, pet: data.pet, has_parent_buff: data.hasParentBuff };
  }

  @Put(':studentId')
  async updatePet(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    await this.authorization().assertStudentAccess(actor, Number(studentId), '无权限修改该学生的精灵');
    const data = await this.petService.updatePet(studentId, body);
    return { success: true, message: 'Pet updated successfully', pet: data.pet };
  }
}
