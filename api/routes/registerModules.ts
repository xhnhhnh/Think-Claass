import type { Application } from 'express';

import authRoutes from './auth.js';
import studentRoutes from './student.js';
import classRoutes from './class.js';
import petRoutes from './pet.js';
import shopRoutes from './shop.js';
import presetRoutes from './presets.js';
import groupRoutes from './groups.js';
import praiseRoutes from './praises.js';
import announcementRoutes from './announcements.js';
import settingsRoutes from './settings.js';
import certificateRoutes from './certificates.js';
import messageRoutes from './messages.js';
import familyTaskRoutes from './familyTasks.js';
import classAnnouncementRoutes from './classAnnouncements.js';
import systemRoutes from './system.js';
import luckyDrawRoutes from './lucky_draw.js';
import redemptionRoutes from './redemption.js';
import openapiRoutes from './openapi.js';
import challengeRoutes from './challenge.js';
import websiteRoutes from './website.js';
import assignmentRoutes from './assignments.js';
import examRoutes from './exams.js';
import attendanceRoutes from './attendance.js';
import leaveRoutes from './leaves.js';
import teamQuestRoutes from './teamQuests.js';
import peerReviewRoutes from './peerReviews.js';
import auditLogRoutes from './auditLogs.js';
import parentBuffRoutes from './parentBuff.js';
import taskTreeRoutes from './taskTree.js';
import danmakuRoutes from './danmaku.js';
import battleRoutes from './battles.js';
import slgRoutes from './slg.js';
import gachaRoutes from './gacha.js';
import economyRoutes from './economy.js';
import dungeonRoutes from './dungeon.js';
import paymentRoutes from './payment.js';
import analyticsRoutes from './analytics.js';
import paperRoutes from './papers.js';
import knowledgeRoutes from './knowledge.js';
import paperSubmissionRoutes from './paperSubmissions.js';
import wrongQuestionRoutes from './wrongQuestions.js';
import studyPlanRoutes from './studyPlans.js';
import { createAdminModule } from '../modules/admin/admin.module.js';

const legacyRoutes: Array<[string, any]> = [
  ['/api/auth', authRoutes],
  ['/api/students', studentRoutes],
  ['/api/classes', classRoutes],
  ['/api/class', classRoutes],
  ['/api/pets', petRoutes],
  ['/api/shop', shopRoutes],
  ['/api/presets', presetRoutes],
  ['/api/groups', groupRoutes],
  ['/api/praises', praiseRoutes],
  ['/api/announcements', announcementRoutes],
  ['/api/settings', settingsRoutes],
  ['/api/certificates', certificateRoutes],
  ['/api/messages', messageRoutes],
  ['/api/family-tasks', familyTaskRoutes],
  ['/api/class-announcements', classAnnouncementRoutes],
  ['/api/system', systemRoutes],
  ['/api/lucky-draw', luckyDrawRoutes],
  ['/api/redemption', redemptionRoutes],
  ['/api/openapi', openapiRoutes],
  ['/api/challenge', challengeRoutes],
  ['/api/website', websiteRoutes],
  ['/api/assignments', assignmentRoutes],
  ['/api/exams', examRoutes],
  ['/api/attendance', attendanceRoutes],
  ['/api/leaves', leaveRoutes],
  ['/api/team-quests', teamQuestRoutes],
  ['/api/peer-reviews', peerReviewRoutes],
  ['/api/audit-logs', auditLogRoutes],
  ['/api/parent-buff', parentBuffRoutes],
  ['/api/task-tree', taskTreeRoutes],
  ['/api/danmaku', danmakuRoutes],
  ['/api/battles', battleRoutes],
  ['/api/slg', slgRoutes],
  ['/api/gacha', gachaRoutes],
  ['/api/economy', economyRoutes],
  ['/api/dungeon', dungeonRoutes],
  ['/api/payment', paymentRoutes],
  ['/api/analytics', analyticsRoutes],
  ['/api/papers', paperRoutes],
  ['/api/knowledge', knowledgeRoutes],
  ['/api/paper-submissions', paperSubmissionRoutes],
  ['/api/wrong-questions', wrongQuestionRoutes],
  ['/api/study-plans', studyPlanRoutes],
];

export function registerApiRoutes(app: Application) {
  app.use('/api/admin', createAdminModule());

  for (const [prefix, routeModule] of legacyRoutes) {
    app.use(prefix, routeModule);
  }
}
