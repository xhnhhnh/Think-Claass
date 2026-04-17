import crypto from 'crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '../../prismaClient.js';
import { ApiError } from '../../utils/asyncHandler.js';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type ActivationCodeListItem,
  type AdminActor,
  type AdminAnnouncementListItem,
  type GenerateActivationCodesInput,
  type GenerateActivationCodesResult,
  type SystemSettings,
  type TeacherDeleteResult,
  type TeacherDetail,
  type TeacherListItem,
  type UpsertAdminAnnouncementInput,
  type UpsertTeacherInput,
} from '../../../src/shared/admin/contracts.js';
import type { AdminRepository, PreservedSuperadmin } from './admin.types.js';

const SYSTEM_SETTING_KEYS = Object.keys(DEFAULT_SYSTEM_SETTINGS) as Array<keyof SystemSettings>;

type AdminMutationActor = { id: number | null; role: string | null };
type AdminTransaction = Prisma.TransactionClient;

function mapSettingsRows(rows: Array<{ key: string; value: string | null }>): SystemSettings {
  const nextSettings: SystemSettings = { ...DEFAULT_SYSTEM_SETTINGS };

  for (const row of rows) {
    if (row.key in nextSettings) {
      nextSettings[row.key as keyof SystemSettings] = row.value ?? DEFAULT_SYSTEM_SETTINGS[row.key as keyof SystemSettings];
    }
  }

  return nextSettings;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))];
}

function mapTeacherRecord(user: { id: number; username: string; is_activated: number | null }): TeacherDetail {
  return {
    id: user.id,
    username: user.username,
    role: 'teacher',
    isActivated: Boolean(user.is_activated),
  };
}

function mapAnnouncementRecord(record: {
  id: number;
  title: string;
  content: string;
  created_at: Date | null;
  is_active: number | null;
}): AdminAnnouncementListItem {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    createdAt: toIsoString(record.created_at),
    isActive: record.is_active === 1,
  };
}

function mapActivationCodeRecord(
  code: {
    id: number;
    code: string;
    status: string | null;
    used_by: number | null;
    created_at: Date | null;
    used_at: Date | null;
    users: { username: string } | null;
  },
  activationEventMap: Map<string, { source: string; remark: string | null }>,
): ActivationCodeListItem {
  const activationEvent = activationEventMap.get(code.code);

  return {
    id: code.id,
    code: code.code,
    status: code.status ?? 'unused',
    usedByUserId: code.used_by ?? null,
    usedByUsername: code.users?.username ?? null,
    createdAt: toIsoString(code.created_at),
    usedAt: toIsoString(code.used_at),
    activationSource: activationEvent?.source ?? null,
    activationRemark: activationEvent?.remark ?? null,
  };
}

async function logAdminMutation(
  tx: AdminTransaction,
  actor: AdminMutationActor,
  action: string,
  details: string,
  ipAddress: string,
) {
  await tx.operation_logs.create({
    data: {
      teacher_id: null,
      user_id: actor.id,
      role: actor.role,
      action,
      details,
      ip_address: ipAddress || null,
    },
  });
}

