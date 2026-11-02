// The Amharic vocabulary of the whole platform, in one file.
//
// The system is Amharic-only by decision, so this is a glossary rather than a
// translation framework: the enum labels the database already uses, the words
// every screen reuses, and the names of the modules in the specification.
// Keeping them here stops one screen from saying "አስቀምጥ" and another "አድን"
// for the same button, and keeps the church vocabulary (ዘርፍ, መገኘት, ንግድ,
// ምስክር ወረቀት) instead of a generic office translation.

import type {
  ApplicationStatus,
  AttendanceStatus,
  ContentState,
  DeliveryChannel,
  DeliveryStatus,
  Gender,
  MemberStatus,
  PaymentMethod,
  TransactionType,
} from '../types/database.ts';

export const CONTENT_STATE: Record<ContentState, string> = {
  draft: 'ቅድመ ሐሳብ',
  submitted: 'የቀረበ',
  changes_requested: 'አስተካካይ ተጠይቋል',
  approved: 'ጸድቋል',
  published: 'ታውቋል',
  archived: 'ወደ ማህደር የተላከ',
};

export const APPLICATION_STATUS: Record<ApplicationStatus, string> = {
  pending: 'በመጠባበቂያ ላይ',
  under_review: 'በግምገማ ላይ',
  interview: 'ቃለ መጠይቅ ተመድቧል',
  approved: 'ጸድቋል',
  rejected: 'አልጸደቀም',
  withdrawn: 'ተሰርዟል',
};

export const MEMBER_STATUS: Record<MemberStatus, string> = {
  active: 'ንቁ አባል',
  inactive: 'ያልተገናኘ',
  transferred: 'ወደ ሌላ ቤተ ክርስቲያን የተላከ',
  deceased: 'ለፍቷል',
  pending: 'በመመዝገብ ላይ',
};

export const ATTENDANCE_STATUS: Record<AttendanceStatus, string> = {
  present: 'ተገኝቷል',
  absent: 'አልተገኘም',
  late: 'ዘግይቶ ተገኝቷል',
  excused: 'በፈቃድ ተቋርጧል',
};

export const GENDER: Record<Gender, string> = { male: 'ወንድ', female: 'ሴት' };

export const TRANSACTION_TYPE: Record<TransactionType, string> = {
  income: 'ገቢ',
  expense: 'ወጪ',
  transfer: 'ሽግግር',
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  cash: 'ወረቀት ገንዘብ',
  bank_transfer: 'የባንክ ማስተላለፍ',
  check: 'ቼክ',
  card: 'ካርድ',
  mobile_money: 'የሞባይል ገንዘብ',
  other: 'ሌላ',
};

export const DELIVERY_CHANNEL: Record<DeliveryChannel, string> = {
  email: 'ኢሜይል',
  sms: 'ኤስኤምኤስ',
  push: 'ማሳወቂያ',
  in_app: 'በመተግበሪያ ውስጥ',
};

export const DELIVERY_STATUS: Record<DeliveryStatus, string> = {
  queued: 'በሰልፍ ላይ',
  sending: 'በመላክ ላይ',
  sent: 'ተልኳል',
  delivered: 'ደርሷል',
  failed: 'አልተሳካም',
  provider_not_configured: 'አገልግሎቱ ገና አልተገናኘም',
};

