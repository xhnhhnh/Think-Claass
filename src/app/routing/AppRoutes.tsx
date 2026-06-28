import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import PrivateRoute from '@/app/routing/PrivateRoute';
import FeatureRouteGuard from '@/components/FeatureRouteGuard';
import { ADMIN_PATH } from '@/constants';

const AdminLayout = lazy(() => import('@/components/Layout/AdminLayout'));
const ParentLayout = lazy(() => import('@/components/Layout/ParentLayout'));
const StudentLayout = lazy(() => import('@/components/Layout/StudentLayout'));
const TeacherLayout = lazy(() => import('@/components/Layout/TeacherLayout'));
const Activate = lazy(() => import('@/features/auth/pages/ActivatePage'));
const Payment = lazy(() => import('@/pages/Payment'));
const AdminAnnouncements = lazy(() => import('@/features/admin/pages/AdminAnnouncementsPage'));
const AdminArticles = lazy(() => import('@/features/admin/pages/AdminArticlesPage'));
const AdminAuditLogs = lazy(() => import('@/features/admin/pages/AdminAuditLogsPage'));
const AdminCodes = lazy(() => import('@/features/admin/pages/AdminCodesPage'));
const AdminDashboard = lazy(() => import('@/pages/Admin/Dashboard'));
const AdminLogin = lazy(() => import('@/pages/Admin/Login'));
const AdminOpenApi = lazy(() => import('@/features/admin/pages/AdminOpenApiPage'));
const AdminSettings = lazy(() => import('@/pages/Admin/Settings'));
const AdminSystemReset = lazy(() => import('@/pages/Admin/SystemReset'));
const AdminTeachers = lazy(() => import('@/features/admin/pages/AdminTeachersPage'));
const AdminWebsite = lazy(() => import('@/features/admin/pages/AdminWebsitePage'));
const HomeAbout = lazy(() => import('@/features/portal/pages/AboutPage'));
const HomeContact = lazy(() => import('@/features/portal/pages/ContactPage'));
const HomeNews = lazy(() => import('@/features/portal/pages/NewsPage'));
const HomeServices = lazy(() => import('@/features/portal/pages/ServicesPage'));
const Home = lazy(() => import('@/features/portal/pages/HomePage'));
const Login = lazy(() => import('@/features/auth/pages/LoginPage'));
const ParentAssignments = lazy(() => import('@/pages/Parent/Assignments'));
const ParentCommunication = lazy(() => import('@/features/engagement/pages/ParentCommunicationPage'));
const ParentDashboard = lazy(() => import('@/pages/Parent/Dashboard'));
const ParentLeaveRequest = lazy(() => import('@/pages/Parent/LeaveRequest'));
const ParentReport = lazy(() => import('@/pages/Parent/Report'));
const ParentTasks = lazy(() => import('@/pages/Parent/Tasks'));
const StudentAchievements = lazy(() => import('@/features/classroom/pages/StudentAchievementsPage'));
const StudentAssignments = lazy(() => import('@/features/learning/pages/StudentAssignmentsPage'));
const StudentAuction = lazy(() => import('@/features/marketplace/pages/StudentAuctionPage'));
const StudentBank = lazy(() => import('@/features/economy/pages/StudentBankPage'));
const StudentBrawl = lazy(() => import('@/features/battles/pages/StudentBrawlPage'));
const StudentCertificates = lazy(() => import('@/features/engagement/pages/StudentCertificatesPage'));
const StudentChallenge = lazy(() => import('@/features/challenge/pages/StudentChallengePage'));
const StudentDungeon = lazy(() => import('@/features/dungeon/pages/StudentDungeonPage'));
const StudentGacha = lazy(() => import('@/features/gacha/pages/StudentGachaPage'));
const StudentGuildPK = lazy(() => import('@/features/classroom/pages/StudentGuildPKPage'));
const StudentInteractiveWall = lazy(() => import('@/features/engagement/pages/StudentInteractiveWallPage'));
const StudentLuckyDraw = lazy(() => import('@/features/engagement/pages/StudentLuckyDrawPage'));
const StudentMyRedemptions = lazy(() => import('@/features/engagement/pages/StudentMyRedemptionsPage'));
const StudentPaperAttempt = lazy(() => import('@/features/learning/pages/StudentPaperAttemptPage'));
const StudentPapers = lazy(() => import('@/features/learning/pages/StudentPapersPage'));
const StudentPeerReview = lazy(() => import('@/features/engagement/pages/StudentPeerReviewPage'));
const StudentPet = lazy(() => import('@/features/pet/pages/StudentPetPage'));
const StudentPlan = lazy(() => import('@/features/learning/pages/StudentPlanPage'));
const StudentShop = lazy(() => import('@/features/marketplace/pages/StudentShopPage'));
const StudentTaskTree = lazy(() => import('@/features/collaboration/pages/StudentTaskTreePage'));
const StudentTeamQuests = lazy(() => import('@/features/collaboration/pages/StudentTeamQuestsPage'));
const StudentTerritory = lazy(() => import('@/features/slg/pages/StudentTerritoryPage'));
const StudentWrongQuestions = lazy(() => import('@/features/learning/pages/StudentWrongQuestionsPage'));
const AddStudent = lazy(() => import('@/features/classroom/pages/TeacherAddStudentPage'));
const TeacherAnalysis = lazy(() => import('@/pages/Teacher/Analysis'));
const TeacherAssignments = lazy(() => import('@/features/learning/pages/TeacherAssignmentsPage'));
const TeacherAttendance = lazy(() => import('@/pages/Teacher/Attendance'));
const TeacherAuction = lazy(() => import('@/features/marketplace/pages/TeacherAuctionPage'));
const TeacherBigscreen = lazy(() => import('@/features/classroom/pages/TeacherBigscreenPage'));
const TeacherBlindBox = lazy(() => import('@/features/marketplace/pages/TeacherBlindBoxPage'));
const TeacherBrawl = lazy(() => import('@/features/battles/pages/TeacherBrawlPage'));
const TeacherCertificates = lazy(() => import('@/features/engagement/pages/TeacherCertificatesPage'));
const TeacherCommunication = lazy(() => import('@/features/engagement/pages/TeacherCommunicationPage'));
const TeacherDashboard = lazy(() => import('@/features/classroom/pages/TeacherDashboardPage'));
const TeacherExams = lazy(() => import('@/features/learning/pages/TeacherExamsPage'));
const TeacherFeatures = lazy(() => import('@/pages/Teacher/Features'));
const TeacherEconomy = lazy(() => import('@/features/economy/pages/TeacherEconomyPage'));
const TeacherKnowledgeGraph = lazy(() => import('@/features/learning/pages/TeacherKnowledgeGraphPage'));
const TeacherLuckyDrawConfig = lazy(() => import('@/features/engagement/pages/TeacherLuckyDrawConfigPage'));
const TeacherPaperEditor = lazy(() => import('@/features/learning/pages/TeacherPaperEditorPage'));
const TeacherPapers = lazy(() => import('@/features/learning/pages/TeacherPapersPage'));
const TeacherPets = lazy(() => import('@/features/pet/pages/TeacherPetsPage'));
const TeacherRecords = lazy(() => import('@/features/classroom/pages/TeacherRecordsPage'));
const TeacherSettings = lazy(() => import('@/features/classroom/pages/TeacherSettingsPage'));
const TeacherShop = lazy(() => import('@/features/marketplace/pages/TeacherShopPage'));
const TeacherTaskTree = lazy(() => import('@/features/collaboration/pages/TeacherTaskTreePage'));
const TeacherTeamQuests = lazy(() => import('@/features/collaboration/pages/TeacherTeamQuestsPage'));
const TeacherTerritory = lazy(() => import('@/features/slg/pages/TeacherTerritoryPage'));
const TeacherTools = lazy(() => import('@/features/classroom/pages/TeacherToolsPage'));
const TeacherVerification = lazy(() => import('@/pages/Teacher/Verification'));
const TeacherWorldBoss = lazy(() => import('@/features/challenge/pages/TeacherWorldBossPage'));

function RouteLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      正在加载...
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingState />}>
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
    </Suspense>
  );
}
