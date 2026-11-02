// Academic-affairs resources — the records the teaching office lives on.
//
// A Sunday school runs on the year, the level, the class and the subjects taught
// in it; then on the sessions that prove the teaching happened and the results
// that decide promotion. Every key below names a real column, so the office gets
// a compile-time answer instead of a database rejection in front of a person.

import type { Option, Resource } from '../crud/resource';
import { fkOptions } from '../crud/options';
import { CONTENT_STATE } from '@/lib/i18n';

/** `public.content_state` for the tables that carry the column without an approval queue. */
const STATE_OPTIONS: Option[] = Object.entries(CONTENT_STATE).map(([value, label]) => ({ value, label }));

/** The `exam_type` CHECK in `20261102000600_academics.sql`. */
const EXAM_TYPE_OPTIONS: Option[] = [
  { value: 'quiz', label: 'ኩዝ (አጭር ፍተሻ)' },
  { value: 'oral', label: 'የአፍ ፈተና' },
  { value: 'written', label: 'የጽሑፍ ፈተና' },
  { value: 'practical', label: 'ተግባራዊ ፈተና' },
  { value: 'midterm', label: 'የመካከለኛ ዓመት ፈተና' },
  { value: 'final', label: 'የዓመት መደምደሚያ ፈተና' },
];

/** The `exam_results.status` CHECK. `draft` becomes `graded` by the database itself. */
const RESULT_STATUS_OPTIONS: Option[] = [
  { value: 'draft', label: 'ገና አልተመዘገበም' },
  { value: 'graded', label: 'ተመዘግቧል' },
  { value: 'released', label: 'ለተማሪው ታውቋል' },
  { value: 'absent', label: 'በፈተናው አልተገኘም' },
];

/** The `learning_materials.kind` CHECK. */
const MATERIAL_KIND_OPTIONS: Option[] = [
  { value: 'note', label: 'ማስታወሻ' },
  { value: 'slide', label: 'ቅንጥብ (slide)' },
  { value: 'audio', label: 'ድምጽ' },
  { value: 'video', label: 'ቪዲዮ' },
  { value: 'book', label: 'መጽሐፍ' },
  { value: 'worksheet', label: 'የእንቅስቃሴ ቅጽ' },
  { value: 'link', label: 'አገናኝ' },
];

/** The `class_teachers.role_key` CHECK. */
const TEACHER_ROLE_OPTIONS: Option[] = [
  { value: 'lead', label: 'ዋና መምህር' },
  { value: 'assistant', label: 'እጋሪ መምህር' },
  { value: 'guest', label: 'እንግዳ መምህር' },
];