export const UI = {
  appName: 'ተክለቴዎፍሎስ ሰንበት ት/ቤት',
  churchName: 'ቀርሳ ፈለገ ብርሐን ቅድስት ልደታ ለማርያም እና አቡነ ገብርኤል መንፈስ ቅዱስ ቤ/ክ',
  save: 'አስቀምጥ',
  saving: 'በማስቀመጥ ላይ…',
  saved: 'ተቀምጧል',
  cancel: 'ተወው',
  close: 'ዝጋ',
  add: 'ጨምር',
  edit: 'አስተካክል',
  remove: 'አስወግድ',
  delete: 'አጥፋ',
  search: 'ፈልግ',
  filter: 'አጣራ',
  reset: 'አጽዳ',
  back: 'ተመለስ',
  next: 'ቀጥል',
  previous: 'ወደ ኋላ',
  confirm: 'አረጋግጥ',
  yes: 'አዎ',
  no: 'አይ',
  loading: 'በመጫን ላይ…',
  empty: 'ምንም መረጃ የለም',
  emptySearch: 'በዚህ ፍለጋ ምንም አልተገኘም',
  required: 'አስፈላጊ',
  optional: 'ከፈለጉ',
  all: 'ሁሉም',
  none: 'የለም',
  details: 'ዝርዝር',
  actions: 'ተግባራት',
  status: 'ሁኔታ',
  date: 'ቀን',
  time: 'ሰዓት',
  name: 'ስም',
  note: 'ማስታወሻ',
  reason: 'ምክንያት',
  amount: 'መጠን',
  total: 'ጠቅላላ',
  created_by: 'የፈጠረው',
  updated_at: 'የተሻሻለበት ጊዜ',
  today: 'ዛሬ',
  yesterday: 'ትናንት',
  signIn: 'ግባ',
  signOut: 'ውጣ',
  profile: 'የግል መገለጫ',
  dashboard: 'አጠቃላይ እይታ',
  reports: 'ሪፖርት',
  exportExcel: 'ወደ ኤክሴል',
  exportPdf: 'ለማተሚያ (ፒዲኤፍ)',
  copyLink: 'አገናኙን ቅዳ',
  pendingApprovals: 'ማጽደቅ የሚጠብቁ',
  permissionDenied: 'ይህንን ለማድረግ መብት የላይኝም',
  notFound: 'የተጠየቀው ገጽ ወይም መረጃ አልተገኘም',
  tryAgain: 'እንደገና ይሞክሩ',
  serverError: 'ያልተጠበቀ ችግር ተፈጥሯል',
  submitForApproval: 'ላጽደቅ አቅርብ',
  approve: 'ጸድቅ',
  reject: 'ውድቅ አድርግ',
  publish: 'አውቅ',
  unpublish: 'ከማውቂያ አውጣ',
  returnForEdit: 'ለአስተካካይ ምለስ',
  languageNote: 'ሁሉም መረጃ በአማርኛ ይገኛል',
} as const;

/** Module and portal names, in the order the specification groups them. */
export const MODULE_NAMES: Record<string, string> = {
  dashboard: 'አጠቃላይ እይታ',
  website: 'ድረ-ገጽ',
  pages: 'ገጾች',
  news: 'ዜናዎች',
  events: 'ፕሮግራሞች',
  gallery: 'ፎቶ ማህደር',
  sermons: 'ንግዶች',
  mezmur: 'መዝሙሮች',
  media: 'ሐቀፍና ድምጽ ማህደር',
  students: 'ተማሪዎች',
  teachers: 'መምህራን',
  classes: 'ክፍሎች',
  academics: 'የትምህርት ሥራ',
  attendance: 'መገኘት',
  exams: 'ፈተናዎች',
  results: 'ውጤቶች',
  applications: 'ማመልከቻዎች',
  departments: 'ዘርፎች',
  finance: 'ሒሳብና ገንዘብ',
  budget: 'በጀት',
  donations: 'ለጋሾች',
  inventory: 'እቃ ክምችት',
  assets: 'ቋሚ ንብረቶች',
  library: 'መጻሕፍት ማዕከል',
  documents: 'ሰነዶች',
  certificates: 'ምስክር ወረቀቶች',
  volunteers: 'በፈቃደኝነት አገልግሎት',
  communication: 'ግንኙነት',
  messages: 'መልእክቶች',
  announcements: 'ማስታወቂያዎች',
  reports: 'ሪፖርትና ትንተና',
  system: 'ስርዓት አስተዳደር',
  users: 'ተጠቃሚዎች',
  roles: 'ሚናዎችና ፍቃዶች',
  approvals: 'የሥራ ማጽደቅ',
  audit: 'የቁጥጥር መዝገብ',
  settings: 'ቅንብሮች',
  backups: 'ቅጂ ማድረግ',
  portal_student: 'የተማሪ ገጽ',
  portal_parent: 'የወላጅ ገጽ',
  portal_teacher: 'የመምህር ገጽ',
  portal_department: 'የዘርፍ ኃላፊ ገጽ',
};

export function moduleName(key: string): string {
  return MODULE_NAMES[key] ?? key;
}

/** Shared select options so a dropdown and a table badge never disagree. */
export function enumLabel<K extends string>(map: Record<K, string>, value: K | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return map[value as K] ?? String(value);
}
