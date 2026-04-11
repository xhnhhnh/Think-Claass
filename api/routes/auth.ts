import { Router, type Request, type Response } from 'express';
import { decrypt } from '../db.js';
import { prisma } from '../prismaClient.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { activateUser } from '../services/activationService.js';
import { pickClassFeatures } from '../utils/classFeatures.js';

const router = Router();

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { username, password, role } = req.body;

  const user = await prisma.users.findFirst({
    where: { username, password_hash: password, role }
  });

  if (!user) {
    throw new ApiError(401, '账号或密码错误，请重试');
  }

  if (role === 'student') {
    const student = await prisma.students.findFirst({ where: { user_id: user.id } });
    const cls = student?.class_id ? await prisma.classes.findUnique({ where: { id: student.class_id } }) : null;
    
    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        role: user.role, 
        username: user.username, 
        studentId: student?.id, 
        class_id: student?.class_id ?? undefined,
        name: student ? decrypt(student.name) : undefined, 
        is_activated: !!user.is_activated 
      },
      classFeatures: cls ? pickClassFeatures(cls as unknown as Record<string, unknown>) : null
    });
  } else if (role === 'parent') {
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

    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        parentId: user.id, 
        role: user.role, 
        username: user.username, 
        studentId: student?.id, 
        class_id: student?.class_id ?? undefined,
        name: student ? decrypt(student.name) : undefined, 
        is_activated: !!user.is_activated 
      },
      classFeatures: cls ? pickClassFeatures(cls as unknown as Record<string, unknown>) : null
    });
  } else {
    res.json({ success: true, user: { id: user.id, role: user.role, username: user.username, is_activated: !!user.is_activated } });
  }
}));

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { username, password, role, name, invite_code, student_id } = req.body;
  let classId = 1;
  
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
    
    classId = cls.id;
  } else if (role === 'teacher') {
    const setting = await prisma.settings.findUnique({ where: { key: 'allow_teacher_registration' } });
    if (setting && setting.value === '0') {
      throw new ApiError(403, '系统暂未开放教师注册');
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const newUser = await tx.users.create({
        data: { role, username, password_hash: password }
      });
      
      if (role === 'student') {
        await tx.students.update({
          where: { id: Number(student_id) },
          data: { user_id: newUser.id, name: name || username }
        });
      } else if (role === 'parent') {
        await tx.parent_students.create({
          data: { parent_id: newUser.id, student_id: Number(student_id) }
        });
      }
    });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new ApiError(400, '用户名已存在');
    }
    throw error;
  }
}));

router.post('/activate', asyncHandler(async (req: Request, res: Response) => {
  const { code, userId } = req.body;
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
      data: { status: 'used', used_by: Number(userId), used_at: new Date() }
    });
  });

  await activateUser({
    userId: Number(userId),
    source: 'activation_code',
    activationCode: String(code),
    remark: '通过激活码完成开通',
  });

  res.json({ success: true, message: '激活成功' });
}));

export default router;
