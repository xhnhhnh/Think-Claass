/**
 * Pet HTTP surface.
 *
 * A plugin contributes ordinary Nest controllers; the runtime assembles them into a
 * per-plugin dynamic module at boot (spike R10). The controller receives its
 * `KernelContext` through the `PLUGIN_CONTEXT` token rather than importing anything
 * from the kernel's internals, so the only dependency it has on the host is the
 * published SDK.
 */

import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { getRequestContext, forbidden, badRequest } from '@thinkclass/kernel';
import { PLUGIN_CONTEXT, type KernelContext } from '@thinkclass/plugin-sdk';

import { PetService } from './pet.service.js';

/** Authorise a student-scoped request and return the caller's id. */
function requireActor(req: Request): { actorId: number; role: string } {
  const { actor } = getRequestContext(req);
  if (!actor) throw new Error('unauthenticated');
  return { actorId: actor.userId, role: actor.role };
}

function assertStudentScope(req: Request, studentId: number): { actorId: number; classId: number | null } {
  const { actor } = getRequestContext(req);
  if (!actor) throw forbidden('未登录或登录已过期');

  // Students may only act on themselves; teachers and admins may act on anyone in
  // a class they can see. The classroom port is the authority on membership.
  if (actor.role === 'student' && actor.studentId !== undefined && actor.studentId !== studentId) {
    throw forbidden('只能操作自己的精灵');
  }
  if (actor.role === 'student' && actor.studentId === undefined) {
    throw forbidden('当前账号未绑定学生');
  }
  return { actorId: actor.userId, classId: actor.classId ?? null };
}

@Controller('api/pet')
export class PetController {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly ctx: KernelContext,
    @Inject(PetService) private readonly service: PetService,
  ) {}

  @Get('students/:studentId')
  async getForStudent(@Req() req: Request, @Param('studentId') studentId: string) {
    const id = Number(studentId);
    if (!Number.isFinite(id)) throw badRequest('studentId 无效');
    assertStudentScope(req, id);

    const pet = await this.service.getForStudent(id);
    return { success: true, data: { pet, hasParentBuff: false } };
  }

  @Post('students/:studentId/adopt')
  async adopt(
    @Req() req: Request,
    @Param('studentId') studentId: string,
    @Body() body: { name?: string; element?: string },
  ) {
    const id = Number(studentId);
    if (!Number.isFinite(id)) throw badRequest('studentId 无效');
    const { actorId } = assertStudentScope(req, id);

    const name = String(body?.name ?? '').trim();
    if (!name) throw badRequest('请为精灵取一个名字');

    this.ctx.permissions.require(
      { userId: actorId, role: (getRequestContext(req).actor?.role ?? 'student') as never, studentId: id },
      'pet.adopt',
    );

    const pet = await this.service.adopt({
      studentId: id,
      name,
      element: body?.element as never,
      actorId,
    });
    return { success: true, data: { pet } };
  }

  @Post('students/:studentId/action')
  async act(
    @Req() req: Request,
    @Param('studentId') studentId: string,
    @Body() body: { action?: string },
  ) {
    const id = Number(studentId);
    if (!Number.isFinite(id)) throw badRequest('studentId 无效');
    const { actorId } = assertStudentScope(req, id);

    const action = String(body?.action ?? '');
    if (action !== 'feed' && action !== 'play' && action !== 'train') {
      throw badRequest('action 必须是 feed / play / train 之一');
    }

    const result = await this.service.act({ studentId: id, action, actorId });
    return { success: true, data: { result } };
  }

  @Get('health')
  health() {
    return { success: true, data: { plugin: this.ctx.plugin.id, version: this.ctx.plugin.version } };
  }
}
