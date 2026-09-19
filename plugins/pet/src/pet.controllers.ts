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
 * The legacy controllers were unauthenticated, and they still are: HANDOFF §10 item 3 records
 * that only routes calling `requireActorRole` are protected. Authorization is not this
 * migration's business, and adding it here would change the contract the round must preserve.
 * The two plugin-only alias routes below (`.../adopt`, `.../action`) are the exception - they
 * are this plugin's own surface and are where `pet.adopt` / `pet.interact` are enforced.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';

import { badRequest, forbidden, getRequestContext } from '@thinkclass/kernel';
import { PLUGIN_CONTEXT, type KernelContext } from '@thinkclass/plugin-sdk';

import { PetService } from './pet.service.js';

function ok<T>(data: T, message?: string, legacyPayload: Record<string, unknown> = {}) {
  return message ? { success: true, data, message, ...legacyPayload } : { success: true, data, ...legacyPayload };
}

/**
 * Authorise an actor-scoped alias request and return the caller.
 *
 * Students may only act on themselves; teachers and admins may act on anyone. The classroom
 * port is the authority on membership, but this check only needs the actor's own claims.
 */
function requireActor(req: Request, studentId: number): { actorId: number; role: string } {
  const { actor } = getRequestContext(req);
  if (!actor) throw forbidden('未登录或登录已过期');

  if (actor.role === 'student' && actor.studentId !== undefined && actor.studentId !== studentId) {
    throw forbidden('只能操作自己的精灵');
  }
  if (actor.role === 'student' && actor.studentId === undefined) {
    throw forbidden('当前账号未绑定学生');
  }
  return { actorId: actor.userId, role: actor.role };
}

@Controller('api/pet')
export class PetController {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly ctx: KernelContext,
    @Inject(PetService) private readonly petService: PetService,
  ) {}

  @Get('students/:studentId')
  async getStudentPet(@Param('studentId') studentId: string) {
    const data = await this.petService.getStudentPet(studentId);
    return ok(data, undefined, { pet: data.pet, has_parent_buff: data.hasParentBuff });
  }

  @Get('students/:studentId/dashboard')
  async getStudentDashboard(@Param('studentId') studentId: string) {
    return ok(await this.petService.getStudentDashboard(studentId));
  }

  @Get('students/:studentId/classmates')
  async getClassmates(@Param('studentId') studentId: string) {
    const classmatesPets = await this.petService.listClassmates(studentId);
    return ok({ classmatesPets }, undefined, { classmatesPets });
  }

  @Post('students/:studentId/adoptions')
  @HttpCode(HttpStatus.OK)
  async adoptPet(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const data = await this.petService.adoptPet(studentId, { elementType: body?.elementType });
    return ok(data, undefined, { petId: data.petId, pet: data.pet });
  }

  @Post('students/:studentId/actions')
  @HttpCode(HttpStatus.OK)
  async interact(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const data = await this.petService.interact(studentId, body as never);
    return ok(data, undefined, { pet: data.pet, points: data.points });
  }

  @Put('students/:studentId')
  async updatePet(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const data = await this.petService.updatePet(studentId, body);
    return ok(data, 'Pet updated successfully', { pet: data.pet });
  }

  @Get('classes/:classId')
  async listClassPets(@Param('classId') classId: string) {
    const students = await this.petService.listClassPets(classId);
    return ok({ students }, undefined, { students });
  }

  @Get('classes/:classId/leaderboard')
  async listLeaderboard(@Param('classId') classId: string) {
    const leaderboard = await this.petService.listLeaderboard(classId);
    return ok({ leaderboard }, undefined, { leaderboard });
  }

  @Post('battles')
  @HttpCode(HttpStatus.OK)
  async battle(@Body() body: Record<string, any>) {
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
    const id = Number(studentId);
    if (!Number.isFinite(id)) throw badRequest('studentId 无效');
    const { actorId, role } = requireActor(req, id);

    this.ctx.permissions.require({ userId: actorId, role: role as never, studentId: id }, 'pet.adopt');

    const data = await this.petService.adoptPet(studentId, { elementType: body?.elementType }, actorId);
    return ok(data, undefined, { petId: data.petId, pet: data.pet });
  }

  @Post('students/:studentId/action')
  @HttpCode(HttpStatus.OK)
  async act(@Req() req: Request, @Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const id = Number(studentId);
    if (!Number.isFinite(id)) throw badRequest('studentId 无效');
    const { actorId, role } = requireActor(req, id);

    this.ctx.permissions.require({ userId: actorId, role: role as never, studentId: id }, 'pet.interact');

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
  constructor(@Inject(PetService) private readonly petService: PetService) {}

  @Get('admin/class/:classId')
  async listClassPets(@Param('classId') classId: string) {
    return { success: true, students: await this.petService.listClassPets(classId) };
  }

  @Get('classmates/:studentId')
  async listClassmates(@Param('studentId') studentId: string) {
    return { success: true, classmatesPets: await this.petService.listClassmates(studentId) };
  }

  @Post('battle')
  @HttpCode(HttpStatus.OK)
  async battle(@Body() body: Record<string, any>) {
    return { success: true, result: await this.petService.battle(body as never) };
  }

  @Get('leaderboard/:classId')
  async listLeaderboard(@Param('classId') classId: string) {
    return { success: true, leaderboard: await this.petService.listLeaderboard(classId) };
  }

  @Post('adopt')
  @HttpCode(HttpStatus.OK)
  async adoptPet(@Body() body: Record<string, any>) {
    const data = await this.petService.adoptPet(body?.studentId, {
      ...body,
      elementType: body?.elementType ?? body?.element_type,
      custom_image: body?.custom_image ?? body?.customImage,
    });
    return { success: true, petId: data.petId, pet: data.pet };
  }

  @Post('interact')
  @HttpCode(HttpStatus.OK)
  async interact(@Body() body: Record<string, any>) {
    const data = await this.petService.interact(body?.studentId, body as never);
    return { success: true, pet: data.pet, points: data.points };
  }

  @Get(':studentId')
  async getStudentPet(@Param('studentId') studentId: string) {
    const data = await this.petService.getStudentPet(studentId);
    return { success: true, pet: data.pet, has_parent_buff: data.hasParentBuff };
  }

  @Put(':studentId')
  async updatePet(@Param('studentId') studentId: string, @Body() body: Record<string, any>) {
    const data = await this.petService.updatePet(studentId, body);
    return { success: true, message: 'Pet updated successfully', pet: data.pet };
  }
}