async function buildActivationEventMap(codes: string[]) {
  if (codes.length === 0) {
    return new Map<string, { source: string; remark: string | null }>();
  }

  const events = await prisma.activation_events.findMany({
    where: {
      activation_code: { in: codes },
    },
    select: {
      activation_code: true,
      source: true,
      remark: true,
      created_at: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  const map = new Map<string, { source: string; remark: string | null }>();

  for (const event of events) {
    if (!event.activation_code || map.has(event.activation_code)) {
      continue;
    }

    map.set(event.activation_code, {
      source: event.source,
      remark: event.remark ?? null,
    });
  }

  return map;
}

async function createUniqueActivationCodes(tx: AdminTransaction, count: number) {
  const codes: string[] = [];
  const generated = new Set<string>();

  while (codes.length < count) {
    const candidate = `TC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    if (generated.has(candidate)) {
      continue;
    }

    const existing = await tx.activation_codes.findUnique({
      where: { code: candidate },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    generated.add(candidate);
    codes.push(candidate);
  }

  return codes;
}

async function deleteTeacherCascade(
  tx: AdminTransaction,
  teacherId: number,
  actor: AdminMutationActor,
  ipAddress: string,
): Promise<TeacherDeleteResult> {
  const teacher = await tx.users.findFirst({
    where: { id: teacherId, role: 'teacher' },
    select: {
      id: true,
      username: true,
    },
  });

  if (!teacher) {
    throw new ApiError(404, '教师不存在');
  }

  const classes = await tx.classes.findMany({
    where: { teacher_id: teacherId },
    select: { id: true },
  });
  const classIds = classes.map((item) => item.id);

  const students = classIds.length
    ? await tx.students.findMany({
        where: { class_id: { in: classIds } },
        select: { id: true, user_id: true },
      })
    : [];
  const studentIds = students.map((item) => item.id);
  const studentUserIds = uniqueNumbers(students.map((item) => item.user_id));
  const affectedUserIds = uniqueNumbers([teacherId, ...studentUserIds]);

  const [assignmentIds, examIds, teamQuestIds, paperIds, questionIds, stockIds] = await Promise.all([
    tx.assignments
      .findMany({
        where: {
          OR: [{ teacher_id: teacherId }, ...(classIds.length ? [{ class_id: { in: classIds } }] : [])],
        },
        select: { id: true },
      })
      .then((rows) => rows.map((row) => row.id)),
    tx.exams
      .findMany({
        where: {
          OR: [{ teacher_id: teacherId }, ...(classIds.length ? [{ class_id: { in: classIds } }] : [])],
        },
        select: { id: true },
      })
      .then((rows) => rows.map((row) => row.id)),
    tx.team_quests
      .findMany({
        where: {
          OR: [{ teacher_id: teacherId }, ...(classIds.length ? [{ class_id: { in: classIds } }] : [])],
        },
        select: { id: true },
      })
      .then((rows) => rows.map((row) => row.id)),
    tx.papers
      .findMany({
        where: {
          OR: [{ teacher_id: teacherId }, ...(classIds.length ? [{ class_id: { in: classIds } }] : [])],
        },
        select: { id: true },
      })
      .then((rows) => rows.map((row) => row.id)),
    tx.questions
      .findMany({
        where: { teacher_id: teacherId },
        select: { id: true },
      })
      .then((rows) => rows.map((row) => row.id)),
    classIds.length
      ? tx.stocks
          .findMany({
            where: { class_id: { in: classIds } },
            select: { id: true },
          })
          .then((rows) => rows.map((row) => row.id))
      : Promise.resolve([] as number[]),
  ]);

  const paperItemIds = paperIds.length
    ? await tx.paper_items
        .findMany({
          where: { paper_id: { in: paperIds } },
          select: { id: true },
        })
        .then((rows) => rows.map((row) => row.id))
    : [];

  const rubricPointIds = paperItemIds.length
    ? await tx.rubric_points
        .findMany({
          where: { paper_item_id: { in: paperItemIds } },
          select: { id: true },
        })
        .then((rows) => rows.map((row) => row.id))
    : [];

  const paperSubmissionIds =
    paperIds.length || studentIds.length
      ? await tx.paper_submissions
          .findMany({
            where: {
              OR: [
                ...(paperIds.length ? [{ paper_id: { in: paperIds } }] : []),
                ...(studentIds.length ? [{ student_id: { in: studentIds } }] : []),
              ],
            },
            select: { id: true },
          })
          .then((rows) => rows.map((row) => row.id))
      : [];

  const paperAnswerIds =
    paperSubmissionIds.length || paperItemIds.length
      ? await tx.paper_answers
          .findMany({
            where: {
              OR: [
                ...(paperSubmissionIds.length ? [{ submission_id: { in: paperSubmissionIds } }] : []),
                ...(paperItemIds.length ? [{ paper_item_id: { in: paperItemIds } }] : []),
              ],
            },
            select: { id: true },
          })
          .then((rows) => rows.map((row) => row.id))
      : [];

  const wrongQuestionIds =
    questionIds.length || studentIds.length
      ? await tx.wrong_questions
          .findMany({
            where: {
              OR: [
                ...(studentIds.length ? [{ student_id: { in: studentIds } }] : []),
                ...(questionIds.length ? [{ question_id: { in: questionIds } }] : []),
              ],
            },
            select: { id: true },
          })
          .then((rows) => rows.map((row) => row.id))
      : [];

  const studyPlanIds = studentIds.length
    ? await tx.study_plans
        .findMany({
          where: { student_id: { in: studentIds } },
          select: { id: true },
        })
        .then((rows) => rows.map((row) => row.id))
    : [];

  const paymentOrderIds = affectedUserIds.length
    ? await tx.payment_orders
        .findMany({
          where: { user_id: { in: affectedUserIds } },
          select: { id: true },
        })
        .then((rows) => rows.map((row) => row.id))
    : [];

  if (paperAnswerIds.length || rubricPointIds.length) {
    await tx.rubric_point_scores.deleteMany({
      where: {
        OR: [
          ...(paperAnswerIds.length ? [{ answer_id: { in: paperAnswerIds } }] : []),
          ...(rubricPointIds.length ? [{ rubric_point_id: { in: rubricPointIds } }] : []),
        ],
      },
    });
  }

  if (paperAnswerIds.length) {
    await tx.paper_answers.deleteMany({ where: { id: { in: paperAnswerIds } } });
  }
  if (rubricPointIds.length) {
    await tx.rubric_points.deleteMany({ where: { id: { in: rubricPointIds } } });
  }
  if (paperSubmissionIds.length) {
    await tx.paper_submissions.deleteMany({ where: { id: { in: paperSubmissionIds } } });
  }
  if (paperItemIds.length) {
    await tx.paper_items.deleteMany({ where: { id: { in: paperItemIds } } });
  }
  if (paperIds.length) {
    await tx.papers.deleteMany({ where: { id: { in: paperIds } } });
  }

  if (wrongQuestionIds.length) {
    await tx.wrong_question_attempts.deleteMany({ where: { wrong_question_id: { in: wrongQuestionIds } } });
    await tx.wrong_questions.deleteMany({ where: { id: { in: wrongQuestionIds } } });
  }
  if (studyPlanIds.length) {
    await tx.study_plan_items.deleteMany({ where: { plan_id: { in: studyPlanIds } } });
    await tx.study_plans.deleteMany({ where: { id: { in: studyPlanIds } } });
  }

  if (assignmentIds.length || studentIds.length) {
    await tx.student_assignments.deleteMany({
      where: {
        OR: [
          ...(assignmentIds.length ? [{ assignment_id: { in: assignmentIds } }] : []),
          ...(studentIds.length ? [{ student_id: { in: studentIds } }] : []),
        ],
      },
    });
    await tx.peer_reviews.deleteMany({
      where: {
        OR: [
          ...(assignmentIds.length ? [{ assignment_id: { in: assignmentIds } }] : []),
          ...(studentIds.length ? [{ reviewer_id: { in: studentIds } }, { reviewee_id: { in: studentIds } }] : []),
        ],
      },
    });
  }
  if (assignmentIds.length) {
    await tx.assignments.deleteMany({ where: { id: { in: assignmentIds } } });
  }

  if (examIds.length || studentIds.length) {
    await tx.student_exams.deleteMany({
      where: {
        OR: [
          ...(examIds.length ? [{ exam_id: { in: examIds } }] : []),
          ...(studentIds.length ? [{ student_id: { in: studentIds } }] : []),
        ],
      },
    });
  }
  if (examIds.length) {
    await tx.exams.deleteMany({ where: { id: { in: examIds } } });
  }

  if (teamQuestIds.length || studentIds.length) {
    await tx.team_quest_progress.deleteMany({
      where: {
        OR: [
          ...(teamQuestIds.length ? [{ quest_id: { in: teamQuestIds } }] : []),
          ...(studentIds.length ? [{ student_id: { in: studentIds } }] : []),
        ],
      },
    });
  }
  if (teamQuestIds.length) {
    await tx.team_quests.deleteMany({ where: { id: { in: teamQuestIds } } });
  }

  if (stockIds.length || studentIds.length) {
    await tx.student_stocks.deleteMany({
      where: {
        OR: [
          ...(stockIds.length ? [{ stock_id: { in: stockIds } }] : []),
          ...(studentIds.length ? [{ student_id: { in: studentIds } }] : []),
        ],
      },
    });
  }
  if (stockIds.length) {
    await tx.stocks.deleteMany({ where: { id: { in: stockIds } } });
  }

  if (studentIds.length || classIds.length) {
    await tx.attendance_records.deleteMany({
      where: {
        OR: [
          ...(studentIds.length ? [{ student_id: { in: studentIds } }] : []),
          ...(classIds.length ? [{ class_id: { in: classIds } }] : []),
        ],
      },
    });
  }
  if (studentIds.length) {
    await tx.bank_accounts.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.certificates.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.challenge_records.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.dungeon_runs.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.family_tasks.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.leave_requests.deleteMany({
      where: {
        OR: [{ student_id: { in: studentIds } }, { reviewer_id: teacherId }],
      },
    });
    await tx.parent_activity.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.parent_students.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.pets.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.records.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.redemption_tickets.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.student_pets.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.student_task_nodes.deleteMany({ where: { student_id: { in: studentIds } } });
    await tx.user_achievements.deleteMany({ where: { student_id: { in: studentIds } } });
  } else {
    await tx.leave_requests.deleteMany({ where: { reviewer_id: teacherId } });
  }

  if (studentIds.length || classIds.length) {
    await tx.messages.deleteMany({
      where: {
        OR: [
          ...(studentIds.length ? [{ receiver_id: { in: studentIds } }] : []),
          ...(classIds.length ? [{ class_id: { in: classIds } }] : []),
        ],
      },
    });
    await tx.notes.deleteMany({
      where: {
        OR: [
          { teacher_id: teacherId },
          ...(studentIds.length ? [{ student_id: { in: studentIds } }] : []),
          ...(classIds.length ? [{ class_id: { in: classIds } }] : []),
        ],
      },
    });
    await tx.praises.deleteMany({
      where: {
        OR: [{ teacher_id: teacherId }, ...(studentIds.length ? [{ student_id: { in: studentIds } }] : [])],
      },
    });
  } else {
    await tx.notes.deleteMany({ where: { teacher_id: teacherId } });
    await tx.praises.deleteMany({ where: { teacher_id: teacherId } });
  }

  if (classIds.length) {
    await tx.class_announcements.deleteMany({
      where: {
        OR: [{ teacher_id: teacherId }, { class_id: { in: classIds } }],
      },
    });
    await tx.class_battles.deleteMany({
      where: {
        OR: [
          { initiator_class_id: { in: classIds } },
          { target_class_id: { in: classIds } },
          { winner_class_id: { in: classIds } },
        ],
      },
    });
    await tx.class_resources.deleteMany({ where: { class_id: { in: classIds } } });
    await tx.danmaku_messages.deleteMany({ where: { class_id: { in: classIds } } });
    await tx.gacha_pools.deleteMany({ where: { class_id: { in: classIds } } });
    await tx.territories.deleteMany({ where: { class_id: { in: classIds } } });
  } else {
    await tx.class_announcements.deleteMany({ where: { teacher_id: teacherId } });
  }

  if (studentIds.length) {
    await tx.students.deleteMany({ where: { id: { in: studentIds } } });
  }
  if (classIds.length) {
    await tx.student_groups.deleteMany({ where: { class_id: { in: classIds } } });
    await tx.task_nodes.deleteMany({ where: { class_id: { in: classIds } } });
    await tx.classes.deleteMany({ where: { id: { in: classIds } } });
  }

  await tx.lucky_draw_config.deleteMany({ where: { teacher_id: teacherId } });
  await tx.operation_logs.deleteMany({
    where: {
      OR: [
        { teacher_id: teacherId },
        ...(affectedUserIds.length ? [{ user_id: { in: affectedUserIds } }] : []),
      ],
    },
  });
  await tx.point_presets.deleteMany({ where: { teacher_id: teacherId } });
  await tx.question_bank.deleteMany({ where: { teacher_id: teacherId } });
  if (questionIds.length) {
    await tx.questions.deleteMany({ where: { id: { in: questionIds } } });
  }
  await tx.shop_items.deleteMany({ where: { teacher_id: teacherId } });

  if (paymentOrderIds.length) {
    await tx.payment_transactions.deleteMany({ where: { order_id: { in: paymentOrderIds } } });
  }
  if (affectedUserIds.length) {
    await tx.activation_events.deleteMany({ where: { user_id: { in: affectedUserIds } } });
    await tx.payment_orders.deleteMany({ where: { user_id: { in: affectedUserIds } } });
    await tx.activation_codes.updateMany({
      where: { used_by: { in: affectedUserIds } },
      data: { used_by: null },
    });
  }

  if (studentUserIds.length) {
    await tx.users.deleteMany({ where: { id: { in: studentUserIds } } });
  }
  await tx.users.delete({ where: { id: teacherId } });

  const message = `教师 ${teacher.username} 及其相关班级和学生数据已删除`;
  await logAdminMutation(
    tx,
    actor,
    'ADMIN_DELETE_TEACHER',
    JSON.stringify({
      teacherId,
      teacherUsername: teacher.username,
      deletedClasses: classIds.length,
      deletedStudents: studentIds.length,
      deletedStudentUsers: studentUserIds.length,
    }),
    ipAddress,
  );

  return {
    message,
    deletedTeacherId: teacherId,
    deletedClasses: classIds.length,
    deletedStudents: studentIds.length,
    deletedStudentUsers: studentUserIds.length,
  };
}

export class PrismaAdminRepository implements AdminRepository {
  async findAdminByCredentials(username: string, password: string): Promise<AdminActor | null> {
    const user = await prisma.users.findFirst({
      where: {
        username,
        password_hash: password,
        role: { in: ['admin', 'superadmin'] },
      },
      select: {
        id: true,
        role: true,
        username: true,
      },
    });

    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return null;
    }

    return {
      id: user.id,
      role: user.role,
      username: user.username,
    };
  }

  async getSystemDatabaseStats() {
    const [
      teachers,
      students,
      classes,
      totalActivity,
      totalAssignments,
      totalLeaves,
      totalTeamQuests,
      totalPointsRow,
    ] = await Promise.all([
      prisma.users.count({ where: { role: 'teacher' } }),
      prisma.users.count({ where: { role: 'student' } }),
      prisma.classes.count(),
      prisma.records.count(),
      prisma.assignments.count(),
      prisma.leave_requests.count(),
      prisma.team_quests.count(),
      prisma.pets.aggregate({ _sum: { experience: true } }),
    ]);

    return {
      totalUsers: teachers + students,
      teachers,
      students,
      classes,
      totalActivity,
      totalAssignments,
      totalLeaves,
      totalTeamQuests,
      totalPoints: totalPointsRow._sum.experience ?? 0,
    };
  }

  async getSystemSettings(): Promise<SystemSettings> {
    const rows = await prisma.settings.findMany({
      where: {
        key: { in: SYSTEM_SETTING_KEYS },
      },
      select: {
        key: true,
        value: true,
      },
    });

    return mapSettingsRows(rows);
  }

  async saveSystemSettings(input: Partial<SystemSettings>): Promise<SystemSettings> {
    const updates = SYSTEM_SETTING_KEYS
      .filter((key) => input[key] !== undefined)
      .map((key) => ({
        key,
        value: String(input[key]),
      }));

    for (const update of updates) {
      await prisma.settings.upsert({
        where: { key: update.key },
        update: { value: update.value },
        create: { key: update.key, value: update.value },
      });
    }

    return this.getSystemSettings();
  }

  async listTeachers(): Promise<TeacherListItem[]> {
    const teachers = await prisma.users.findMany({
      where: { role: 'teacher' },
      select: {
        id: true,
        username: true,
        is_activated: true,
      },
      orderBy: { id: 'asc' },
    });

    return teachers.map(mapTeacherRecord);
  }

  async createTeacher(input: UpsertTeacherInput, actor: AdminMutationActor, ipAddress: string): Promise<TeacherDetail> {
    try {
      return await prisma.$transaction(async (tx) => {
        const teacher = await tx.users.create({
          data: {
            role: 'teacher',
            username: input.username,
            password_hash: input.password ?? '',
            is_activated: 1,
          },
          select: {
            id: true,
            username: true,
            is_activated: true,
          },
        });

        await logAdminMutation(
          tx,
          actor,
          'ADMIN_CREATE_TEACHER',
          JSON.stringify({ teacherId: teacher.id, username: teacher.username }),
          ipAddress,
        );

        return mapTeacherRecord(teacher);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(400, '用户名已存在');
      }
      throw error;
    }
  }

  async updateTeacher(id: number, input: UpsertTeacherInput, actor: AdminMutationActor, ipAddress: string): Promise<TeacherDetail> {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.users.findFirst({
          where: { id, role: 'teacher' },
          select: { id: true },
        });

        if (!existing) {
          throw new ApiError(404, '教师不存在');
        }

        const teacher = await tx.users.update({
          where: { id },
          data: {
            username: input.username,
            ...(input.password ? { password_hash: input.password } : {}),
          },
          select: {
            id: true,
            username: true,
            is_activated: true,
          },
        });

        await logAdminMutation(
          tx,
          actor,
          'ADMIN_UPDATE_TEACHER',
          JSON.stringify({ teacherId: teacher.id, username: teacher.username, passwordUpdated: Boolean(input.password) }),
          ipAddress,
        );

        return mapTeacherRecord(teacher);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(400, '用户名已存在');
      }
      throw error;
    }
  }

  async deleteTeacher(id: number, actor: AdminMutationActor, ipAddress: string): Promise<TeacherDeleteResult> {
    return prisma.$transaction((tx) => deleteTeacherCascade(tx, id, actor, ipAddress));
  }

  async listActivationCodes(): Promise<ActivationCodeListItem[]> {
    const codes = await prisma.activation_codes.findMany({
      select: {
        id: true,
        code: true,
        status: true,
        used_by: true,
        created_at: true,
        used_at: true,
        users: {
          select: {
            username: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    const activationEventMap = await buildActivationEventMap(codes.map((code) => code.code));
    return codes.map((code) => mapActivationCodeRecord(code, activationEventMap));
  }

  async generateActivationCodes(
    input: GenerateActivationCodesInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): Promise<GenerateActivationCodesResult> {
    return prisma.$transaction(async (tx) => {
      const createdCodes = await createUniqueActivationCodes(tx, input.count);

      for (const code of createdCodes) {
        await tx.activation_codes.create({
          data: {
            code,
            status: 'unused',
          },
        });
      }

      await logAdminMutation(
        tx,
        actor,
        'ADMIN_GENERATE_ACTIVATION_CODES',
        JSON.stringify({ count: input.count, codes: createdCodes }),
        ipAddress,
      );

      const persisted = await tx.activation_codes.findMany({
        where: { code: { in: createdCodes } },
        select: {
          id: true,
          code: true,
          status: true,
          used_by: true,
          created_at: true,
          used_at: true,
          users: {
            select: {
              username: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      const activationEventMap = await buildActivationEventMap(createdCodes);

      return {
        message: `成功生成 ${createdCodes.length} 个激活码`,
        createdCount: createdCodes.length,
        codes: persisted.map((code) => mapActivationCodeRecord(code, activationEventMap)),
      };
    });
  }

  async listAnnouncements(): Promise<AdminAnnouncementListItem[]> {
    const announcements = await prisma.announcements.findMany({
      select: {
        id: true,
        title: true,
        content: true,
        created_at: true,
        is_active: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return announcements.map(mapAnnouncementRecord);
  }

  async createAnnouncement(
    input: UpsertAdminAnnouncementInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): Promise<AdminAnnouncementListItem> {
    return prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await tx.announcements.updateMany({
          data: { is_active: 0 },
        });
      }

      const announcement = await tx.announcements.create({
        data: {
          title: input.title,
          content: input.content,
          is_active: input.isActive ? 1 : 0,
        },
        select: {
          id: true,
          title: true,
          content: true,
          created_at: true,
          is_active: true,
        },
      });

      await logAdminMutation(
        tx,
        actor,
        'ADMIN_CREATE_ANNOUNCEMENT',
        JSON.stringify({ announcementId: announcement.id, isActive: input.isActive }),
        ipAddress,
      );

      return mapAnnouncementRecord(announcement);
    });
  }

  async updateAnnouncement(
    id: number,
    input: UpsertAdminAnnouncementInput,
    actor: AdminMutationActor,
    ipAddress: string,
  ): Promise<AdminAnnouncementListItem> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.announcements.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!existing) {
        throw new ApiError(404, '公告不存在');
      }

      if (input.isActive) {
        await tx.announcements.updateMany({
          where: { NOT: { id } },
          data: { is_active: 0 },
        });
      }

      const announcement = await tx.announcements.update({
        where: { id },
        data: {
          title: input.title,
          content: input.content,
          is_active: input.isActive ? 1 : 0,
        },
        select: {
          id: true,
          title: true,
          content: true,
          created_at: true,
          is_active: true,
        },
      });

      await logAdminMutation(
        tx,
        actor,
        'ADMIN_UPDATE_ANNOUNCEMENT',
        JSON.stringify({ announcementId: announcement.id, isActive: input.isActive }),
        ipAddress,
      );

      return mapAnnouncementRecord(announcement);
    });
  }

  async deleteAnnouncement(id: number, actor: AdminMutationActor, ipAddress: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.announcements.findUnique({
        where: { id },
        select: { id: true, title: true },
      });

      if (!existing) {
        throw new ApiError(404, '公告不存在');
      }

      await tx.announcements.delete({ where: { id } });
      await logAdminMutation(
        tx,
        actor,
        'ADMIN_DELETE_ANNOUNCEMENT',
        JSON.stringify({ announcementId: id, title: existing.title }),
        ipAddress,
      );

      return {
        message: '公告已删除',
      };
    });
  }

  async listSuperadmins(): Promise<PreservedSuperadmin[]> {
    const users = await prisma.users.findMany({
      where: { role: 'superadmin' },
      select: {
        id: true,
        username: true,
        password_hash: true,
        is_activated: true,
      },
      orderBy: { id: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      username: user.username,
      passwordHash: user.password_hash,
      isActivated: user.is_activated ?? 0,
    }));
  }

  async restoreSuperadmins(superadmins: PreservedSuperadmin[]): Promise<void> {
    await prisma.users.deleteMany({ where: { role: 'superadmin' } });

    if (superadmins.length === 0) {
      return;
    }

    await prisma.users.createMany({
      data: superadmins.map((user) => ({
        id: user.id,
        role: 'superadmin',
        username: user.username,
        password_hash: user.passwordHash,
        is_activated: user.isActivated,
      })),
    });
  }
}
