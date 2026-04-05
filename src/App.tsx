import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from 'sonner';
import Activate from '@/pages/Activate';
import { useStore } from '@/store/useStore';
import ThemeWrapper from "@/components/ThemeWrapper";

// PrivateRoute Component for enforcing authentication and activation
const PrivateRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const { user } = useStore();
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSettings(data.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // Activation Check
  const needsActivation = settings.revenue_enabled === '1' && 
                          settings.revenue_mode === 'activation_code' && 
                          !user.is_activated && 
                          user.role !== 'admin' && 
                          user.role !== 'teacher';

  if (needsActivation && window.location.pathname !== '/activate') {
    return <Navigate to="/activate" replace />;
  }

  return <>{children}</>;
};
import Login from "@/pages/Login";
import TeacherLayout from "@/components/Layout/TeacherLayout";
import TeacherDashboard from "@/pages/Teacher/Dashboard";
import TeacherRecords from "@/pages/Teacher/Records";
import AddStudent from "@/pages/Teacher/AddStudent";
import TeacherShop from "@/pages/Teacher/Shop";
import TeacherFeatures from "@/pages/Teacher/Features";
import TeacherBigscreen from "@/pages/Teacher/Bigscreen";
import TeacherAnalysis from "@/pages/Teacher/Analysis";
import TeacherCommunication from "@/pages/Teacher/Communication";
import TeacherLuckyDrawConfig from "@/pages/Teacher/LuckyDrawConfig";
import TeacherTools from "@/pages/Teacher/Tools";
import TeacherVerification from "@/pages/Teacher/Verification";
import TeacherSettings from "@/pages/Teacher/Settings";
import TeacherAssignments from "@/pages/Teacher/Assignments";
import TeacherExams from "@/pages/Teacher/Exams";
import TeacherAttendance from "@/pages/Teacher/Attendance";
import TeacherPets from "@/pages/Teacher/Pets";
import TeacherTeamQuests from "@/pages/Teacher/TeamQuests";
import TeacherCertificates from "@/pages/Teacher/Certificates";
import TeacherWorldBoss from "@/pages/Teacher/WorldBoss";
import TeacherBlindBox from "@/pages/Teacher/BlindBox";
import TeacherAuction from "@/pages/Teacher/Auction";
import TeacherTaskTree from "@/pages/Teacher/TaskTree";
import TeacherBrawl from "@/pages/Teacher/Brawl";
import TeacherTerritory from "@/pages/Teacher/Territory";

import StudentLayout from "@/components/Layout/StudentLayout";
import StudentPet from "@/pages/Student/Pet";
import StudentShop from "@/pages/Student/Shop";
import StudentChallenge from "@/pages/Student/Challenge";
import StudentLuckyDraw from "@/pages/Student/LuckyDraw";
import StudentMyRedemptions from "@/pages/Student/MyRedemptions";
import StudentInteractiveWall from "@/pages/Student/InteractiveWall";
import StudentPeerReview from "@/pages/Student/PeerReview";
import StudentAssignments from "@/pages/Student/Assignments";
import StudentTeamQuests from "@/pages/Student/TeamQuests";
import StudentCertificates from "@/pages/Student/Certificates";
import StudentAchievements from "@/pages/Student/Achievements";
import StudentAuction from "@/pages/Student/Auction";
import StudentGuildPK from "@/pages/Student/GuildPK";
import StudentTaskTree from "@/pages/Student/TaskTree";
import StudentBrawl from "@/pages/Student/Brawl";
import StudentTerritory from "@/pages/Student/Territory";
import StudentGacha from "@/pages/Student/Gacha";
import StudentBank from "@/pages/Student/Bank";
import StudentDungeon from "@/pages/Student/Dungeon";

import ParentLayout from "@/components/Layout/ParentLayout";
import ParentDashboard from "@/pages/Parent/Dashboard";
import ParentCommunication from "@/pages/Parent/Communication";
import ParentReport from "@/pages/Parent/Report";
import ParentTasks from "@/pages/Parent/Tasks";
import ParentLeaveRequest from "@/pages/Parent/LeaveRequest";
import ParentAssignments from "@/pages/Parent/Assignments";

