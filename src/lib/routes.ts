// Every path the app owns, in one file.
//
// The site is the public half and `/erp` is the staff half of a single domain, so
// a link is never hand-typed: screens, guards, redirects and the sitemap all read
// these strings. Labels come from the same church vocabulary as `lib/i18n.ts`, so
// a sidebar and a table header cannot drift apart.

// Relative `.ts` import so scripts/verify-lib.mjs can load this in plain node.
import type { PermissionKey } from './permissions.ts';

export const LOGIN_PATH = '/erp/login';
export const FORGOT_PATH = '/erp/forgot-password';
export const RESET_PATH = '/erp/reset-password';
export const ACCESS_DENIED_PATH = '/erp/no-access';

/** The three auth screens a signed-out visitor is allowed to reach. */
export const PUBLIC_ERP_PATHS: readonly string[] = [LOGIN_PATH, FORGOT_PATH, RESET_PATH, ACCESS_DENIED_PATH];

/** One sidebar entry. `perms` is the OR-ed set that makes it appear. */
export type NavItem = {
  path: string;
  labelAm: string;
  perms: PermissionKey[];
  /** Count of rows waiting on this person, shown as a badge. */
  badge?: 'approvals' | 'messages' | 'outbox';
};

export type NavGroup = { key: string; labelAm: string; items: NavItem[] };

