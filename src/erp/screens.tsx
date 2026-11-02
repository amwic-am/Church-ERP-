// Which screen each ERP path renders.
//
// Most modules are a resource: the CRUD engine turns a table description into a
// working list-and-form screen, so the entry here is one component and a resource.
// The paths that need more than a form — approvals, attendance marking, promotion,
// ID cards, the portals, reports — name a hand-written screen. A path with no entry
// here cannot be reached from the sidebar, because the router only mounts what this
// map knows about.
import { useState, type ReactNode } from 'react';

import { Tabs, TabPanel } from '@/components/ui/tabs';
import type { TableName } from '@/lib/supabase';
import type { Resource } from './crud/resource';
import { EmptyState } from '@/components/ui/surface';
import { ResourceScreen } from './crud/ResourceScreen';
import { DashboardPage } from './pages/DashboardPage';
import { HomepageComposer, PendingWorkflowScreen, SiteSeoScreen } from './pages/website';
import { ApprovalsScreen, FinanceOverviewScreen } from './pages/finance';
import { MessagesScreen, PrayersScreen } from './pages/inbox';
import { AttendanceMarkScreen, AttendanceReportScreen, IdCardScreen, PromotionScreen } from './pages/school';
import { CertificateScreen, InventoryScreen, LibraryScreen, VolunteerScreen } from './pages/operations';
import { AcademicReportScreen, AttendanceReportScreen as AttendanceAnalyticsScreen, FinanceReportScreen, WebsiteReportScreen } from './pages/reports';
import { BackupScreen, RolesPermissionsScreen, UsersScreen } from './pages/admin';
import { DepartmentPortalScreen, ParentPortalScreen, StudentPortalScreen, TeacherPortalScreen } from './pages/portals';
import {
  academicYearsResource,
  classLevelsResource,
  classSessionsResource,
  classSubjectsResource,
  classTeachersResource,
  classesResource,
  curriculumUnitsResource,
  examResultsResource,
  examsResource,
  gradeScalesResource,
  learningMaterialsResource,
  subjectsResource,
} from './resources/academics';
import {
  announcementsResource,
  notificationPreferencesResource,
  notificationTemplatesResource,
  notificationsResource,
  outboxMessagesResource,
  subscribersResource,
} from './resources/communication';
import {
  budgetsResource,
  donationCampaignsResource,
  donationsResource,
  financeAccountsResource,
  financeCategoriesResource,
  financeSettingsResource,
  transactionsResource,
} from './resources/finance';
import {
  assetsResource,
  documentsResource,
} from './resources/operations';
import {
  choirMembersResource,
  choirPerformancesResource,
  choirsResource,
  departmentActivitiesResource,
  departmentMembersResource,
  departmentsResource,
  lessonPlansResource,
  orgUnitsResource,
  teacherProfilesResource,
} from './resources/people';
import {
  applicationsResource,
  disciplineRecordsResource,
  eventRegistrationsResource,
  guardianStudentsResource,
  guardiansResource,
  membersResource,
  studentDocumentsResource,
  studentEnrollmentsResource,
  studentProfilesResource,
} from './resources/students';
import {
  auditLogsResource,
  contentTypesResource,
  rlsRulesResource,
  siteSettingsResource,
} from './resources/system';
import {
  albumsResource,
  eventsResource,
  faqsResource,
  leadershipResource,
  mediaCategoriesResource,
  mediaFilesResource,
  menuItemsResource,
  menusResource,
  mezmurResource,
  newsResource,
  pageBlocksResource,
  pagesResource,
  publicationsResource,
  sermonsResource,
} from './resources/website';

type Tab = { value: string; label: string; screen: ReactNode };

