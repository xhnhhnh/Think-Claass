import { Route, Routes } from 'react-router-dom';

import PrivateRoute from '@/app/routing/PrivateRoute';
import FeatureRouteGuard from '@/components/FeatureRouteGuard';
import { ADMIN_PATH } from '@/constants';
import AdminLayout from '@/components/Layout/AdminLayout';
import ParentLayout from '@/components/Layout/ParentLayout';
import StudentLayout from '@/components/Layout/StudentLayout';
import TeacherLayout from '@/components/Layout/TeacherLayout';
import Activate from '@/pages/Activate';
import Payment from '@/pages/Payment';
import AdminAnnouncements from '@/pages/Admin/Announcements';
import AdminArticles from '@/pages/Admin/Articles';
import AdminAuditLogs from '@/pages/Admin/AuditLogs';
import AdminCodes from '@/pages/Admin/Codes';
import AdminDashboard from '@/pages/Admin/Dashboard';
import AdminLogin from '@/pages/Admin/Login';
import AdminOpenApi from '@/pages/Admin/OpenApi';
import AdminSettings from '@/pages/Admin/Settings';
import AdminSystemReset from '@/pages/Admin/SystemReset';
import AdminTeachers from '@/pages/Admin/Teachers';
import AdminWebsite from '@/pages/Admin/Website';
import HomeAbout from '@/pages/Home/About';
import HomeContact from '@/pages/Home/Contact';
import HomeNews from '@/pages/Home/News';
import HomeServices from '@/pages/Home/Services';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import ParentAssignments from '@/pages/Parent/Assignments';
import ParentCommunication from '@/pages/Parent/Communication';
import ParentDashboard from '@/pages/Parent/Dashboard';
import ParentLeaveRequest from '@/pages/Parent/LeaveRequest';
import ParentReport from '@/pages/Parent/Report';
import ParentTasks from '@/pages/Parent/Tasks';
import StudentAchievements from '@/pages/Student/Achievements';
import StudentAssignments from '@/pages/Student/Assignments';
import StudentAuction from '@/pages/Student/Auction';
import StudentBank from '@/pages/Student/Bank';
import StudentBrawl from '@/pages/Student/Brawl';
import StudentCertificates from '@/pages/Student/Certificates';
import StudentChallenge from '@/pages/Student/Challenge';
import StudentDungeon from '@/pages/Student/Dungeon';
import StudentGacha from '@/pages/Student/Gacha';
import StudentGuildPK from '@/pages/Student/GuildPK';
import StudentInteractiveWall from '@/pages/Student/InteractiveWall';
import StudentLuckyDraw from '@/pages/Student/LuckyDraw';
import StudentMyRedemptions from '@/pages/Student/MyRedemptions';
import StudentPaperAttempt from '@/pages/Student/PaperAttempt';
import StudentPapers from '@/pages/Student/Papers';
import StudentPeerReview from '@/pages/Student/PeerReview';
import StudentPet from '@/pages/Student/Pet';
import StudentPlan from '@/pages/Student/Plan';
import StudentShop from '@/pages/Student/Shop';
import StudentTaskTree from '@/pages/Student/TaskTree';
import StudentTeamQuests from '@/pages/Student/TeamQuests';
import StudentTerritory from '@/pages/Student/Territory';
import StudentWrongQuestions from '@/pages/Student/WrongQuestions';
import AddStudent from '@/pages/Teacher/AddStudent';
import TeacherAnalysis from '@/pages/Teacher/Analysis';
import TeacherAssignments from '@/pages/Teacher/Assignments';
import TeacherAttendance from '@/pages/Teacher/Attendance';
import TeacherAuction from '@/pages/Teacher/Auction';
import TeacherBigscreen from '@/pages/Teacher/Bigscreen';
import TeacherBlindBox from '@/pages/Teacher/BlindBox';
import TeacherBrawl from '@/pages/Teacher/Brawl';
import TeacherCertificates from '@/pages/Teacher/Certificates';
import TeacherCommunication from '@/pages/Teacher/Communication';
import TeacherDashboard from '@/pages/Teacher/Dashboard';
import TeacherExams from '@/pages/Teacher/Exams';
import TeacherFeatures from '@/pages/Teacher/Features';
import TeacherKnowledgeGraph from '@/pages/Teacher/KnowledgeGraph';
import TeacherLuckyDrawConfig from '@/pages/Teacher/LuckyDrawConfig';
import TeacherPaperEditor from '@/pages/Teacher/PaperEditor';
import TeacherPapers from '@/pages/Teacher/Papers';
import TeacherPets from '@/pages/Teacher/Pets';
import TeacherRecords from '@/pages/Teacher/Records';
import TeacherSettings from '@/pages/Teacher/Settings';
import TeacherShop from '@/pages/Teacher/Shop';
import TeacherTaskTree from '@/pages/Teacher/TaskTree';
import TeacherTeamQuests from '@/pages/Teacher/TeamQuests';
import TeacherTerritory from '@/pages/Teacher/Territory';
import TeacherTools from '@/pages/Teacher/Tools';
import TeacherVerification from '@/pages/Teacher/Verification';
import TeacherWorldBoss from '@/pages/Teacher/WorldBoss';

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
