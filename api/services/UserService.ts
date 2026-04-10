import { prisma } from '../prismaClient';

export class UserService {
  static async getAllTeachers() {
    return prisma.users.findMany({
      where: { role: 'teacher' },
      orderBy: { id: 'desc' },
      select: { id: true, username: true, role: true },
    });
  }

  static async findUserByUsername(username: string) {
    return prisma.users.findUnique({
      where: { username },
    });
  }

  static async getSuperAdmins() {
    return prisma.users.findMany({
      where: { role: 'superadmin' },
    });
  }
}