/** Several resources under one sidebar entry — the way a link table belongs to its parent. */
function Tabbed({ tabs, className }: { tabs: readonly Tab[]; className?: string }) {
  const [value, setValue] = useState(tabs[0]!.value);
  return (
    <Tabs
      className={className}
      value={value}
      onValueChange={setValue}
      items={tabs.map((tab) => ({ value: tab.value, label: tab.label }))}
    >
      {tabs.map((tab) => (
        <TabPanel key={tab.value} value={tab.value}>
          {tab.screen}
        </TabPanel>
      ))}
    </Tabs>
  );
}

function resource<T extends TableName>(r: Resource<T>) {
  return <ResourceScreen resource={r} />;
}

export const ERP_SCREENS: Record<string, ReactNode> = {
  '/erp/dashboard': <DashboardPage />,

  // ድረ-ገጽ
  '/erp/website/homepage': <HomepageComposer />,
  '/erp/website/pages': resource(pagesResource),
  '/erp/website/blocks': resource(pageBlocksResource),
  '/erp/website/news': resource(newsResource),
  '/erp/website/events': resource(eventsResource),
  '/erp/website/sermons': resource(sermonsResource),
  '/erp/website/mezmur': resource(mezmurResource),
  '/erp/website/publications': resource(publicationsResource),
  '/erp/website/gallery': resource(albumsResource),
  '/erp/website/leadership': resource(leadershipResource),
  '/erp/website/faqs': resource(faqsResource),
  '/erp/website/menus': (
    <Tabbed
      tabs={[
        { value: 'menus', label: 'ዝርዝሮች', screen: resource(menusResource) },
        { value: 'items', label: 'ዝርዝር ንጥሎች', screen: resource(menuItemsResource) },
      ]}
    />
  ),
  '/erp/website/seo': <SiteSeoScreen />,
  '/erp/workflow/pending': <PendingWorkflowScreen />,

  // ሐቀፍና ድምጽ
  '/erp/media/files': resource(mediaFilesResource),
  '/erp/media/categories': resource(mediaCategoriesResource),

  // ተማሪዎች
  '/erp/students/roster': resource(studentProfilesResource),
  '/erp/students/members': resource(membersResource),
  '/erp/students/applications': resource(applicationsResource),
  '/erp/students/guardians': (
    <Tabbed
      tabs={[
        { value: 'guardians', label: 'ወላጆች', screen: resource(guardiansResource) },
        { value: 'links', label: 'ተማሪና ወላጅ', screen: resource(guardianStudentsResource) },
      ]}
    />
  ),
  '/erp/students/enrollments': resource(studentEnrollmentsResource),
  '/erp/students/event-registrations': resource(eventRegistrationsResource),
  '/erp/students/id-cards': <IdCardScreen />,
  '/erp/students/documents': resource(studentDocumentsResource),
  '/erp/students/discipline': resource(disciplineRecordsResource),

  // የትምህርት ሥራ
  '/erp/academics/years': resource(academicYearsResource),
  '/erp/academics/class-levels': resource(classLevelsResource),
  '/erp/academics/classes': resource(classesResource),
  '/erp/academics/subjects': resource(subjectsResource),
  '/erp/academics/class-subjects': resource(classSubjectsResource),
  '/erp/academics/curriculum': resource(curriculumUnitsResource),
  '/erp/academics/materials': resource(learningMaterialsResource),
  '/erp/academics/exams': resource(examsResource),
  '/erp/academics/results': resource(examResultsResource),
  '/erp/academics/grade-scales': resource(gradeScalesResource),
  '/erp/academics/promotion': <PromotionScreen />,

  // መገኘት
  '/erp/attendance/sessions': resource(classSessionsResource),
  '/erp/attendance/mark': <AttendanceMarkScreen />,
  '/erp/attendance/reports': <AttendanceReportScreen />,

  // መምህራን
  '/erp/teachers/roster': resource(teacherProfilesResource),
  '/erp/teachers/assignments': resource(classTeachersResource),
  '/erp/teachers/lesson-plans': resource(lessonPlansResource),

  // ዘርፎች
  '/erp/departments/list': resource(departmentsResource),
  '/erp/departments/org-units': resource(orgUnitsResource),
  '/erp/departments/members': resource(departmentMembersResource),
  '/erp/departments/activities': resource(departmentActivitiesResource),
  '/erp/departments/choirs': (
    <Tabbed
      tabs={[
        { value: 'choirs', label: 'መዝሙር ቡድኖች', screen: resource(choirsResource) },
        { value: 'members', label: 'አባላት', screen: resource(choirMembersResource) },
        { value: 'performances', label: 'የቀረጻዎችና አገልግሎቶች', screen: resource(choirPerformancesResource) },
      ]}
    />
  ),

  // አሠራርና ንብረት
  '/erp/operations/library': <LibraryScreen />,
  '/erp/operations/inventory': <InventoryScreen />,
  '/erp/operations/assets': resource(assetsResource),
  '/erp/operations/documents': resource(documentsResource),
  '/erp/operations/certificates': <CertificateScreen />,
  '/erp/operations/volunteers': <VolunteerScreen />,

  // ሒሳብና ገንዘብ
  '/erp/finance/overview': <FinanceOverviewScreen />,
  '/erp/finance/transactions': resource(transactionsResource),
  '/erp/finance/donations': resource(donationsResource),
  '/erp/finance/campaigns': resource(donationCampaignsResource),
  '/erp/finance/budgets': resource(budgetsResource),
  '/erp/finance/accounts': resource(financeAccountsResource),
  '/erp/finance/categories': resource(financeCategoriesResource),
  '/erp/finance/settings': resource(financeSettingsResource),

  // ግንኙነት
  '/erp/communication/announcements': resource(announcementsResource),
  '/erp/communication/messages': <MessagesScreen />,
  '/erp/communication/prayers': <PrayersScreen />,
  '/erp/communication/newsletter': resource(subscribersResource),
  '/erp/communication/templates': resource(notificationTemplatesResource),
  '/erp/communication/outbox': (
    <Tabbed
      tabs={[
        { value: 'outbox', label: 'የተላኩ መልእክቶች', screen: resource(outboxMessagesResource) },
        { value: 'notifications', label: 'የውስጥ ማሳወቂያዎች', screen: resource(notificationsResource) },
        { value: 'preferences', label: 'የማሳወቂያ ምርጫዎች', screen: resource(notificationPreferencesResource) },
      ]}
    />
  ),

  // ሪፖርትና ትንተና
  '/erp/reports/academic': <AcademicReportScreen />,
  '/erp/reports/finance': <FinanceReportScreen />,
  '/erp/reports/attendance': <AttendanceAnalyticsScreen />,
  '/erp/reports/website': <WebsiteReportScreen />,

  // ስርዓት አስተዳደር
  '/erp/system/users': <UsersScreen />,
  '/erp/system/roles': <RolesPermissionsScreen />,
  '/erp/system/content-types': resource(contentTypesResource),
  '/erp/system/rls': resource(rlsRulesResource),
  '/erp/system/approvals': <ApprovalsScreen />,
  '/erp/system/audit': resource(auditLogsResource),
  '/erp/system/settings': resource(siteSettingsResource),
  '/erp/system/backup': <BackupScreen />,

  // የግል ገጾች
  '/erp/portal/student': <StudentPortalScreen />,
  '/erp/portal/parent': <ParentPortalScreen />,
  '/erp/portal/teacher': <TeacherPortalScreen />,
  '/erp/portal/department': <DepartmentPortalScreen />,
};

/** A sidebar entry whose screen is missing is shown as a gap, never as a blank page. */
export function screenFor(path: string): ReactNode {
  const screen = ERP_SCREENS[path];
  if (screen) return screen;
  return (
    <EmptyState
      title="ይህ ማስተዳደያ ክፍል ገና አልተገናኘም"
      description={`“${path}” ለዚህ ደረጃ በሥርዓቱ ውስጥ ስላልተመዘገበ ባዶ ገጽ ብቻ ያሳያል።`}
    />
  );
}
