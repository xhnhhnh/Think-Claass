import { beforeEach, describe, expect, it, vi } from 'vitest';

const authClassMocks = vi.hoisted(() => ({
  decrypt: vi.fn((value: string) => `decrypted:${value}`),
  findUser: vi.fn(),
  updateUser: vi.fn(),
  findStudent: vi.fn(),
  findClass: vi.fn(),
  findParentStudent: vi.fn(),
  findStudentById: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  decrypt: authClassMocks.decrypt,
}));

vi.mock('../../prismaClient.js', () => ({
  prisma: {
    users: {
      findFirst: authClassMocks.findUser,
      update: authClassMocks.updateUser,
    },
    students: {
      findFirst: authClassMocks.findStudent,
      findUnique: authClassMocks.findStudentById,
    },
    classes: {
      findUnique: authClassMocks.findClass,
    },
    parent_students: {
      findFirst: authClassMocks.findParentStudent,
    },
    $executeRaw: authClassMocks.executeRaw,
  },
}));

import { AuthService } from './auth.service';

async function postLogin(body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  try {
    return { status: 200, body: await new AuthService().login(body) };
  } catch (error: any) {
    return { status: error.statusCode ?? 500, body: { success: false, message: error.message } };
  }
}

describe('auth login class context', () => {
  beforeEach(() => {
    authClassMocks.decrypt.mockClear();
    authClassMocks.findUser.mockReset();
    authClassMocks.updateUser.mockReset();
    authClassMocks.findStudent.mockReset();
    authClassMocks.findClass.mockReset();
    authClassMocks.findParentStudent.mockReset();
    authClassMocks.findStudentById.mockReset();
    authClassMocks.executeRaw.mockReset();
  });

  it('returns both classId and class_id for student sessions', async () => {
    authClassMocks.findUser.mockResolvedValue({
      id: 7,
      role: 'student',
      username: 'student01',
      password_hash: '123456',
      is_activated: 1,
    });
    authClassMocks.findStudent.mockResolvedValue({
      id: 21,
      class_id: 5,
      name: 'encrypted-name',
    });
    authClassMocks.findClass.mockResolvedValue({
      id: 5,
      enable_shop: 1,
      enable_lucky_draw: 0,
    });

    const response = await postLogin({ username: 'student01', password: '123456', role: 'student' });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      studentId: 21,
      classId: 5,
      class_id: 5,
      name: 'decrypted:encrypted-name',
    });
    expect(response.body.classFeatures.enable_shop).toBe(true);
    expect(response.body.classFeatures.enable_lucky_draw).toBe(false);
  });

  it('returns both classId and class_id for parent sessions', async () => {
    authClassMocks.findUser.mockResolvedValue({
      id: 8,
      role: 'parent',
      username: 'parent01',
      password_hash: '123456',
      is_activated: 1,
    });
    authClassMocks.findParentStudent.mockResolvedValue({
      parent_id: 8,
      student_id: 31,
    });
    authClassMocks.findStudentById.mockResolvedValue({
      id: 31,
      class_id: 6,
      name: 'child-name',
    });
    authClassMocks.findClass.mockResolvedValue({
      id: 6,
      enable_family_tasks: 1,
      enable_parent_buff: 0,
    });

    const response = await postLogin({ username: 'parent01', password: '123456', role: 'parent' });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      parentId: 8,
      studentId: 31,
      classId: 6,
      class_id: 6,
      name: 'decrypted:child-name',
    });
    expect(response.body.classFeatures.enable_family_tasks).toBe(true);
    expect(response.body.classFeatures.enable_parent_buff).toBe(false);
  });
});
