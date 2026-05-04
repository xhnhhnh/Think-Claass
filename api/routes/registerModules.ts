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
import { createPetModule } from '../modules/pet/pet.module.js';
import { createEconomyModule } from '../modules/economy/economy.module.js';
import { createChallengeModule } from '../modules/challenge/challenge.module.js';
import { createDungeonModule } from '../modules/dungeon/dungeon.module.js';
import { createGachaModule } from '../modules/gacha/gacha.module.js';
import { createBattlesModule } from '../modules/battles/battles.module.js';
import { createSlgModule } from '../modules/slg/slg.module.js';
import { createAssignmentsModule } from '../modules/learning/assignments.module.js';
import { createExamsModule } from '../modules/learning/exams.module.js';
import { createPapersModule } from '../modules/learning/papers.module.js';
import { createPaperSubmissionsModule } from '../modules/learning/paperSubmissions.module.js';
import { createKnowledgeModule } from '../modules/learning/knowledge.module.js';
import { createWrongQuestionsModule } from '../modules/learning/wrongQuestions.module.js';
import { createStudyPlansModule } from '../modules/learning/studyPlans.module.js';
import { createTaskTreeModule } from '../modules/collaboration/taskTree.module.js';
import { createTeamQuestsModule } from '../modules/collaboration/teamQuests.module.js';
import { createPeerReviewsModule } from '../modules/collaboration/peerReviews.module.js';
import { createStudentsModule } from '../modules/classroom/students.module.js';
import { createClassesModule } from '../modules/classroom/classes.module.js';
import { createGroupsModule } from '../modules/classroom/groups.module.js';
import { createPresetsModule } from '../modules/classroom/presets.module.js';
import { createAttendanceModule } from '../modules/classroom/attendance.module.js';
import { createLeavesModule } from '../modules/classroom/leaves.module.js';
import { createAnalyticsModule } from '../modules/insights/analytics.module.js';
import { createMessagesModule } from '../modules/engagement/messages.module.js';
import { createFamilyTasksModule } from '../modules/engagement/familyTasks.module.js';
import { createPraisesModule } from '../modules/engagement/praises.module.js';
import { createCertificatesModule } from '../modules/engagement/certificates.module.js';
import { createRedemptionModule } from '../modules/engagement/redemption.module.js';
import { createLuckyDrawModule } from '../modules/engagement/luckyDraw.module.js';

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
  app.use('/api/pet', createPetModule());
  app.use('/api/economy', createEconomyModule());
  app.use('/api/challenge', createChallengeModule());
  app.use('/api/dungeon', createDungeonModule());
  app.use('/api/gacha', createGachaModule());
  app.use('/api/battles', createBattlesModule());
  app.use('/api/slg', createSlgModule());
  app.use('/api/assignments', createAssignmentsModule());
  app.use('/api/exams', createExamsModule());
  app.use('/api/papers', createPapersModule());
  app.use('/api/paper-submissions', createPaperSubmissionsModule());
  app.use('/api/knowledge', createKnowledgeModule());
  app.use('/api/wrong-questions', createWrongQuestionsModule());
  app.use('/api/study-plans', createStudyPlansModule());
  app.use('/api/task-tree', createTaskTreeModule());
  app.use('/api/team-quests', createTeamQuestsModule());
  app.use('/api/peer-reviews', createPeerReviewsModule());
  app.use('/api/students', createStudentsModule());
  app.use('/api/classes', createClassesModule());
  app.use('/api/class', createClassesModule());
  app.use('/api/groups', createGroupsModule());
  app.use('/api/presets', createPresetsModule());
  app.use('/api/attendance', createAttendanceModule());
  app.use('/api/leaves', createLeavesModule());
  app.use('/api/analytics', createAnalyticsModule());
  app.use('/api/messages', createMessagesModule());
  app.use('/api/family-tasks', createFamilyTasksModule());
  app.use('/api/praises', createPraisesModule());
  app.use('/api/certificates', createCertificatesModule());
  app.use('/api/redemption', createRedemptionModule());
  app.use('/api/lucky-draw', createLuckyDrawModule());

  for (const [prefix, routeModule] of legacyRoutes) {
    app.use(prefix, routeModule);
  }
}
