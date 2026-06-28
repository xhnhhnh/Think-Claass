import { beforeEach, describe, expect, it, vi } from 'vitest';

const adminRepositoryMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createLog: vi.fn(),
  transaction: vi.fn(async (callback: any) =>
    callback({
      users: {
        findFirst: adminRepositoryMocks.findFirst,
        create: adminRepositoryMocks.create,
        update: adminRepositoryMocks.update,
      },
      operation_logs: {
        create: adminRepositoryMocks.createLog,
      },
    }),
  ),
}));

vi.mock('../../prismaClient.js', () => ({
  prisma: {
    $transaction: adminRepositoryMocks.transaction,
    users: {
      findFirst: adminRepositoryMocks.findFirst,
      create: adminRepositoryMocks.create,
      update: adminRepositoryMocks.update,
    },
  },
}));

import { hashPassword } from '../../utils/password';
import { PrismaAdminRepository } from './admin.repository';

describe('PrismaAdminRepository admin authentication', () => {
  beforeEach(() => {
    adminRepositoryMocks.findFirst.mockReset();
    adminRepositoryMocks.create.mockReset();
    adminRepositoryMocks.update.mockReset();
    adminRepositoryMocks.createLog.mockReset();
    adminRepositoryMocks.transaction.mockClear();
  });

  it('authenticates a superadmin stored with a scrypt password hash', async () => {
    const passwordHash = hashPassword('super-secret');
    adminRepositoryMocks.findFirst.mockResolvedValue({
      id: 1,
      role: 'superadmin',
      username: 'superadmin',
      password_hash: passwordHash,
    });

    const repository = new PrismaAdminRepository();
    const user = await repository.findAdminByCredentials('superadmin', 'super-secret');

    expect(adminRepositoryMocks.findFirst).toHaveBeenCalledWith({
      where: {
        username: 'superadmin',
        role: { in: ['admin', 'superadmin'] },
      },
      select: {
        id: true,
        role: true,
        username: true,
        password_hash: true,
      },
    });
    expect(user).toEqual({
      id: 1,
      role: 'superadmin',
      username: 'superadmin',
    });
  });

  it('upgrades a legacy plaintext admin password after successful login', async () => {
    adminRepositoryMocks.findFirst.mockResolvedValue({
      id: 2,
      role: 'admin',
      username: 'ops',
      password_hash: 'legacy-pass',
    });

    const repository = new PrismaAdminRepository();
    const user = await repository.findAdminByCredentials('ops', 'legacy-pass');

    expect(user?.username).toBe('ops');
    expect(adminRepositoryMocks.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { password_hash: expect.stringMatching(/^scrypt\$/) },
    });
  });

  it('rejects an admin user when the password does not match', async () => {
    adminRepositoryMocks.findFirst.mockResolvedValue({
      id: 3,
      role: 'admin',
      username: 'ops',
      password_hash: hashPassword('correct-pass'),
    });

    const repository = new PrismaAdminRepository();
    const user = await repository.findAdminByCredentials('ops', 'wrong-pass');

    expect(user).toBeNull();
    expect(adminRepositoryMocks.update).not.toHaveBeenCalled();
  });

  it('stores a hashed password when creating a teacher from super admin', async () => {
    adminRepositoryMocks.create.mockResolvedValue({
      id: 10,
      username: 'teacher01',
      is_activated: 1,
    });

    const repository = new PrismaAdminRepository();
    const teacher = await repository.createTeacher(
      { username: 'teacher01', password: 'teacher-pass' },
      { id: 1, role: 'superadmin' },
      '127.0.0.1',
    );

    expect(teacher.username).toBe('teacher01');
    expect(adminRepositoryMocks.create).toHaveBeenCalledWith({
      data: {
        role: 'teacher',
        username: 'teacher01',
        password_hash: expect.stringMatching(/^scrypt\$/),
        is_activated: 1,
      },
      select: {
        id: true,
        username: true,
        is_activated: true,
      },
    });
  });

  it('stores a hashed password when updating a teacher password', async () => {
    adminRepositoryMocks.findFirst.mockResolvedValue({ id: 11 });
    adminRepositoryMocks.update.mockResolvedValue({
      id: 11,
      username: 'teacher02',
      is_activated: 1,
    });

    const repository = new PrismaAdminRepository();
    const teacher = await repository.updateTeacher(
      11,
      { username: 'teacher02', password: 'new-pass' },
      { id: 1, role: 'superadmin' },
      '127.0.0.1',
    );

    expect(teacher.username).toBe('teacher02');
    expect(adminRepositoryMocks.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: {
        username: 'teacher02',
        password_hash: expect.stringMatching(/^scrypt\$/),
      },
      select: {
        id: true,
        username: true,
        is_activated: true,
      },
    });
  });
});
