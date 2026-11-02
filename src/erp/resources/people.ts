// Teachers and departments — the roster half of the ERP: the staff who teach,
// the lesson plans they write, the departments they serve in and the choirs
// that lead the mezmur.
//
// None of these tables is a `content_types` row, so nothing here carries the
// draft→approve→publish ladder; every select lists only the values the CHECK
// constraints and enums in the migrations will actually accept.

import type { Resource, Option } from '../crud/resource';
import { fkOptions } from '../crud/options';
import { CONTENT_STATE } from '@/lib/i18n';

/** `departments.state` — the `content_state` enum, set directly (no workflow RPCs). */
const CONTENT_STATE_OPTIONS: Option[] = Object.entries(CONTENT_STATE).map(([value, label]) => ({
  value,
  label,
}));

/** `lesson_plans.status` — the CHECK list in 20261102000600_academics.sql. */
const LESSON_PLAN_STATUS_OPTIONS: Option[] = [
  { value: 'draft', label: 'ቅድመ ሐሳብ' },
  { value: 'submitted', label: 'የቀረበ' },
  { value: 'approved', label: 'ጸድቋል' },
  { value: 'rejected', label: 'አልጸደቀም' },
];

/** `department_members.role_key` — the CHECK list in 20261102000800_departments.sql. */
const DEPARTMENT_ROLE_OPTIONS: Option[] = [
  { value: 'head', label: 'ኃላፊ' },
  { value: 'vice_head', label: 'የኃላፊ ምክትል' },
  { value: 'secretary', label: 'ደብተላ' },
  { value: 'treasurer', label: 'ገንዘብ ሐቢር' },
  { value: 'coordinator', label: 'አስተባባሪ' },
  { value: 'member', label: 'አባል' },
  { value: 'advisor', label: 'አማካሪ' },
];

/** `department_members.status` — narrower than the member enum. */
const DEPT_MEMBER_STATUS_OPTIONS: Option[] = [
  { value: 'active', label: 'ንቁ' },
  { value: 'inactive', label: 'ያልተገናኘ' },
  { value: 'transferred', label: 'የተሻገረ' },
];

/** `department_activities.kind` — the CHECK list in departments.sql. */
const ACTIVITY_KIND_OPTIONS: Option[] = [
  { value: 'meeting', label: 'ስብሰባ' },
  { value: 'service', label: 'አገልግሎት' },
  { value: 'outreach', label: 'የውጭ ተልእኮ' },
  { value: 'training', label: 'ሰለጠና' },
  { value: 'performance', label: 'የመዝሙር አቅርቦት' },
  { value: 'visit', label: 'ጉብኝት' },
  { value: 'project', label: 'ፕሮጀክት' },
  { value: 'other', label: 'ሌላ' },
];

/** `department_activities.status` — the CHECK list in departments.sql. */
const ACTIVITY_STATUS_OPTIONS: Option[] = [
  { value: 'planned', label: 'የታቀደ' },
  { value: 'ongoing', label: 'በሂደት ላይ' },
  { value: 'completed', label: 'ጠናቋል' },
  { value: 'cancelled', label: 'ተሰርዟል' },
];

/** `choir_members.voice_part` — the CHECK list in departments.sql. */
const VOICE_PART_OPTIONS: Option[] = [
  { value: 'soprano', label: 'ሶፕራኖ' },
  { value: 'alto', label: 'አልቶ' },
  { value: 'tenor', label: 'ቴኖር' },
  { value: 'bass', label: 'ባስ' },
  { value: 'leader', label: 'መሪ' },
  { value: 'kebero', label: 'ከበሮ' },
  { value: 'washint', label: 'ዋሽንት' },
  { value: 'krar', label: 'ክራር' },
  { value: 'other', label: 'ሌላ' },
];

/** `choir_members.status` — the CHECK list in departments.sql. */
const CHOIR_MEMBER_STATUS_OPTIONS: Option[] = [
  { value: 'active', label: 'ንቁ' },
  { value: 'inactive', label: 'ያልተገናኘ' },
];

