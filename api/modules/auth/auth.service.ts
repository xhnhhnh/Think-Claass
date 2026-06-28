import type { Request } from 'express';

import { decrypt } from '../../db.js';
import { prisma } from '../../prismaClient.js';
import { activateUser } from '../../services/activationService.js';
import { ApiError } from '../../utils/apiError.js';
import { pickClassFeatures } from '../../utils/classFeatures.js';
import { hashPassword, isPasswordHash, verifyPassword } from '../../utils/password.js';
import { getRequestActor } from '../../utils/requestAuth.js';

export class AuthService {
  async login(body: Record<string, any>) {
    const { username, password, role } = body;
    const user = await prisma.users.findFirst({
      where: { username, role },
    });

    if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
      throw new ApiError(401, '账号或密码错误，请重试');
    }

    if (!isPasswordHash(user.password_hash)) {
      await prisma.users.update({
        where: { id: user.id },
        data: { password_hash: hashPassword(String(password)) },
      });
    }

    if (role === 'student') {
      const student = await prisma.students.findFirst({ where: { user_id: user.id } });
      const cls = student?.class_id ? await prisma.classes.findUnique({ where: { id: student.class_id } }) : null;

      return {
        success: true,
        user: {
          id: user.id,
          role: user.role,
          username: user.username,
          studentId: student?.id,
          classId: student?.class_id ?? undefined,
          class_id: student?.class_id ?? undefined,
          name: student ? decrypt(student.name) : undefined,
          is_activated: !!user.is_activated,
        },
        classFeatures: cls ? pickClassFeatures(cls as unknown as Record<string, unknown>) : null,
      };
    }

    if (role === 'parent') {
      const parentStudent = await prisma.parent_students.findFirst({ where: { parent_id: user.id } });
      const student = parentStudent ? await prisma.students.findUnique({ where: { id: parentStudent.student_id } }) : null;
      const cls = student?.class_id ? await prisma.classes.findUnique({ where: { id: student.class_id } }) : null;

      if (student) {
        const today = new Date().toISOString().split('T')[0];
        await prisma.$executeRaw`
          INSERT INTO parent_activity (parent_id, student_id, activity_type, last_active_date)
          VALUES (${user.id}, ${student.id}, 'login', ${today})
          ON CONFLICT(parent_id, student_id) DO UPDATE SET last_active_date = ${today}
        `;
      }

      return {
        success: true,
        user: {
          id: user.id,
          parentId: user.id,
          role: user.role,
          username: user.username,
          studentId: student?.id,
          classId: student?.class_id ?? undefined,
          class_id: student?.class_id ?? undefined,
          name: student ? decrypt(student.name) : undefined,
          is_activated: !!user.is_activated,
        },
        classFeatures: cls ? pickClassFeatures(cls as unknown as Record<string, unknown>) : null,
      };
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

  async updateProfile(req: Request, body: Record<string, any>) {
    const actor = getRequestActor(req);
    if (!actor.id || !actor.role) {
      throw new ApiError(403, '无权限执行该操作');
    }

    const username = String(body?.username ?? '').trim();
    const password = typeof body?.password === 'string' ? body.password.trim() : '';
    if (!username) {
      throw new ApiError(400, '用户名不能为空');
    }

    const currentUser = await prisma.users.findUnique({
      where: { id: actor.id },
      select: { id: true, role: true, username: true },
    });
    if (!currentUser || currentUser.role !== actor.role) {
      throw new ApiError(403, '无权限执行该操作');
    }

    const duplicateUser = await prisma.users.findFirst({
      where: {
        username,
        NOT: { id: actor.id },
      },
      select: { id: true, username: true },
    });
    if (duplicateUser) {
      throw new ApiError(400, '用户名已存在');
    }

    const updatedUser = await prisma.users.update({
      where: { id: actor.id },
      data: {
        username,
        ...(password ? { password_hash: hashPassword(password) } : {}),
      },
      select: {
        id: true,
        role: true,
        username: true,
        is_activated: true,
      },
    });

    return {
      success: true,
      user: {
        id: updatedUser.id,
        role: updatedUser.role,
        username: updatedUser.username,
        is_activated: !!updatedUser.is_activated,
      },
      message: '个人信息已更新',
    };
  }

  async register(body: Record<string, any>) {
    const { username, password, role, name, invite_code, student_id } = body;

    if (role === 'student' || role === 'parent') {
      if (!invite_code) {
        throw new ApiError(400, '注册需要班级邀请码');
      }
      if (!student_id) {
        throw new ApiError(400, '请选择绑定的学生信息');
      }

      const cls = await prisma.classes.findUnique({ where: { invite_code } });
      if (!cls) {
        throw new ApiError(400, '无效的班级邀请码');
      }

      const student = await prisma.students.findFirst({ where: { id: Number(student_id), class_id: cls.id } });
      if (!student) {
        throw new ApiError(400, '未找到该学生记录');
      }
      if (role === 'student' && student.user_id) {
        throw new ApiError(400, '该学生已被绑定');
      }
    } else if (role === 'teacher') {
      const setting = await prisma.settings.findUnique({ where: { key: 'allow_teacher_registration' } });
      if (setting && setting.value === '0') {
        throw new ApiError(403, '系统暂未开放教师注册');
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        const newUser = await tx.users.create({
          data: { role, username, password_hash: hashPassword(String(password ?? '')) },
        });

        if (role === 'student') {
          await tx.students.update({
            where: { id: Number(student_id) },
            data: { user_id: newUser.id, name: name || username },
          });
        } else if (role === 'parent') {
          await tx.parent_students.create({
            data: { parent_id: newUser.id, student_id: Number(student_id) },
          });
        }
      });
      return { success: true };
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ApiError(400, '用户名已存在');
      }
      throw error;
    }
  }

  async activate(body: Record<string, any>) {
    const { code, userId } = body;
    if (!code || !userId) {
      throw new ApiError(400, '激活码或用户ID缺失');
    }

    const activationCode = await prisma.activation_codes.findUnique({ where: { code } });
    if (!activationCode) {
      throw new ApiError(400, '无效的激活码');
    }
    if (activationCode.status === 'used') {
      throw new ApiError(400, '该激活码已被使用');
    }

    await prisma.$transaction(async (tx) => {
      await tx.activation_codes.update({
        where: { id: activationCode.id },
        data: { status: 'used', used_by: Number(userId), used_at: new Date() },
      });
    });

    await activateUser({
      userId: Number(userId),
      source: 'activation_code',
      activationCode: String(code),
      remark: '通过激活码完成开通',
    });

    return { success: true, message: '激活成功' };
  }
}