import AdminLayout from "@/components/Layout/AdminLayout";
import AdminLogin from "@/pages/Admin/Login";
import AdminDashboard from "@/pages/Admin/Dashboard";
import AdminAnnouncements from "@/pages/Admin/Announcements";
import AdminArticles from "@/pages/Admin/Articles";
import AdminWebsite from "@/pages/Admin/Website";
import AdminAuditLogs from "@/pages/Admin/AuditLogs";
import AdminTeachers from "@/pages/Admin/Teachers";
import AdminSettings from "@/pages/Admin/Settings";
import AdminOpenApi from "@/pages/Admin/OpenApi";
import AdminCodes from "@/pages/Admin/Codes";

import { ADMIN_PATH } from "@/constants";

import HomeAbout from "@/pages/Home/About";
import HomeContact from "@/pages/Home/Contact";
import HomeNews from "@/pages/Home/News";
import HomeServices from "@/pages/Home/Services";

import Home from "@/pages/Home";

export default function App() {
  return (
    <>
      <Toaster position="top-center" richColors />
      <Router>
        <ThemeWrapper>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/activate" element={<Activate />} />
            
            {/* Public Pages */}
            <Route path="/about" element={<HomeAbout />} />
            <Route path="/contact" element={<HomeContact />} />
            <Route path="/news" element={<HomeNews />} />
            <Route path="/services" element={<HomeServices />} />

            <Route path="/teacher" element={<TeacherLayout />}>
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
              <Route path="attendance" element={<TeacherAttendance />} />
          <Route path="world-boss" element={<TeacherWorldBoss />} />
          <Route path="blind-box" element={<TeacherBlindBox />} />
          <Route path="pets" element={<TeacherPets />} />
          <Route path="team-quests" element={<TeacherTeamQuests />} />
          <Route path="certificates" element={<TeacherCertificates />} />
          <Route path="settings" element={<TeacherSettings />} />
        </Route>

            <Route path="/student" element={<StudentLayout />}>
              <Route path="pet" element={<StudentPet />} />
              <Route path="shop" element={<StudentShop />} />
          <Route path="auction" element={<StudentAuction />} />
          <Route path="task-tree" element={<StudentTaskTree />} />
          <Route path="brawl" element={<StudentBrawl />} />
          <Route path="territory" element={<StudentTerritory />} />
          <Route path="gacha" element={<StudentGacha />} />
          <Route path="bank" element={<StudentBank />} />
          <Route path="dungeon" element={<StudentDungeon />} />
              <Route path="challenge" element={<StudentChallenge />} />
              <Route path="lucky-draw" element={<StudentLuckyDraw />} />
              <Route path="my-redemptions" element={<StudentMyRedemptions />} />
          <Route path="certificates" element={<StudentCertificates />} />
          <Route path="achievements" element={<StudentAchievements />} />
          <Route path="interactive-wall" element={<StudentInteractiveWall />} />
          <Route path="peer-review" element={<StudentPeerReview />} />
          <Route path="guild-pk" element={<StudentGuildPK />} />
              <Route path="assignments" element={<StudentAssignments />} />
              <Route path="team-quests" element={<StudentTeamQuests />} />
            </Route>

            <Route path="/parent" element={<ParentLayout />}>
              <Route path="dashboard" element={<ParentDashboard />} />
              <Route path="communication" element={<ParentCommunication />} />
              <Route path="report" element={<ParentReport />} />
              <Route path="tasks" element={<ParentTasks />} />
              <Route path="leave-request" element={<ParentLeaveRequest />} />
              <Route path="assignments" element={<ParentAssignments />} />
            </Route>

            <Route path={`${ADMIN_PATH}/login`} element={<AdminLogin />} />
            <Route path={ADMIN_PATH} element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="announcements" element={<AdminAnnouncements />} />
              <Route path="articles" element={<AdminArticles />} />
              <Route path="website" element={<AdminWebsite />} />
            <Route path="audit-logs" element={<AdminAuditLogs />} />
            <Route path="teachers" element={<AdminTeachers />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="codes" element={<AdminCodes />} />
          <Route path="openapi" element={<AdminOpenApi />} />
            </Route>
          </Routes>
        </ThemeWrapper>
      </Router>
    </>
  );
}
