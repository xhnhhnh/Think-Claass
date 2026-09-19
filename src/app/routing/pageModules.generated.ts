/**
 * GENERATED FILE - do not edit by hand.
 *
 * The route page-module map, generated from `routeTable.ts` by
 * `scripts/migration/route-modules.mjs`. Regenerate with:
 *
 *   npm run route-modules          # rewrite
 *   npm run route-modules:check    # verify (also runs in the guardrail suite)
 *
 * Why generated rather than `import.meta.glob`: see the header of the generator. In short, a
 * glob's key format and alias handling differ between vitest and the production build, and a
 * glob bundles every matched file - including tests - before any runtime filter can drop them.
 *
 * Each entry is an explicit `import()` with a literal path, so pages stay separate lazy chunks
 * and the route layer never names a plugin module (guardrail G4).
 */

export const pageModules: Record<string, () => Promise<unknown>> = {
  '@/components/Layout/AdminLayout': () => import('@/components/Layout/AdminLayout'),
  '@/components/Layout/ParentLayout': () => import('@/components/Layout/ParentLayout'),
  '@/components/Layout/StudentLayout': () => import('@/components/Layout/StudentLayout'),
  '@/components/Layout/TeacherLayout': () => import('@/components/Layout/TeacherLayout'),
  '@/features/admin/pages/AdminAnnouncementsPage': () => import('@/features/admin/pages/AdminAnnouncementsPage'),
  '@/features/admin/pages/AdminArticlesPage': () => import('@/features/admin/pages/AdminArticlesPage'),
  '@/features/admin/pages/AdminAuditLogsPage': () => import('@/features/admin/pages/AdminAuditLogsPage'),
  '@/features/admin/pages/AdminCodesPage': () => import('@/features/admin/pages/AdminCodesPage'),
  '@/features/admin/pages/AdminOpenApiPage': () => import('@/features/admin/pages/AdminOpenApiPage'),
  '@/features/admin/pages/AdminTeachersPage': () => import('@/features/admin/pages/AdminTeachersPage'),
  '@/features/admin/pages/AdminWebsitePage': () => import('@/features/admin/pages/AdminWebsitePage'),
  '@/features/auth/pages/ActivatePage': () => import('@/features/auth/pages/ActivatePage'),
  '@/features/auth/pages/LoginPage': () => import('@/features/auth/pages/LoginPage'),
  '@/features/battles/pages/StudentBrawlPage': () => import('@/features/battles/pages/StudentBrawlPage'),
  '@/features/battles/pages/TeacherBrawlPage': () => import('@/features/battles/pages/TeacherBrawlPage'),
  '@/features/challenge/pages/StudentChallengePage': () => import('@/features/challenge/pages/StudentChallengePage'),
  '@/features/challenge/pages/TeacherWorldBossPage': () => import('@/features/challenge/pages/TeacherWorldBossPage'),
  '@/features/classroom/pages/StudentAchievementsPage': () => import('@/features/classroom/pages/StudentAchievementsPage'),
  '@/features/classroom/pages/StudentGuildPKPage': () => import('@/features/classroom/pages/StudentGuildPKPage'),
  '@/features/classroom/pages/TeacherAddStudentPage': () => import('@/features/classroom/pages/TeacherAddStudentPage'),
  '@/features/classroom/pages/TeacherBigscreenPage': () => import('@/features/classroom/pages/TeacherBigscreenPage'),
  '@/features/classroom/pages/TeacherDashboardPage': () => import('@/features/classroom/pages/TeacherDashboardPage'),
  '@/features/classroom/pages/TeacherRecordsPage': () => import('@/features/classroom/pages/TeacherRecordsPage'),
  '@/features/classroom/pages/TeacherSettingsPage': () => import('@/features/classroom/pages/TeacherSettingsPage'),
  '@/features/classroom/pages/TeacherToolsPage': () => import('@/features/classroom/pages/TeacherToolsPage'),
  '@/features/collaboration/pages/StudentTaskTreePage': () => import('@/features/collaboration/pages/StudentTaskTreePage'),
  '@/features/collaboration/pages/StudentTeamQuestsPage': () => import('@/features/collaboration/pages/StudentTeamQuestsPage'),
  '@/features/collaboration/pages/TeacherTaskTreePage': () => import('@/features/collaboration/pages/TeacherTaskTreePage'),
  '@/features/collaboration/pages/TeacherTeamQuestsPage': () => import('@/features/collaboration/pages/TeacherTeamQuestsPage'),
  '@/features/dungeon/pages/StudentDungeonPage': () => import('@/features/dungeon/pages/StudentDungeonPage'),
  '@/features/economy/pages/StudentBankPage': () => import('@/features/economy/pages/StudentBankPage'),
  '@/features/economy/pages/TeacherEconomyPage': () => import('@/features/economy/pages/TeacherEconomyPage'),
  '@/features/engagement/pages/ParentCommunicationPage': () => import('@/features/engagement/pages/ParentCommunicationPage'),
  '@/features/engagement/pages/StudentCertificatesPage': () => import('@/features/engagement/pages/StudentCertificatesPage'),
  '@/features/engagement/pages/StudentInteractiveWallPage': () => import('@/features/engagement/pages/StudentInteractiveWallPage'),
  '@/features/engagement/pages/StudentLuckyDrawPage': () => import('@/features/engagement/pages/StudentLuckyDrawPage'),
  '@/features/engagement/pages/StudentMyRedemptionsPage': () => import('@/features/engagement/pages/StudentMyRedemptionsPage'),
  '@/features/engagement/pages/StudentPeerReviewPage': () => import('@/features/engagement/pages/StudentPeerReviewPage'),
  '@/features/engagement/pages/TeacherCertificatesPage': () => import('@/features/engagement/pages/TeacherCertificatesPage'),
  '@/features/engagement/pages/TeacherCommunicationPage': () => import('@/features/engagement/pages/TeacherCommunicationPage'),
  '@/features/engagement/pages/TeacherLuckyDrawConfigPage': () => import('@/features/engagement/pages/TeacherLuckyDrawConfigPage'),
  '@/features/gacha/pages/StudentGachaPage': () => import('@/features/gacha/pages/StudentGachaPage'),
  '@/features/learning/pages/StudentAssignmentsPage': () => import('@/features/learning/pages/StudentAssignmentsPage'),
  '@/features/learning/pages/StudentPaperAttemptPage': () => import('@/features/learning/pages/StudentPaperAttemptPage'),
  '@/features/learning/pages/StudentPapersPage': () => import('@/features/learning/pages/StudentPapersPage'),
  '@/features/learning/pages/StudentPlanPage': () => import('@/features/learning/pages/StudentPlanPage'),
  '@/features/learning/pages/StudentWrongQuestionsPage': () => import('@/features/learning/pages/StudentWrongQuestionsPage'),
  '@/features/learning/pages/TeacherAssignmentsPage': () => import('@/features/learning/pages/TeacherAssignmentsPage'),
  '@/features/learning/pages/TeacherExamsPage': () => import('@/features/learning/pages/TeacherExamsPage'),
  '@/features/learning/pages/TeacherKnowledgeGraphPage': () => import('@/features/learning/pages/TeacherKnowledgeGraphPage'),
  '@/features/learning/pages/TeacherPaperEditorPage': () => import('@/features/learning/pages/TeacherPaperEditorPage'),
  '@/features/learning/pages/TeacherPapersPage': () => import('@/features/learning/pages/TeacherPapersPage'),
  '@/features/marketplace/pages/StudentAuctionPage': () => import('@/features/marketplace/pages/StudentAuctionPage'),
  '@/features/marketplace/pages/StudentShopPage': () => import('@/features/marketplace/pages/StudentShopPage'),
  '@/features/marketplace/pages/TeacherAuctionPage': () => import('@/features/marketplace/pages/TeacherAuctionPage'),
  '@/features/marketplace/pages/TeacherBlindBoxPage': () => import('@/features/marketplace/pages/TeacherBlindBoxPage'),
  '@/features/marketplace/pages/TeacherShopPage': () => import('@/features/marketplace/pages/TeacherShopPage'),
  '@/features/pet/pages/StudentPetPage': () => import('@/features/pet/pages/StudentPetPage'),
  '@/features/pet/pages/TeacherPetsPage': () => import('@/features/pet/pages/TeacherPetsPage'),
  '@/features/portal/pages/AboutPage': () => import('@/features/portal/pages/AboutPage'),
  '@/features/portal/pages/ContactPage': () => import('@/features/portal/pages/ContactPage'),
  '@/features/portal/pages/HomePage': () => import('@/features/portal/pages/HomePage'),
  '@/features/portal/pages/NewsPage': () => import('@/features/portal/pages/NewsPage'),
  '@/features/portal/pages/ServicesPage': () => import('@/features/portal/pages/ServicesPage'),
  '@/features/slg/pages/StudentTerritoryPage': () => import('@/features/slg/pages/StudentTerritoryPage'),
  '@/features/slg/pages/TeacherTerritoryPage': () => import('@/features/slg/pages/TeacherTerritoryPage'),
  '@/pages/Admin/Dashboard': () => import('@/pages/Admin/Dashboard'),
  '@/pages/Admin/Login': () => import('@/pages/Admin/Login'),
  '@/pages/Admin/Settings': () => import('@/pages/Admin/Settings'),
  '@/pages/Admin/SystemReset': () => import('@/pages/Admin/SystemReset'),
  '@/pages/Parent/Assignments': () => import('@/pages/Parent/Assignments'),
  '@/pages/Parent/Dashboard': () => import('@/pages/Parent/Dashboard'),
  '@/pages/Parent/LeaveRequest': () => import('@/pages/Parent/LeaveRequest'),
  '@/pages/Parent/Report': () => import('@/pages/Parent/Report'),
  '@/pages/Parent/Tasks': () => import('@/pages/Parent/Tasks'),
  '@/pages/Payment': () => import('@/pages/Payment'),
  '@/pages/Teacher/Analysis': () => import('@/pages/Teacher/Analysis'),
  '@/pages/Teacher/Attendance': () => import('@/pages/Teacher/Attendance'),
  '@/pages/Teacher/Features': () => import('@/pages/Teacher/Features'),
  '@/pages/Teacher/Verification': () => import('@/pages/Teacher/Verification'),
};