/** The letters the seeded grade scale uses; the trigger copies them onto a result. */
const GRADE_LETTER_OPTIONS: Option[] = [
  { value: 'A+', label: 'A+' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' },
  { value: 'F', label: 'F' },
];

export const academicYearsResource = {
  table: 'academic_years',
  titleAm: 'የትምህርት ዓመታት',
  singularAm: 'የትምህርት ዓመት',
  description: 'የት/ቤቱ የዓመት ዙሪያዎች። ክፍሎች፣ ፈተናዎችና ማሻገር በሙሉ በዚህ ዓመት ሐዋሪ ላይ ይመሰረታሉ።',
  read: 'academics.read',
  write: 'academics.write',
  search: ['label_am', 'notes'],
  order: { by: 'created_at', descending: true },
  fields: [
    { key: 'label_am', label: 'የዓመቱ ስም', kind: 'text', required: true, placeholder: 'ለምሳሌ ፳፻፲፱ ሥ.ዓ' },
    { key: 'eth_year', label: 'የኢትዮጵያ ዓመት', kind: 'number', min: 1900, max: 2100, width: 'sm' },
    { key: 'starts_on', label: 'የሚጀምርበት ቀን', kind: 'date' },
    { key: 'ends_on', label: 'የሚያልምበት ቀን', kind: 'date' },
    {
      key: 'is_current',
      label: 'የሚሠራው ዓመት',
      kind: 'checkbox',
      help: 'አንድ ዓመት ብቻ ነው “የሚሠራ” ሆኖ የሚቆየው፤ አዲሱን ሲያንቀሳቅሱ የቀድሞውን ያስወግዱ።',
    },
    { key: 'notes', label: 'ማስታወሻ', kind: 'textarea', hideFromList: true },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'academic_years'>;

export const classLevelsResource = {
  table: 'class_levels',
  titleAm: 'የትምህርት ደረጃዎች',
  singularAm: 'ደረጃ',
  description: 'ከሕፃናት እስከ አባቶች ያሉት የትምህርት ደረጃዎች። ተማሪ ሲሻገር ወደ ቀጣዩ ደረጃ ይሄዳል።',
  read: 'academics.read',
  write: 'academics.write',
  search: ['key', 'name_am', 'description_am'],
  order: { by: 'order_no' },
  fields: [
    { key: 'key', label: 'ቁልፍ (ለስርዓቱ)', kind: 'text', required: true, width: 'sm', placeholder: 'l1, youth, adult', help: 'በትንሹ እንግሊዝኛ፣ ቁጥርና _ ብቻ፤ ክፍሎች በዚህ ቁልፍ ስለሚገናኙ በኋላ አይቀየርም።' },
    { key: 'name_am', label: 'የደረጃው ስም', kind: 'text', required: true },
    { key: 'order_no', label: 'ድርድር', kind: 'number', required: true, min: 0, width: 'sm', help: 'ትንሽ ቁጥር = ዝቅተኛ ደረጃ።' },
    { key: 'age_min', label: 'ከዕድሜ ዝቅተኛ', kind: 'number', min: 0, max: 120, width: 'sm' },
    { key: 'age_max', label: 'ከዕድሜ ከፍተኛ', kind: 'number', min: 0, max: 120, width: 'sm' },
    { key: 'description_am', label: 'መግለጫ', kind: 'textarea', hideFromList: true },
    {
      key: 'next_level_id',
      label: 'ቀጣይ ደረጃ',
      kind: 'media',
      load: fkOptions('class_levels', 'name_am'),
      hideFromList: true,
      help: 'በማሻገር ጊዜ ተማሪው የሚሄድበት ደረጃ።',
    },
    { key: 'is_active', label: 'ንቁ ደረጃ', kind: 'checkbox' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'class_levels'>;

export const classesResource = {
  table: 'classes',
  titleAm: 'ክፍሎች',
  singularAm: 'ክፍል',
  description: 'በየዓመቱ የሚከፈቱ ክፍሎች። መምህራኑን፣ ትምህርቶቹንና ተማሪዎቹን የሚያገናኙት እነዚህ ናቸው።',
  read: 'academics.read',
  write: 'academics.write',
  remove: 'academics.write',
  search: ['code', 'name_am', 'room_am'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'created_by' },
  fields: [
    { key: 'code', label: 'የክፍል ሐዋሪ', kind: 'text', required: true, width: 'sm', placeholder: 'ለምሳሌ L1-A' },
    { key: 'name_am', label: 'የክፍል ስም', kind: 'text', required: true },
    { key: 'level_id', label: 'ደረጃ', kind: 'media', load: fkOptions('class_levels', 'name_am'), hideFromList: true },
    {
      key: 'academic_year_id',
      label: 'የትምህርት ዓመት',
      kind: 'media',
      load: fkOptions('academic_years', 'label_am'),
      help: 'ባዶ ከሆነ ክፍሉ ለማንኛውም ዓመት ዝግጁ ተብሎ ይወሰዳል።',
      hideFromList: true,
    },
    { key: 'department_id', label: 'ዘርፍ', kind: 'media', load: fkOptions('departments', 'name_am'), hideFromList: true },
    { key: 'room_am', label: 'ክፍል/ቦታ', kind: 'text', width: 'sm' },
    { key: 'capacity', label: 'ፍቃደኛ ብዛት', kind: 'number', min: 0, width: 'sm' },
    { key: 'meets_summary_am', label: 'የሚገናኝበት ጊዜ', kind: 'text', placeholder: 'እሁድ ማልሶ ፱:፻' },
    { key: 'age_min', label: 'ከዕድሜ ዝቅተኛ', kind: 'number', min: 0, max: 120, width: 'sm', hideFromList: true },
    { key: 'age_max', label: 'ከዕድሜ ከፍተኛ', kind: 'number', min: 0, max: 120, width: 'sm', hideFromList: true },
    { key: 'schedule', label: 'ሰዓተ ትምህርት (JSON)', kind: 'json', hideFromList: true, help: '[ { "day": 0, "start": "09:00", "end": "10:00" } ] — 0 = እሁድ' },
    { key: 'description_am', label: 'ስለ ክፍሉ', kind: 'textarea', hideFromList: true },
    { key: 'is_active', label: 'በዚህ ዓመት ይሠራል', kind: 'checkbox' },
    { key: 'created_at', label: 'የተከፈተበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'classes'>;

export const subjectsResource = {
  table: 'subjects',
  titleAm: 'ትምህርቶች',
  singularAm: 'ትምህርት',
  description: 'የሚያስተምሯቸው ትምህርቶች። እያንዳንዱ ክፍል ምን እንደሚያከትል በ “የክፍል ትምህርቶች” ቡድን ይመረጣል።',
  read: 'academics.read',
  write: 'academics.write',
  remove: 'academics.write',
  search: ['code', 'name_am', 'name_en', 'category_am'],
  order: { by: 'order_no' },
  fields: [
    { key: 'code', label: 'የትምህርት ሐዋሪ', kind: 'text', required: true, width: 'sm', placeholder: 'S300' },
    { key: 'name_am', label: 'ስም', kind: 'text', required: true },
    { key: 'name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'level_id', label: 'ለየትኛው ደረጃ', kind: 'media', load: fkOptions('class_levels', 'name_am'), hideFromList: true },
    { key: 'category_am', label: 'መደብ', kind: 'text', placeholder: 'መሠረተ እምነት፣ ሥርዓት፣ ታሪክ' },
    { key: 'weekly_hours', label: 'በሳምንት ሰዓት', kind: 'number', min: 0, max: 40, width: 'sm' },
    { key: 'description_am', label: 'ማብራሪያ', kind: 'textarea', hideFromList: true },
    { key: 'order_no', label: 'ድርድር', kind: 'number', required: true, min: 0, width: 'sm' },
    { key: 'is_active', label: 'ንቁ ትምህርት', kind: 'checkbox' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'subjects'>;

export const classSubjectsResource = {
  table: 'class_subjects',
  keyFields: ['class_id', 'subject_id'],
  titleAm: 'የክፍል ትምህርቶች',
  singularAm: 'የክፍል ትምህርት',
  description: 'የትኛው ክፍል ምን ትምህርት እንደሚያከትል የሚያሳይ ቡድን። አንድ ጊዜ ለአንድ ክፍልና ትምህርት ብቻ ይቆያል።',
  read: 'academics.read',
  write: 'academics.write',
  order: { by: 'class_id' },
  fields: [
    { key: 'class_id', label: 'ክፍል', kind: 'media', required: true, load: fkOptions('classes', 'name_am', 'code') },
    { key: 'subject_id', label: 'ትምህርት', kind: 'media', required: true, load: fkOptions('subjects', 'name_am', 'code') },
  ],
} satisfies Resource<'class_subjects'>;

export const curriculumUnitsResource = {
  table: 'curriculum_units',
  titleAm: 'የትምህርት ዕቅድ ክፍሎች',
  singularAm: 'ዕቅድ ክፍል',
  description: 'ለአንድ ትምህርት በድርድር የሚሠሩ የትምህርት ክፍሎች። የተሠራ ቀን በ “የክፍል ትምህርት ቀናት” ላይ ተመዝግቦ ከእነዚህ ክፍሎች ጋር ይገናኛል።',
  read: 'academics.read',
  write: 'academics.write',
  remove: 'academics.write',
  search: ['title_am', 'summary_am', 'scripture_refs'],
  order: { by: 'unit_no' },
  fields: [
    { key: 'subject_id', label: 'ትምህርት', kind: 'media', required: true, load: fkOptions('subjects', 'name_am', 'code') },
    { key: 'level_id', label: 'ደረጃ', kind: 'media', load: fkOptions('class_levels', 'name_am'), hideFromList: true },
    { key: 'unit_no', label: 'የክፍል ቁጥር', kind: 'number', required: true, min: 1, width: 'sm' },
    { key: 'title_am', label: 'ርዕስ', kind: 'text', required: true },
    { key: 'summary_am', label: 'አጭር ማብራሪያ', kind: 'textarea', hideFromList: true },
    { key: 'objectives_am', label: 'የትምህርት ዓላማ', kind: 'textarea', hideFromList: true, help: 'ተማሪው በክፍሉ መጨረሻ ምን ማድረግ እንደሚችል ይጻፉ።' },
    { key: 'scripture_refs', label: 'የቅዱስ ውቅር ሐዋሳ', kind: 'text', hideFromList: true, placeholder: '1 ዜና ፩፥፩-፲፥ ዮሐ ፫፥፯' },
    { key: 'duration_weeks', label: 'የሚወስደው ሳምንት', kind: 'number', required: true, min: 1, max: 60, width: 'sm' },
    { key: 'materials', label: 'የሚያስፈልግ ሐቀፍ (JSON)', kind: 'json', hideFromList: true, help: '[ "የመዝሙር መጽሐፍ", "ሰዓት መጽሐፍ" ] ብለው ይጻፉ።' },
    { key: 'is_published', label: 'ለመምህራኑ ታይቷል', kind: 'checkbox' },
    { key: 'created_at', label: 'የተጨመረበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'curriculum_units'>;

export const classTeachersResource = {
  table: 'class_teachers',
  titleAm: 'የክፍል መምህራን',
  singularAm: 'የክፍል መምህር',
  description: 'ማን በየትኛው ክፍል እንደሚያስተምር። መምህር እዚህ ከተመደበ በኋላ ነው የራሱን ክፍል መገኘትና ውጤት የሚመዘግበው።',
  read: 'academics.read',
  write: 'academics.write',
  remove: 'academics.write',
  search: ['role_key'],
  order: { by: 'created_at', descending: true },
  fields: [
    { key: 'class_id', label: 'ክፍል', kind: 'media', required: true, load: fkOptions('classes', 'name_am', 'code') },
    { key: 'teacher_id', label: 'መምህር', kind: 'media', required: true, load: fkOptions('teacher_profiles', 'full_name_am') },
    { key: 'subject_id', label: 'ትምህርት', kind: 'media', load: fkOptions('subjects', 'name_am', 'code'), hideFromList: true, help: 'ባዶ ማለት ለመላው ክፍል ተመድቧል ማለት ነው።' },
    { key: 'role_key', label: 'ሚና', kind: 'select', options: TEACHER_ROLE_OPTIONS, required: true, default: 'lead', width: 'sm' },
    { key: 'assigned_on', label: 'የተመደበበት ቀን', kind: 'date', required: true },
    { key: 'removed_on', label: 'የተወገደበት ቀን', kind: 'date', help: 'ቀን ሲገባ ክፍሉ ይዘጋል፤ መዝገቡ ግን ይቆያል።' },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'class_teachers'>;

export const classSessionsResource = {
  table: 'class_sessions',
  titleAm: 'የክፍል ትምህርት ቀናት',
  singularAm: 'የትምህርት ቀን',
  description: 'በየትኛው ክፍል በየቀኑ የተሠራው ትምህርት መዝገብ። ቀኑ ከተመዘገበ በኋላ መገኘቱ በ “መገኘት” ገጽ ይቆጠባል።',
  read: 'academics.read',
  write: 'academics.write',
  remove: 'academics.write',
  search: ['topic_am', 'summary_am', 'homework_am'],
  order: { by: 'held_on', descending: true },
  ownedBy: { createdBy: 'created_by' },
  fields: [
    { key: 'class_id', label: 'ክፍል', kind: 'media', required: true, load: fkOptions('classes', 'name_am', 'code') },
    { key: 'held_on', label: 'የተሠራበት ቀን', kind: 'date', required: true },
    { key: 'starts_at', label: 'የጀመረበት ሰዓት', kind: 'time', width: 'sm' },
    { key: 'ends_at', label: 'የያለመበት ሰዓት', kind: 'time', width: 'sm' },
    { key: 'subject_id', label: 'ትምህርት', kind: 'media', load: fkOptions('subjects', 'name_am', 'code'), hideFromList: true },
    { key: 'unit_id', label: 'የትምህርት ክፍል', kind: 'media', load: fkOptions('curriculum_units', 'title_am'), hideFromList: true },
    { key: 'teacher_id', label: 'ያስተማረው መምህር', kind: 'media', load: fkOptions('teacher_profiles', 'full_name_am'), hideFromList: true },
    { key: 'topic_am', label: 'የዕለቱ ርዕስ', kind: 'text' },
    { key: 'summary_am', label: 'የተሠራው ማጠቃለያ', kind: 'textarea', hideFromList: true },
    { key: 'homework_am', label: 'የተሰጠ ቤት ሥራ', kind: 'textarea', hideFromList: true },
    { key: 'attendance_taken', label: 'መገኘት ተመዝግቧል', kind: 'checkbox' },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'class_sessions'>;

export const learningMaterialsResource = {
  table: 'learning_materials',
  titleAm: 'የትምህርት ሐቀፎች',
  singularAm: 'የትምህርት ሐቀፍ',
  description: 'ለክፍሎች የሚዘጋጁ ማስታወሻዎች፣ ቅንጥቦች፣ ድምጽና መጻሕፍት። ቅድመ ሐሳብ ሆኖ ይጀምራል፣ ለማጽደቅ ይቀርባል፣ ከጸደቀ በኋላ ይወጣል።',
  read: 'academics.read',
  write: 'academics.write',
  publish: 'academics.publish',
  approve: 'academics.publish',
  remove: 'academics.write',
  workflow: 'material',
  stateKey: 'state',
  search: ['title_am', 'kind', 'external_url'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'uploaded_by' },
  fields: [
    { key: 'title_am', label: 'ርዕስ', kind: 'text', required: true },
    { key: 'kind', label: 'ዓይነት', kind: 'select', options: MATERIAL_KIND_OPTIONS, required: true, width: 'sm' },
    { key: 'summary_am', label: 'አጭር ማብራሪያ', kind: 'textarea', hideFromList: true },
    { key: 'class_id', label: 'ክፍል', kind: 'media', load: fkOptions('classes', 'name_am', 'code'), hideFromList: true },
    { key: 'subject_id', label: 'ትምህርት', kind: 'media', load: fkOptions('subjects', 'name_am', 'code'), hideFromList: true },
    { key: 'unit_id', label: 'የትምህርት ክፍል', kind: 'media', load: fkOptions('curriculum_units', 'title_am'), hideFromList: true },
    {
      key: 'media_id',
      label: 'የተሰቀለ ፋይል',
      kind: 'media',
      load: fkOptions('media_files', 'name'),
      hideFromList: true,
      help: 'ፋይሉ በሚዲያ ማህደሩ ውስጥ መኖር አለበት፤ እዚህ መረጥ ብቻ ነው።',
    },
    { key: 'external_url', label: 'ውጭ አገናኝ', kind: 'url', hideFromList: true, placeholder: 'https://…' },
    { key: 'is_public', label: 'ለድረ ገጹ ይታይ', kind: 'checkbox' },
    { key: 'state', label: 'ሁኔታ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'download_count', label: 'የውርድ ብዛት', kind: 'number', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'learning_materials'>;

export const examsResource = {
  table: 'exams',
  titleAm: 'ፈተናዎች',
  singularAm: 'ፈተና',
  description: 'ለአንድ ክፍል የሚዘጋጁ ፈተናዎች። ጠቅላላ ነጥብና ክፍልፋይ እዚህ ይወሰናሉ — የተማሪው ነጥብ በመቶኛ ከዚህ ጋር ይሰላል።',
  read: 'results.read',
  write: 'results.write',
  remove: 'results.write',
  stateKey: 'state',
  search: ['title_am', 'exam_type'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'created_by' },
  fields: [
    { key: 'class_id', label: 'ክፍል', kind: 'media', required: true, load: fkOptions('classes', 'name_am', 'code') },
    { key: 'title_am', label: 'የፈተና ርዕስ', kind: 'text', required: true },
    { key: 'exam_type', label: 'ፈተና ዓይነት', kind: 'select', options: EXAM_TYPE_OPTIONS, required: true, default: 'final', width: 'sm' },
    { key: 'subject_id', label: 'ትምህርት', kind: 'media', load: fkOptions('subjects', 'name_am', 'code'), hideFromList: true },
    { key: 'academic_year_id', label: 'የትምህርት ዓመት', kind: 'media', load: fkOptions('academic_years', 'label_am'), hideFromList: true },
    { key: 'exam_on', label: 'የሚሰጥበት ቀን', kind: 'date' },
    { key: 'total_marks', label: 'ጠቅላላ ነጥብ', kind: 'number', required: true, min: 1, width: 'sm', help: 'ከዜሮ በላይ መሆን አለበት፤ የተማሪው ነጥብ ከዚህ ላይ ይመደባል።' },
    { key: 'weight_percent', label: 'በዓመቱ ውጤት ውስጥ ክፍልፋይ (%)', kind: 'percent', required: true, min: 0, max: 100, width: 'sm' },
    { key: 'pass_mark', label: 'የማለፊያ ነጥብ', kind: 'number', min: 0, width: 'sm' },
    { key: 'state', label: 'ሁኔታ', kind: 'select', options: STATE_OPTIONS, required: true, default: 'draft', width: 'sm' },
    { key: 'created_at', label: 'የተዘጋጀበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'exams'>;

export const examResultsResource = {
  table: 'exam_results',
  titleAm: 'የፈተና ውጤቶች',
  singularAm: 'ውጤት',
  description: 'ለአንድ ፈተና የአንድ ተማሪ ነጥብ። መቶኛውና የደረጃ ፊደሉ በስርዓቱ ይሰላሉ — እርስዎ ነጥቡን ብቻ ይመዝግቡ።',
  read: 'results.read',
  write: 'results.mark',
  publish: 'results.release',
  remove: 'results.mark',
  search: ['grade_letter', 'status', 'remarks_am'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'entered_by' },
  fields: [
    { key: 'exam_id', label: 'ፈተና', kind: 'media', required: true, load: fkOptions('exams', 'title_am') },
    { key: 'student_id', label: 'ተማሪ', kind: 'media', required: true, load: fkOptions('student_profiles', 'full_name_am', 'student_code') },
    { key: 'marks', label: 'የተሰጠ ነጥብ', kind: 'number', min: 0, width: 'sm', help: 'ከፈተናው ጠቅላላ ነጥብ በላይ ሊሆን አይችልም። ባዶ = ገና አልተመዘገበም።' },
    { key: 'percent', label: 'ከመቶ', kind: 'percent', computed: true, hideFromForm: true, width: 'sm' },
    { key: 'grade_letter', label: 'የደረጃ ፊደል', kind: 'text', computed: true, hideFromForm: true, width: 'sm' },
    {
      key: 'status',
      label: 'ሁኔታ',
      kind: 'select',
      options: RESULT_STATUS_OPTIONS,
      required: true,
      default: 'draft',
      width: 'sm',
      help: 'ነጥብ ሲገባ “ተመዘግቧል” ብሎ በራሱ ይቀየራል።',
    },
    { key: 'remarks_am', label: 'አስተያየት', kind: 'textarea', hideFromList: true },
    { key: 'entered_by', label: 'የመዘገበው', kind: 'media', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'entered_at', label: 'የተመዘገበበት ሰዓት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'released_at', label: 'የታወቀበት ሰዓት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'exam_results'>;

export const gradeScalesResource = {
  table: 'grade_scales',
  titleAm: 'የደረጃ መለኪያ',
  singularAm: 'ደረጃ',
  description: 'ከመቶኛው ወደ የደረጃ ፊደል የሚቀይረው መለኪያ። ውጤት ሲመዘገብ ፊደሉ ከዚህ ይወሰዳል፣ ስለዚህ ክፍተት አለመተው ይገባል።',
  read: 'results.read',
  write: 'academics.write',
  search: ['name_am', 'letter', 'remark_am'],
  order: { by: 'order_no' },
  fields: [
    { key: 'name_am', label: 'የደረጃ ስም', kind: 'text', required: true, placeholder: 'ለምሳሌ ረቂቅ' },
    { key: 'letter', label: 'ፊደል', kind: 'select', options: GRADE_LETTER_OPTIONS, required: true, width: 'sm' },
    { key: 'min_percent', label: 'ከመቶ ዝቅተኛ', kind: 'percent', required: true, min: 0, max: 100, width: 'sm' },
    { key: 'max_percent', label: 'ከመቶ ከፍተኛ', kind: 'percent', required: true, min: 0, max: 100, width: 'sm', help: 'ከዝቅተኛው ማነስ የለበትም።' },
    { key: 'remark_am', label: 'ማብራሪያ', kind: 'text', hideFromList: true, placeholder: 'ጥሩ፣ መካከለኛ፣ ቂኝ' },
    { key: 'order_no', label: 'ድርድር', kind: 'number', required: true, min: 0, width: 'sm' },
  ],
} satisfies Resource<'grade_scales'>;