/** The ERP side of the specification, grouped the way a parish office thinks. */
export const ERP_NAV: readonly NavGroup[] = [
  {
    key: 'home',
    labelAm: 'ዋና ገጽ',
    items: [{ path: '/erp/dashboard', labelAm: 'አጠቃላይ እይታ', perms: [] }],
  },
  {
    key: 'website',
    labelAm: 'ድረ-ገጽ',
    items: [
      { path: '/erp/website/homepage', labelAm: 'የመነሻ ገጽ አዘገጃጀት', perms: ['website.read'] },
      { path: '/erp/website/pages', labelAm: 'ገጾች', perms: ['website.read'] },
      { path: '/erp/website/blocks', labelAm: 'የገጽ ክፍሎች', perms: ['website.read'] },
      { path: '/erp/website/news', labelAm: 'ዜናዎች', perms: ['news.read'] },
      { path: '/erp/website/events', labelAm: 'ፕሮግራሞች', perms: ['events.read'] },
      { path: '/erp/website/sermons', labelAm: 'ንግዶች', perms: ['media.read'] },
      { path: '/erp/website/mezmur', labelAm: 'መዝሙሮች', perms: ['media.read'] },
      { path: '/erp/website/publications', labelAm: 'ህትመቶች', perms: ['media.read'] },
      { path: '/erp/website/gallery', labelAm: 'ፎቶ ማህደር', perms: ['gallery.read'] },
      { path: '/erp/website/leadership', labelAm: 'መሪዎች', perms: ['website.read'] },
      { path: '/erp/website/faqs', labelAm: 'ተደጋጋሚ ጥያቄዎች', perms: ['website.read'] },
      { path: '/erp/website/menus', labelAm: 'የዝርዝር አስተዳደር', perms: ['website.read'] },
      { path: '/erp/website/seo', labelAm: 'የፍለጋ ቅንብር', perms: ['website.read'] },
      { path: '/erp/workflow/pending', labelAm: 'ማጽደቅ የሚጠብቁ', perms: ['news.publish', 'events.publish', 'website.publish', 'gallery.publish', 'academics.publish', 'communication.publish'], badge: 'approvals' },
    ],
  },
  {
    key: 'media',
    labelAm: 'ሐቀፍና ድምጽ',
    items: [
      { path: '/erp/media/files', labelAm: 'ፋይሎች', perms: ['media.read'] },
      { path: '/erp/media/categories', labelAm: 'ምድቦች', perms: ['media.read'] },
    ],
  },
  {
    key: 'students',
    labelAm: 'ተማሪዎች',
    items: [
      { path: '/erp/students/roster', labelAm: 'የተማሪ ዝርዝር', perms: ['students.read'] },
      { path: '/erp/students/applications', labelAm: 'ማመልከቻዎች', perms: ['applications.read'] },
      { path: '/erp/students/guardians', labelAm: 'ወላጆች', perms: ['students.read'] },
      { path: '/erp/students/members', labelAm: 'የቤተ ክርስቲያን አባላት', perms: ['students.read'] },
      { path: '/erp/students/enrollments', labelAm: 'ምዝገባ', perms: ['students.read'] },
      { path: '/erp/students/event-registrations', labelAm: 'የፕሮግራም ምዝገባዎች', perms: ['events.read'] },
      { path: '/erp/students/id-cards', labelAm: 'መታወቂያ ካርዶች', perms: ['students.read'] },
      { path: '/erp/students/documents', labelAm: 'ሰነዶች', perms: ['documents.read'] },
      { path: '/erp/students/discipline', labelAm: 'የሥነ ምግባር ማስታወሻ', perms: ['students.read'] },
    ],
  },
  {
    key: 'academics',
    labelAm: 'የትምህርት ሥራ',
    items: [
      { path: '/erp/academics/years', labelAm: 'የትምህርት ዓመታት', perms: ['academics.read'] },
      { path: '/erp/academics/class-levels', labelAm: 'የክፍል ደረጃዎች', perms: ['academics.read'] },
      { path: '/erp/academics/classes', labelAm: 'ክፍሎች', perms: ['academics.read'] },
      { path: '/erp/academics/subjects', labelAm: 'ትምህርተ ሐሳቦች', perms: ['academics.read'] },
      { path: '/erp/academics/curriculum', labelAm: 'የትምህርት ማስተያ ክፍሎች', perms: ['academics.read'] },
      { path: '/erp/academics/class-subjects', labelAm: 'ክፍልና ትምህርተ ሐሳብ', perms: ['academics.read'] },
      { path: '/erp/academics/materials', labelAm: 'የትምህርት ግብዓቶች', perms: ['academics.read'] },
      { path: '/erp/academics/exams', labelAm: 'ፈተናዎች', perms: ['results.read'] },
      { path: '/erp/academics/results', labelAm: 'ውጤቶች', perms: ['results.read'] },
      { path: '/erp/academics/grade-scales', labelAm: 'የነጥብ ልኬቶች', perms: ['academics.read'] },
      { path: '/erp/academics/promotion', labelAm: 'ማሻገር', perms: ['students.promote'] },
    ],
  },
  {
    key: 'attendance',
    labelAm: 'መገኘት',
    items: [
      { path: '/erp/attendance/sessions', labelAm: 'የክፍል ጉባኤዎች', perms: ['attendance.read'] },
      { path: '/erp/attendance/mark', labelAm: 'መገኘት መመዝገብ', perms: ['attendance.mark'] },
      { path: '/erp/attendance/reports', labelAm: 'የመገኘት ማጠቃለያ', perms: ['attendance.read'] },
    ],
  },
  {
    key: 'teachers',
    labelAm: 'መምህራን',
    items: [
      { path: '/erp/teachers/roster', labelAm: 'መምህራን ዝርዝር', perms: ['teachers.read'] },
      { path: '/erp/teachers/assignments', labelAm: 'የክፍል ተመዳይነት', perms: ['teachers.read'] },
      { path: '/erp/teachers/lesson-plans', labelAm: 'የትምህርት እቅዶች', perms: ['teachers.read'] },
    ],
  },
  {
    key: 'departments',
    labelAm: 'ዘርፎች',
    items: [
      { path: '/erp/departments/list', labelAm: 'ዘርፎች', perms: ['departments.read'] },
      { path: '/erp/departments/org-units', labelAm: 'የአዘርጋል ክፍሎች', perms: ['departments.read'] },
      { path: '/erp/departments/members', labelAm: 'አባላት', perms: ['departments.read'] },
      { path: '/erp/departments/activities', labelAm: 'እንቅስቃሴዎች', perms: ['departments.read'] },
      { path: '/erp/departments/choirs', labelAm: 'መዝሙር ቡድኖች', perms: ['departments.read'] },
    ],
  },
  {
    key: 'operations',
    labelAm: 'አሠራርና ንብረት',
    items: [
      { path: '/erp/operations/library', labelAm: 'መጻሕፍት ማዕከል', perms: ['operations.read'] },
      { path: '/erp/operations/inventory', labelAm: 'እቃ ክምችት', perms: ['operations.read'] },
      { path: '/erp/operations/assets', labelAm: 'ቋሚ ንብረቶች', perms: ['operations.read'] },
      { path: '/erp/operations/documents', labelAm: 'ደብዳቤና ሰነዶች', perms: ['documents.read'] },
      { path: '/erp/operations/certificates', labelAm: 'ምስክር ወረቀቶች', perms: ['certificates.read'] },
      { path: '/erp/operations/volunteers', labelAm: 'በፈቃደኝነት አገልግሎት', perms: ['volunteers.read'] },
    ],
  },
  {
    key: 'finance',
    labelAm: 'ሒሳብና ገንዘብ',
    items: [
      { path: '/erp/finance/overview', labelAm: 'የገንዘብ ሁኔታ', perms: ['finance.read'] },
      { path: '/erp/finance/transactions', labelAm: 'ገቢና ወጪ', perms: ['finance.read'] },
      { path: '/erp/finance/donations', labelAm: 'ለጋሾች', perms: ['donations.read'] },
      { path: '/erp/finance/campaigns', labelAm: 'የለጋሽ ዘመቻዎች', perms: ['donations.read'] },
      { path: '/erp/finance/budgets', labelAm: 'በጀት', perms: ['budget.read'] },
      { path: '/erp/finance/accounts', labelAm: 'ሒሳብ መጻሕፍት', perms: ['finance.read'] },
      { path: '/erp/finance/categories', labelAm: 'የሒሳብ ምድቦች', perms: ['finance.read'] },
      { path: '/erp/finance/settings', labelAm: 'ቅንብሮች', perms: ['finance.read'] },
    ],
  },
  {
    key: 'communication',
    labelAm: 'ግንኙነት',
    items: [
      { path: '/erp/communication/announcements', labelAm: 'ማስታወቂያዎች', perms: ['communication.read'] },
      { path: '/erp/communication/messages', labelAm: 'መልእክቶች', perms: ['communication.read'], badge: 'messages' },
      { path: '/erp/communication/prayers', labelAm: 'የጸሎት ጥያቄዎች', perms: ['communication.read'] },
      { path: '/erp/communication/newsletter', labelAm: 'የዜና መልእክት አንባቢዎች', perms: ['communication.read'] },
      { path: '/erp/communication/templates', labelAm: 'የመልእክት ቅዳዎች', perms: ['communication.write'] },
      { path: '/erp/communication/outbox', labelAm: 'የተላኩ መልእክቶች', perms: ['communication.read'], badge: 'outbox' },
    ],
  },
  {
    key: 'reports',
    labelAm: 'ሪፖርትና ትንተና',
    items: [
      { path: '/erp/reports/academic', labelAm: 'የትምህርት ሪፖርት', perms: ['reports.read'] },
      { path: '/erp/reports/finance', labelAm: 'የሒሳብ ሪፖርት', perms: ['reports.read'] },
      { path: '/erp/reports/attendance', labelAm: 'የመገኘት ሪፖርት', perms: ['reports.read'] },
      { path: '/erp/reports/website', labelAm: 'የድረ-ገጽ ሪፖርት', perms: ['reports.read'] },
    ],
  },
  {
    key: 'system',
    labelAm: 'ስርዓት አስተዳደር',
    items: [
      { path: '/erp/system/users', labelAm: 'ተጠቃሚዎች', perms: ['system.read'] },
      { path: '/erp/system/roles', labelAm: 'ሚናዎችና ፍቃዶች', perms: ['system.read'] },
      { path: '/erp/system/approvals', labelAm: 'የሥራ ማጽደቅ', perms: ['finance.approve', 'budget.approve', 'results.release'], badge: 'approvals' },
      { path: '/erp/system/audit', labelAm: 'የቁጥጥር መዝገብ', perms: ['audit.read'] },
      { path: '/erp/system/content-types', labelAm: 'የይዘት ዓይነቶች', perms: ['system.read'] },
      { path: '/erp/system/rls', labelAm: 'የደህንነት ሕጎች', perms: ['system.read'] },
      { path: '/erp/system/settings', labelAm: 'አጠቃላይ ቅንብር', perms: ['system.read'] },
      { path: '/erp/system/backup', labelAm: 'ቅጂ ማድረግና ማውጣት', perms: ['system.read', 'reports.export'] },
    ],
  },
  {
    key: 'portals',
    labelAm: 'የግል ገጾች',
    items: [
      { path: '/erp/portal/student', labelAm: 'የተማሪ ገጽ', perms: [] },
      { path: '/erp/portal/parent', labelAm: 'የወላጅ ገጽ', perms: [] },
      { path: '/erp/portal/teacher', labelAm: 'የመምህር ገጽ', perms: [] },
      { path: '/erp/portal/department', labelAm: 'የዘርፍ ኃላፊ ገጽ', perms: [] },
    ],
  },
];

