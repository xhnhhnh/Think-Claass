import { Route, Routes } from 'react-router-dom';

import PrivateRoute from '@/app/routing/PrivateRoute';
import FeatureRouteGuard from '@/components/FeatureRouteGuard';
import { ADMIN_PATH } from '@/constants';
import AdminLayout from '@/components/Layout/AdminLayout';
import ParentLayout from '@/components/Layout/ParentLayout';
import StudentLayout from '@/components/Layout/StudentLayout';
import TeacherLayout from '@/components/Layout/TeacherLayout';
import Activate from '@/features/auth/pages/ActivatePage';
import Payment from '@/pages/Payment';
import AdminAnnouncements from '@/features/admin/pages/AdminAnnouncementsPage';
import AdminArticles from '@/features/admin/pages/AdminArticlesPage';
import AdminAuditLogs from '@/features/admin/pages/AdminAuditLogsPage';
import AdminCodes from '@/features/admin/pages/AdminCodesPage';
import AdminDashboard from '@/pages/Admin/Dashboard';
import AdminLogin from '@/pages/Admin/Login';
import AdminOpenApi from '@/features/admin/pages/AdminOpenApiPage';
import AdminSettings from '@/pages/Admin/Settings';
import AdminSystemReset from '@/pages/Admin/SystemReset';
import AdminTeachers from '@/features/admin/pages/AdminTeachersPage';
import AdminWebsite from '@/features/admin/pages/AdminWebsitePage';
import HomeAbout from '@/features/portal/pages/AboutPage';
import HomeContact from '@/features/portal/pages/ContactPage';
import HomeNews from '@/features/portal/pages/NewsPage';
import HomeServices from '@/features/portal/pages/ServicesPage';
import Home from '@/features/portal/pages/HomePage';
import Login from '@/features/auth/pages/LoginPage';
import ParentAssignments from '@/pages/Parent/Assignments';
import ParentCommunication from '@/features/engagement/pages/ParentCommunicationPage';
import ParentDashboard from '@/pages/Parent/Dashboard';
import ParentLeaveRequest from '@/pages/Parent/LeaveRequest';
import ParentReport from '@/pages/Parent/Report';
import ParentTasks from '@/pages/Parent/Tasks';
import StudentAchievements from '@/features/classroom/pages/StudentAchievementsPage';
import StudentAssignments from '@/features/learning/pages/StudentAssignmentsPage';
import StudentAuction from '@/features/marketplace/pages/StudentAuctionPage';
import StudentBank from '@/features/economy/pages/StudentBankPage';
import StudentBrawl from '@/features/battles/pages/StudentBrawlPage';
import StudentCertificates from '@/features/engagement/pages/StudentCertificatesPage';
import StudentChallenge from '@/features/challenge/pages/StudentChallengePage';
import StudentDungeon from '@/features/dungeon/pages/StudentDungeonPage';
import StudentGacha from '@/features/gacha/pages/StudentGachaPage';
import StudentGuildPK from '@/features/classroom/pages/StudentGuildPKPage';
import StudentInteractiveWall from '@/features/engagement/pages/StudentInteractiveWallPage';
import StudentLuckyDraw from '@/features/engagement/pages/StudentLuckyDrawPage';
import StudentMyRedemptions from '@/features/engagement/pages/StudentMyRedemptionsPage';
import StudentPaperAttempt from '@/features/learning/pages/StudentPaperAttemptPage';
import StudentPapers from '@/features/learning/pages/StudentPapersPage';
import StudentPeerReview from '@/features/engagement/pages/StudentPeerReviewPage';
import StudentPet from '@/features/pet/pages/StudentPetPage';
import StudentPlan from '@/features/learning/pages/StudentPlanPage';
import StudentShop from '@/features/marketplace/pages/StudentShopPage';
import StudentTaskTree from '@/features/collaboration/pages/StudentTaskTreePage';
import StudentTeamQuests from '@/features/collaboration/pages/StudentTeamQuestsPage';
import StudentTerritory from '@/features/slg/pages/StudentTerritoryPage';
import StudentWrongQuestions from '@/features/learning/pages/StudentWrongQuestionsPage';
import AddStudent from '@/features/classroom/pages/TeacherAddStudentPage';
import TeacherAnalysis from '@/pages/Teacher/Analysis';
import TeacherAssignments from '@/features/learning/pages/TeacherAssignmentsPage';
import TeacherAttendance from '@/pages/Teacher/Attendance';
import TeacherAuction from '@/features/marketplace/pages/TeacherAuctionPage';
import TeacherBigscreen from '@/features/classroom/pages/TeacherBigscreenPage';
import TeacherBlindBox from '@/features/marketplace/pages/TeacherBlindBoxPage';
import TeacherBrawl from '@/features/battles/pages/TeacherBrawlPage';
import TeacherCertificates from '@/features/engagement/pages/TeacherCertificatesPage';
import TeacherCommunication from '@/features/engagement/pages/TeacherCommunicationPage';
import TeacherDashboard from '@/features/classroom/pages/TeacherDashboardPage';
import TeacherExams from '@/features/learning/pages/TeacherExamsPage';
import TeacherFeatures from '@/pages/Teacher/Features';
import TeacherEconomy from '@/features/economy/pages/TeacherEconomyPage';
import TeacherKnowledgeGraph from '@/features/learning/pages/TeacherKnowledgeGraphPage';
import TeacherLuckyDrawConfig from '@/features/engagement/pages/TeacherLuckyDrawConfigPage';
import TeacherPaperEditor from '@/features/learning/pages/TeacherPaperEditorPage';
import TeacherPapers from '@/features/learning/pages/TeacherPapersPage';
import TeacherPets from '@/features/pet/pages/TeacherPetsPage';
import TeacherRecords from '@/features/classroom/pages/TeacherRecordsPage';
import TeacherSettings from '@/features/classroom/pages/TeacherSettingsPage';
import TeacherShop from '@/features/marketplace/pages/TeacherShopPage';
import TeacherTaskTree from '@/features/collaboration/pages/TeacherTaskTreePage';
import TeacherTeamQuests from '@/features/collaboration/pages/TeacherTeamQuestsPage';
import TeacherTerritory from '@/features/slg/pages/TeacherTerritoryPage';
import TeacherTools from '@/features/classroom/pages/TeacherToolsPage';
import TeacherVerification from '@/pages/Teacher/Verification';
import TeacherWorldBoss from '@/features/challenge/pages/TeacherWorldBossPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/activate" element={<Activate />} />
      <Route path="/payment" element={<Payment />} />

      <Route path="/about" element={<HomeAbout />} />
      <Route path="/contact" element={<HomeContact />} />
      <Route path="/news" element={<HomeNews />} />
      <Route path="/services" element={<HomeServices />} />

      <Route
        path="/teacher"
        element={
          <PrivateRoute allowedRoles={['teacher', 'superadmin']}>
            <TeacherLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="records" element={<TeacherRecords />} />
        <Route path="add-student" element={<AddStudent />} />
        <Route path="shop" element={<TeacherShop />} />
        <Route path="auction" element={<TeacherAuction />} />
        <Route path="task-tree" element={<TeacherTaskTree />} />
        <Route path="brawl" element={<TeacherBrawl />} />
        <Route path="territory" element={<TeacherTerritory />} />
        <Route path="features" element={<TeacherFeatures />} />
        <Route path="bigscreen" element={<TeacherBigscreen />} />
        <Route path="analysis" element={<TeacherAnalysis />} />
        <Route path="communication" element={<TeacherCommunication />} />
        <Route path="lucky-draw-config" element={<TeacherLuckyDrawConfig />} />
        <Route path="tools" element={<TeacherTools />} />
        <Route path="verification" element={<TeacherVerification />} />
        <Route path="assignments" element={<TeacherAssignments />} />
        <Route path="exams" element={<TeacherExams />} />
        <Route path="papers" element={<TeacherPapers />} />
        <Route path="papers/:id/edit" element={<TeacherPaperEditor />} />
        <Route path="knowledge" element={<TeacherKnowledgeGraph />} />
        <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="world-boss" element={<TeacherWorldBoss />} />
        <Route path="economy" element={<TeacherEconomy />} />
        <Route path="blind-box" element={<TeacherBlindBox />} />
        <Route path="pets" element={<TeacherPets />} />
        <Route path="team-quests" element={<TeacherTeamQuests />} />
        <Route path="certificates" element={<TeacherCertificates />} />
        <Route path="settings" element={<TeacherSettings />} />
      </Route>

      <Route
        path="/student"
        element={
          <PrivateRoute allowedRoles={['student']}>
            <StudentLayout />
          </PrivateRoute>
        }
      >
        <Route path="pet" element={<StudentPet />} />
        <Route path="shop" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_shop' }} title="积分商城"><StudentShop /></FeatureRouteGuard>} />
        <Route path="auction" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_auction_blind_box' }} title="拍卖行"><StudentAuction /></FeatureRouteGuard>} />
        <Route path="task-tree" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_task_tree' }} title="技能树"><StudentTaskTree /></FeatureRouteGuard>} />
        <Route path="brawl" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_class_brawl' }} title="大乱斗"><StudentBrawl /></FeatureRouteGuard>} />
        <Route path="territory" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_slg' }} title="版图"><StudentTerritory /></FeatureRouteGuard>} />
        <Route path="gacha" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_gacha' }} title="召唤法阵"><StudentGacha /></FeatureRouteGuard>} />
        <Route path="bank" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_economy' }} title="银行股市"><StudentBank /></FeatureRouteGuard>} />
        <Route path="dungeon" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_dungeon' }} title="无尽塔"><StudentDungeon /></FeatureRouteGuard>} />
        <Route path="challenge" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_challenge' }} title="挑战模式"><StudentChallenge /></FeatureRouteGuard>} />
        <Route path="lucky-draw" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_lucky_draw' }} title="翻牌抽奖"><StudentLuckyDraw /></FeatureRouteGuard>} />
        <Route path="my-redemptions" element={<StudentMyRedemptions />} />
        <Route path="certificates" element={<StudentCertificates />} />
        <Route path="achievements" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_achievements' }} title="成就墙"><StudentAchievements /></FeatureRouteGuard>} />
        <Route path="interactive-wall" element={<FeatureRouteGuard role="student" requirement={{ anyOf: ['enable_chat_bubble', 'enable_tree_hole'] }} title="互动墙"><StudentInteractiveWall /></FeatureRouteGuard>} />
        <Route path="peer-review" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_peer_review' }} title="同伴互评"><StudentPeerReview /></FeatureRouteGuard>} />
        <Route path="guild-pk" element={<FeatureRouteGuard role="student" requirement={{ key: 'enable_guild_pk' }} title="公会PK"><StudentGuildPK /></FeatureRouteGuard>} />
        <Route path="papers" element={<StudentPapers />} />
        <Route path="papers/:id" element={<StudentPaperAttempt />} />
        <Route path="wrong-questions" element={<StudentWrongQuestions />} />
        <Route path="plan" element={<StudentPlan />} />
        <Route path="assignments" element={<StudentAssignments />} />
        <Route path="team-quests" element={<StudentTeamQuests />} />
      </Route>

      <Route
        path="/parent"
        element={
          <PrivateRoute allowedRoles={['parent']}>
            <ParentLayout />
          </PrivateRoute>
        }
      >
        <Route path="dashboard" element={<ParentDashboard />} />
        <Route path="communication" element={<ParentCommunication />} />
        <Route path="report" element={<ParentReport />} />
        <Route path="tasks" element={<FeatureRouteGuard role="parent" requirement={{ key: 'enable_family_tasks' }} title="家庭时光"><ParentTasks /></FeatureRouteGuard>} />
        <Route path="leave-request" element={<ParentLeaveRequest />} />
        <Route path="assignments" element={<ParentAssignments />} />
      </Route>

      <Route path={`${ADMIN_PATH}/login`} element={<AdminLogin />} />
      <Route
        path={ADMIN_PATH}
        element={
          <PrivateRoute allowedRoles={['admin', 'superadmin']}>
            <AdminLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="articles" element={<AdminArticles />} />
        <Route path="website" element={<AdminWebsite />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
        <Route path="teachers" element={<AdminTeachers />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="codes" element={<AdminCodes />} />
        <Route path="openapi" element={<AdminOpenApi />} />
        <Route path="reset" element={<AdminSystemReset />} />
      </Route>
    </Routes>
  );
}