export const teacherProfilesResource = {
  table: 'teacher_profiles',
  titleAm: 'መምህራንና ሠራተኞች',
  singularAm: 'መምህር',
  description: 'የመምህራንና የሠራተኞች ዋና ሐዘር መዝገብ፤ አንድ ተጠቃሚ ሲተሳሰር የመተግበሪያ ገጹ መንገድ ይከፈታል።',
  read: 'teachers.read',
  write: 'teachers.write',
  remove: 'teachers.write',
  search: ['full_name_am', 'staff_code', 'full_name_en', 'title_am'],
  order: { by: 'created_at', descending: true },
  defaults: { is_active: true, can_teach_liturgy: true },
  fields: [
    { key: 'staff_code', label: 'የሠራተኛ ቁጥር', kind: 'text', help: 'ለምሳሌ TCH-2019-0007' },
    { key: 'full_name_am', label: 'ሙሉ ስም', kind: 'text', required: true },
    { key: 'full_name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'title_am', label: 'የሥራ ሐሳብ', kind: 'text', placeholder: 'መምህር / ዳርስ ላቤ / አስተባባሪ' },
    { key: 'specializations', label: 'የሚያስተምሩት', kind: 'tags', help: 'በሰሌዳ የተለያዩ — ለምሳሌ የመጻሕፍት ጉዳዮች, ዕብራይስጥ' },
    { key: 'qualification', label: 'ትምህርታዊ ደረጃ', kind: 'text', hideFromList: true },
    { key: 'phone', label: 'ስልክ', kind: 'phone' },
    { key: 'email', label: 'ኢሜይል', kind: 'email', hideFromList: true },
    { key: 'photo_media_id', label: 'ፎቶ', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'user_id', label: 'የተያያዘ ተጠቃሚ', kind: 'media', load: fkOptions('profiles', 'full_name_am'), hideFromList: true, help: 'የመምህር ገጽ ሲከፈት' },
    { key: 'bio_am', label: 'ነገራ', kind: 'textarea', hideFromList: true },
    { key: 'hired_on', label: 'የተቀላቀለበት ቀን', kind: 'date' },
    { key: 'is_active', label: 'ንቁ መምህር', kind: 'checkbox' },
    { key: 'can_teach_liturgy', label: 'የአገልግሎት ሥርዓት ያስተምራል', kind: 'checkbox' },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'teacher_profiles'>;

export const lessonPlansResource = {
  table: 'lesson_plans',
  titleAm: 'የትምህርት ዕቅዶች',
  singularAm: 'ዕቅድ',
  description: 'መምህራን ለእያንዳንዱ ቀን የሚዘጋጁት ዕቅድ፤ ከቅድመ ሐሳብ ወደ ግምገማ በዚህ ሁኔታ ይደረጋል።',
  read: 'teachers.read',
  write: 'teachers.write',
  remove: 'teachers.write',
  search: ['title_am'],
  order: { by: 'created_at', descending: true },
  defaults: { status: 'draft' },
  fields: [
    { key: 'teacher_id', label: 'መምህር', kind: 'media', required: true, load: fkOptions('teacher_profiles', 'full_name_am') },
    { key: 'plan_for', label: 'የታቀደበት ቀን', kind: 'date', required: true },
    { key: 'title_am', label: 'ርዕስ', kind: 'text', required: true },
    { key: 'class_id', label: 'ክፍል', kind: 'media', load: fkOptions('classes', 'name_am'), hideFromList: true },
    { key: 'subject_id', label: 'ሁርአት', kind: 'media', load: fkOptions('subjects', 'name_am'), hideFromList: true },
    { key: 'unit_id', label: 'ትምህርታዊ ክፍል (unit)', kind: 'media', load: fkOptions('curriculum_units', 'title_am'), hideFromList: true },
    { key: 'objectives_am', label: 'ዓላማዎች', kind: 'textarea', hideFromList: true },
    { key: 'content_am', label: 'የትምህርት ይዘት', kind: 'textarea', hideFromList: true },
    { key: 'activities_am', label: 'ተግባራት', kind: 'textarea', hideFromList: true },
    { key: 'materials_am', label: 'ተጨማሪ ቁሳቁሶች', kind: 'textarea', hideFromList: true },
    { key: 'assessment_am', label: 'የግምገማ ዘዴ', kind: 'textarea', hideFromList: true },
    { key: 'reflection_am', label: 'ከተሰጠ በኋላ ማስታወሻ', kind: 'textarea', hideFromList: true },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: LESSON_PLAN_STATUS_OPTIONS, required: true, default: 'draft' },
    { key: 'reviewed_by', label: 'የገመገመው', kind: 'media', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'review_notes', label: 'የግምገማ ማስታወሻ', kind: 'textarea', maxLength: 4000, hideFromList: true },
    { key: 'created_at', label: 'የተፃፈበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'lesson_plans'>;

export const departmentsResource = {
  table: 'departments',
  titleAm: 'ክፍሎች/ዘርፎች',
  singularAm: 'ክፍል',
  description: 'የቤተ ክርስቲያኑ ዘርፎች — መዝሙር፣ ትምህርት፣ ጸሎትና ሌሎች። በድረ ገጹ ላይ የሚታዩት ሁኔታቸው “ታውቋል” ሲሆን ነው።',
  read: 'departments.read',
  write: 'departments.write',
  remove: 'departments.write',
  search: ['slug', 'name_am', 'name_en'],
  order: { by: 'sort_order' },
  defaults: { is_public: true, state: 'published', sort_order: 0 },
  fields: [
    { key: 'slug', label: 'አድራሻ ሐጸር (slug)', kind: 'slug', required: true, help: 'በትንሹ እንግሊዝኛና በቁጥር ብቻ፤ ለምሳሌ mezmur' },
    { key: 'name_am', label: 'ስም', kind: 'text', required: true },
    { key: 'name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'summary_am', label: 'አጭር መግለጫ', kind: 'textarea', hideFromList: true },
    { key: 'mission_am', label: 'ተልእኮ', kind: 'textarea', hideFromList: true },
    { key: 'icon', label: 'ምልክት (icon)', kind: 'text', hideFromList: true, placeholder: 'የlucide ምልክት ስም' },
    { key: 'accent_color', label: 'ቀለም', kind: 'text', hideFromList: true, placeholder: '#RRGGBB' },
    { key: 'head_member_id', label: 'ኃላፊ', kind: 'media', load: fkOptions('members', 'full_name_am'), hideFromList: true },
    { key: 'coordinator_member_id', label: 'አስተባባሪ', kind: 'media', load: fkOptions('members', 'full_name_am'), hideFromList: true },
    { key: 'contact_phone', label: 'የክፍል ስልክ', kind: 'phone', hideFromList: true },
    { key: 'contact_email', label: 'የክፍል ኢሜይል', kind: 'email', hideFromList: true },
    { key: 'sort_order', label: 'ድርድር', kind: 'number', required: true, min: 0 },
    { key: 'is_public', label: 'በድረ ገጽ ይታያል', kind: 'checkbox' },
    { key: 'state', label: 'ሁኔታ', kind: 'select', options: CONTENT_STATE_OPTIONS, required: true, default: 'published' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'departments'>;

export const departmentMembersResource = {
  table: 'department_members',
  titleAm: 'የክፍል አባሎች',
  singularAm: 'ደረጃ',
  description: 'የትኛው አባል በየትኛው ክፍል ምን ደረጃ እንደሚያገለግል። አገልግሎት ሲወገድ ቀኑና ሁኔታው ይመዘገባል፤ ሰሙኑ ለቡድኑ ኃላፊነት ይቀራል።',
  read: 'departments.read',
  write: 'departments.write',
  search: ['role_key', 'title_am'],
  order: { by: 'created_at', descending: true },
  defaults: { role_key: 'member', status: 'active' },
  fields: [
    { key: 'department_id', label: 'ክፍል', kind: 'media', required: true, load: fkOptions('departments', 'name_am') },
    { key: 'member_id', label: 'አባል', kind: 'media', required: true, load: fkOptions('members', 'full_name_am') },
    { key: 'role_key', label: 'ደረጃ', kind: 'select', options: DEPARTMENT_ROLE_OPTIONS, required: true, default: 'member' },
    { key: 'title_am', label: 'የሚታየው ሐሳብ', kind: 'text', hideFromList: true, placeholder: 'ለምሳሌ የመዝሙር መሪ' },
    { key: 'joined_on', label: 'የጀመረበት ቀን', kind: 'date', required: true },
    { key: 'ended_on', label: 'የጨረመበት ቀን', kind: 'date', hideFromList: true },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: DEPT_MEMBER_STATUS_OPTIONS, required: true, default: 'active' },
    { key: 'note_am', label: 'ማስታወሻ', kind: 'textarea', hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'department_members'>;

export const departmentActivitiesResource = {
  table: 'department_activities',
  titleAm: 'የክፍል እንቅስቃሴዎች',
  singularAm: 'እንቅስቃሴ',
  description: 'ክፍሎች የሚያከናውኗቸው ስብሰባዎች፣ ተልእኮዎችና ፕሮጀክቶች፤ ወጪውና ሰዓቱ ለሪፖርት ይመዘገባል።',
  read: 'departments.read',
  write: 'departments.write',
  remove: 'departments.write',
  search: ['title_am', 'location_am'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'created_by' },
  defaults: { kind: 'meeting', status: 'planned', currency: 'ETB' },
  fields: [
    { key: 'department_id', label: 'ክፍል', kind: 'media', required: true, load: fkOptions('departments', 'name_am') },
    { key: 'title_am', label: 'ርዕስ', kind: 'text', required: true },
    { key: 'kind', label: 'ዓይነት', kind: 'select', options: ACTIVITY_KIND_OPTIONS, required: true, default: 'meeting' },
    { key: 'activity_on', label: 'የተካሄደበት/ሚካሄድበት ቀን', kind: 'date', required: true },
    { key: 'location_am', label: 'ቦታ', kind: 'text' },
    { key: 'event_id', label: 'የተያያዘ ፕሮግራም', kind: 'media', load: fkOptions('events', 'title_am'), hideFromList: true },
    { key: 'summary_am', label: 'ማቅረብ', kind: 'textarea', hideFromList: true },
    { key: 'outcome_am', label: 'ውጤት', kind: 'textarea', hideFromList: true },
    { key: 'participants', label: 'ተሳታፊዎች (JSON)', kind: 'json', hideFromList: true, help: '[{member_id, role}]' },
    { key: 'hours', label: 'ሰዓት', kind: 'number', min: 0, hideFromList: true },
    { key: 'budget_spent', label: 'የተወጣ ወጪ', kind: 'money', hideFromList: true },
    { key: 'currency', label: 'ብር ዓይነት', kind: 'text', default: 'ETB', hideFromList: true },
    { key: 'photos', label: 'ፎቶዎች (JSON)', kind: 'json', hideFromList: true, help: '[media_id]' },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: ACTIVITY_STATUS_OPTIONS, required: true, default: 'planned' },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'department_activities'>;

export const choirsResource = {
  table: 'choirs',
  titleAm: 'የመዝሙር ቡድኖች',
  singularAm: 'ቡድን',
  description: 'የሚዘምሩ ቡድኖች መዝገብ፤ አባላቱና ዜማ አቅርቦቶቻቸው በተናጠል ገጾች ይይዛሉ።',
  read: 'departments.read',
  write: 'departments.write',
  remove: 'departments.write',
  search: ['name_am', 'name_en'],
  order: { by: 'created_at', descending: true },
  defaults: { is_public: true },
  fields: [
    { key: 'name_am', label: 'ስም', kind: 'text', required: true },
    { key: 'name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'department_id', label: 'የሚመደብበት ክፍል', kind: 'media', load: fkOptions('departments', 'name_am'), hideFromList: true },
    { key: 'conductor_member_id', label: 'መሪ (ኮንዳክተር)', kind: 'media', load: fkOptions('members', 'full_name_am'), hideFromList: true },
    { key: 'summary_am', label: 'መግለጫ', kind: 'textarea', hideFromList: true },
    { key: 'photo_media_id', label: 'ፎቶ', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'is_public', label: 'በድረ ገጽ ይታያል', kind: 'checkbox' },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'choirs'>;

export const choirMembersResource = {
  table: 'choir_members',
  keyFields: ['choir_id', 'member_id'],
  titleAm: 'የቡድን አባላት',
  singularAm: 'አባል',
  description: 'የትኛው አባል በየትኛው ቡድን ውስጥ ምን ዜማ እንደሚዘምር። ቡድኑና አባሉ አንድ ላይ የተለየ መዝገብ ይፈጥራሉ።',
  read: 'departments.read',
  write: 'departments.write',
  search: ['voice_part', 'status'],
  // No created_at on this join table, so the newest voices lead the list.
  order: { by: 'joined_on', descending: true },
  defaults: { status: 'active' },
  fields: [
    { key: 'choir_id', label: 'ቡድን', kind: 'media', required: true, load: fkOptions('choirs', 'name_am') },
    { key: 'member_id', label: 'አባል', kind: 'media', required: true, load: fkOptions('members', 'full_name_am') },
    { key: 'voice_part', label: 'የድምጥ ክፍል', kind: 'select', options: VOICE_PART_OPTIONS },
    { key: 'joined_on', label: 'የቀላቀለበት ቀን', kind: 'date', required: true },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: CHOIR_MEMBER_STATUS_OPTIONS, required: true, default: 'active' },
  ],
} satisfies Resource<'choir_members'>;

export const choirPerformancesResource = {
  table: 'choir_performances',
  titleAm: 'የቡድን አቅርቦቶች',
  singularAm: 'አቅርቦት',
  description: 'ቡድኖች በየትኛው ቀንና በየትኛው ፕሮግራም ላይ እንደዘመሩ መዝገብ፤ ዜማዎቹና የተገኙ አባላት በJSON ይታወሳሉ።',
  read: 'departments.read',
  write: 'departments.write',
  remove: 'departments.write',
  search: ['notes_am'],
  order: { by: 'created_at', descending: true },
  fields: [
    { key: 'choir_id', label: 'ቡድን', kind: 'media', load: fkOptions('choirs', 'name_am') },
    { key: 'performed_on', label: 'የአቅረበበት ቀን', kind: 'date', required: true },
    { key: 'event_id', label: 'ፕሮግራም', kind: 'media', load: fkOptions('events', 'title_am'), hideFromList: true },
    { key: 'setlist', label: 'የዜማ ዝርዝር (JSON)', kind: 'json', hideFromList: true, help: '[{mezmur_id, order}]' },
    { key: 'attendance', label: 'የተገኙ አባላት (JSON)', kind: 'json', hideFromList: true, help: '[member_id]' },
    { key: 'notes_am', label: 'ማስታወሻ', kind: 'textarea', hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'choir_performances'>;

export const orgUnitsResource = {
  table: 'org_units',
  titleAm: 'የአዘራረብ መዋቅር',
  singularAm: 'ክፍል',
  description: 'ቤተ ክርስቲያኑ የሥራ አዘራረብ ዛፍ — ጠቅላላ ቢሮ፣ ክፍሎችና ካፍሎች በድርድር ይታሰራሉ።',
  read: 'system.read',
  write: 'system.write',
  remove: 'system.write',
  search: ['name_am', 'name_en', 'head_name'],
  order: { by: 'sort_order' },
  defaults: { is_visible: true, sort_order: 0 },
  fields: [
    { key: 'parent_id', label: 'የላይኛው አካል', kind: 'media', load: fkOptions('org_units', 'name_am'), hideFromList: true, help: 'ከለበት ዛፍ ሥር ነው' },
    { key: 'name_am', label: 'ስም', kind: 'text', required: true },
    { key: 'name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'head_label', label: 'የኃላፊው ሐሳብ', kind: 'text', hideFromList: true, placeholder: 'ሃላፊ / ዳይሬክተር' },
    { key: 'head_name', label: 'ኃላፊው ስም', kind: 'text' },
    { key: 'summary_am', label: 'መግለጫ', kind: 'textarea', hideFromList: true },
    { key: 'media_id', label: 'ምልክት/ፎቶ', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'sort_order', label: 'ድርድር', kind: 'number', required: true, min: 0 },
    { key: 'is_visible', label: 'ይታያል', kind: 'checkbox' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'org_units'>;