export const PORTAL_NAV_PATHS: readonly string[] = ERP_NAV.find((g) => g.key === 'portals')!.items.map((i) => i.path);

/** Routes any signed-in person may open; portals are guarded by their own RPCs. */
export function isOpenToAll(path: string): boolean {
  return ERP_NAV.some((group) => group.items.some((item) => item.path === path && item.perms.length === 0));
}

/** The navigation a person is actually offered — empty groups disappear. */
export function navFor(granted: readonly PermissionKey[]): NavGroup[] {
  return ERP_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.perms.length === 0 || item.perms.some((p) => granted.includes(p))),
  })).filter((group) => group.items.length > 0);
}

/** Which grants a screen demands; empty means "signed in is enough". */
export function permsFor(path: string): PermissionKey[] {
  for (const group of ERP_NAV) {
    for (const item of group.items) if (item.path === path) return [...item.perms];
  }
  return [];
}

export type SiteRoute = { path: string; labelAm: string; seoKey: string };

/** The 22 public pages, used by the site router, the header and the sitemap. */
export const SITE_ROUTES: readonly SiteRoute[] = [
  { path: '/', labelAm: 'መነሻ', seoKey: 'home' },
  { path: '/about', labelAm: 'ስለ ቤተ ክርስቲያናችን', seoKey: 'about' },
  { path: '/vision', labelAm: 'ዕይታና ተልእኮ', seoKey: 'vision' },
  { path: '/history', labelAm: 'ታሪካችን', seoKey: 'history' },
  { path: '/leadership', labelAm: 'መሪዎች', seoKey: 'leadership' },
  { path: '/departments', labelAm: 'ዘርፎች', seoKey: 'departments' },
  { path: '/sunday-school', labelAm: 'ሰንበት ት/ቤት', seoKey: 'sunday_school' },
  { path: '/classes', labelAm: 'ክፍሎችና ደረጃዎች', seoKey: 'classes' },
  { path: '/calendar', labelAm: 'የበዓላት መቁጠሪያ', seoKey: 'calendar' },
  { path: '/news', labelAm: 'ዜናዎች', seoKey: 'news' },
  { path: '/events', labelAm: 'ፕሮግራሞች', seoKey: 'events' },
  { path: '/gallery', labelAm: 'ፎቶ ማህደር', seoKey: 'gallery' },
  { path: '/sermons', labelAm: 'ንግዶች', seoKey: 'sermons' },
  { path: '/mezmur', labelAm: 'መዝሙሮች', seoKey: 'mezmur' },
  { path: '/publications', labelAm: 'ህትመቶች', seoKey: 'publications' },
  { path: '/media', labelAm: 'ሐቀፍና ድምጽ ማህደር', seoKey: 'media' },
  { path: '/register', labelAm: 'ምዝገባ', seoKey: 'register' },
  { path: '/status', labelAm: 'የማመልከቻ ውጤት', seoKey: 'status' },
  { path: '/donate', labelAm: 'ለጋሽ', seoKey: 'donate' },
  { path: '/prayer', labelAm: 'የጸሎት ጥያቄ', seoKey: 'prayer' },
  { path: '/contact', labelAm: 'አድራሻና ግንኙነት', seoKey: 'contact' },
  { path: '/faq', labelAm: 'ጥያቄና መልስ', seoKey: 'faq' },
];

/** Detail pages are the same content addressed by slug. */
export const SITE_DETAIL_PREFIXES = ['/news/', '/events/', '/gallery/', '/sermons/', '/mezmur/', '/publications/', '/page/'] as const;
