// Student services — the registrar's office in one file: the pupil, their family,
// their class seat, papers, cards and the applications that become them.
//
// None of these tables is a `content_types` row, so nothing here carries the
// draft→approve→publish ladder; state moves through RPCs elsewhere. Every field
// names a real column and every select lists only values the CHECK constraints
// and enums in the migrations will accept.

import type { Resource, Option } from '../crud/resource';
import { fkOptions, GENDER_OPTIONS, MEMBER_STATUS_OPTIONS } from '../crud/options';
import { APPLICATION_STATUS } from '@/lib/i18n';

/** The applications ladder, straight from the shared glossary. */
const APPLICATION_STATUS_OPTIONS: Option[] = Object.entries(APPLICATION_STATUS).map(([value, label]) => ({
  value,
  label,
}));

/** `student_enrollments.status` — the CHECK list in 20261102000600_academics.sql. */
const ENROLLMENT_STATUS_OPTIONS: Option[] = [
  { value: 'enrolled', label: 'የተመዘገበ' },
  { value: 'graduated', label: 'የተመረቀ' },
  { value: 'transferred', label: 'የተሻገረ' },
  { value: 'dropped', label: 'የተቋረጠ' },
  { value: 'suspended', label: 'የተገታ' },
];

/** `discipline_records.severity` — the CHECK list in 20261102000600_academics.sql. */
const DISCIPLINE_SEVERITY_OPTIONS: Option[] = [
  { value: 'note', label: 'ማስታወሻ' },
  { value: 'warning', label: 'ማንቂያ' },
  { value: 'counselling', label: 'ስሙግት' },
  { value: 'suspension', label: 'የጊዜ ማቆሚያ' },
  { value: 'resolved', label: 'ተፈትቷል' },
];

/** `student_documents.kind` — the CHECK list in 20261102000500_people.sql. */
const DOCUMENT_KIND_OPTIONS: Option[] = [
  { value: 'id_proof', label: 'የመታወቂያ ማረጋገጫ' },
  { value: 'baptism_cert', label: 'የጥምቀት ምስክር ወረቀት' },
  { value: 'photo', label: 'ፎቶ' },
  { value: 'medical', label: 'የሕክምና ሰነድ' },
  { value: 'consent', label: 'የፈቃድ ወረቀት' },
  { value: 'transfer', label: 'የመሸጋገሪያ ደብዳቤ' },
  { value: 'other', label: 'ሌላ' },
];

/** `applications.kind` and `applications.source` — CHECK lists in people.sql. */
const APPLICATION_KIND_OPTIONS: Option[] = [
  { value: 'student', label: 'ተማሪ' },
  { value: 'teacher', label: 'መምህር' },
  { value: 'volunteer', label: 'በፈቃደኝነት አገልጋይ' },
  { value: 'member', label: 'አባል' },
  { value: 'event', label: 'የፕሮግራም ተሳታፊ' },
];

const APPLICATION_SOURCE_OPTIONS: Option[] = [
  { value: 'website', label: 'ድረ-ገጽ' },
  { value: 'erp', label: 'በመተግበሪያው' },
  { value: 'phone', label: 'ስልክ' },
  { value: 'referral', label: 'በሌላው የተመራ' },
];

/** `event_registrations.status` and `.source` — CHECK lists in content.sql. */
const REGISTRATION_STATUS_OPTIONS: Option[] = [
  { value: 'registered', label: 'የተመዘገበ' },
  { value: 'attended', label: 'ተገኝቷል' },
  { value: 'cancelled', label: 'ተሰርዟል' },
  { value: 'no_show', label: 'አልቀረበም' },
];

const REGISTRATION_SOURCE_OPTIONS: Option[] = [
  { value: 'website', label: 'ድረ-ገጽ' },
  { value: 'erp', label: 'በመተግበሪያው' },
  { value: 'phone', label: 'ስልክ' },
];

export const studentProfilesResource = {
  table: 'student_profiles',
  titleAm: 'ተማሪዎች',
  singularAm: 'ተማሪ',
  description: 'የሰንበት ት/ቤቱ ዋና የተማሪ ሐዘር መዝገብ። አንድ ሰው አንድ መገለጫ ይኖረዋል፤ ክፍል ምዝገባው በ “የክፍል ምዝገባ” ይደረጋል።',
  read: 'students.read',
  write: 'students.write',
  remove: 'students.delete',
  search: ['full_name_am', 'student_code', 'baptismal_name_am', 'parish'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'created_by' },
  fields: [
    { key: 'student_code', label: 'የተማሪ ቁጥር', kind: 'text', required: true, help: 'የመዝገብ ቁጥር፤ ለምሳሌ STM-2018-0041' },
    { key: 'full_name_am', label: 'ሙሉ ስም', kind: 'text', required: true },
    { key: 'full_name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'baptismal_name_am', label: 'የጥምቀት ስም', kind: 'text' },
    { key: 'gender', label: 'ጾታ', kind: 'select', options: GENDER_OPTIONS },
    { key: 'birth_date', label: 'የልደት ቀን (ዓ.ም)', kind: 'date' },
    { key: 'eth_birth_date', label: 'የልደት ቀን (ግዕዝ)', kind: 'text', hideFromList: true, placeholder: 'ለምሳሌ ጥር ፩ ቀን ፳፻፲፩' },
    { key: 'phone', label: 'ስልክ', kind: 'phone' },
    { key: 'email', label: 'ኢሜይል', kind: 'email', hideFromList: true },
    { key: 'address_am', label: 'አድራሻ', kind: 'textarea', hideFromList: true },
    { key: 'parish', label: 'ቤተ ክርስቲያን/ሰብዐ', kind: 'text' },
    { key: 'photo_media_id', label: 'ፎቶ', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'status', label: 'የአባልነት ሁኔታ', kind: 'select', options: MEMBER_STATUS_OPTIONS, required: true, default: 'active' },
    { key: 'level_key', label: 'የመማሪያ ደረጃ', kind: 'text', placeholder: 'ልጆች / ወጣቶች / አዛውንት…' },
    { key: 'enrolled_on', label: 'የተጀመረበት ቀን', kind: 'date' },
    { key: 'promoted_from_id', label: 'ከተሻገረበው ተማሪ', kind: 'media', load: fkOptions('student_profiles', 'full_name_am'), hideFromList: true, help: 'ወደ ሌላ ትምህርት ቤት ሲሸጋገር የድሮው መዝገብ' },
    { key: 'linked_user_id', label: 'የተያያዘ ተጠቃሚ', kind: 'media', load: fkOptions('profiles', 'full_name_am'), hideFromList: true, help: 'ወደ መተግበሪያ ገጽ ሲገናኝ' },
    { key: 'health_notes', label: 'የጤና ማስታወሻ', kind: 'textarea', hideFromList: true },
    { key: 'notes', label: 'አጠቃላይ ማስታወሻ', kind: 'textarea', hideFromList: true },
    { key: 'qr_token', label: 'የማረጋገጫ ኮድ', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'student_profiles'>;

export const membersResource = {
  table: 'members',
  titleAm: 'የቤተ ክርስቲያን አባሎች',
  singularAm: 'አባል',
  description: 'የቤተ ክርስቲያኑ ሐዘር መዝገብ፤ ተማሪዎችና መምህራን ከዚህ ሊነሱ ይችላሉ።',
  read: 'students.read',
  write: 'students.write',
  remove: 'students.delete',
  search: ['full_name_am', 'member_code', 'baptismal_name_am', 'parish'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'created_by' },
  defaults: { is_volunteer: false, is_clergy: false },
  fields: [
    { key: 'member_code', label: 'የአባል ቁጥር', kind: 'text', help: 'ከለበት መዝገብ ቁጥር ጋር የሚዛመድ' },
    { key: 'full_name_am', label: 'ሙሉ ስም', kind: 'text', required: true },
    { key: 'full_name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'baptismal_name_am', label: 'የጥምቀት ስም', kind: 'text' },
    { key: 'gender', label: 'ጾታ', kind: 'select', options: GENDER_OPTIONS },
    { key: 'birth_date', label: 'የልደት ቀን', kind: 'date' },
    { key: 'phone', label: 'ስልክ', kind: 'phone' },
    { key: 'email', label: 'ኢሜይል', kind: 'email', hideFromList: true },
    { key: 'address_am', label: 'አድራሻ', kind: 'textarea', hideFromList: true },
    { key: 'parish', label: 'ቤተ ክርስቲያን/ሰብዐ', kind: 'text' },
    { key: 'photo_media_id', label: 'ፎቶ', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'status', label: 'የአባልነት ሁኔታ', kind: 'select', options: MEMBER_STATUS_OPTIONS, required: true, default: 'active' },
    { key: 'joined_on', label: 'ከተቀላቀለበት ቀን', kind: 'date' },
    { key: 'is_volunteer', label: 'በፈቃደኝነት ያገለግላል', kind: 'checkbox' },
    { key: 'is_clergy', label: 'ደረጃ ያለው አባ', kind: 'checkbox', hideFromList: true },
    { key: 'user_id', label: 'የተያያዘ ተጠቃሚ', kind: 'media', load: fkOptions('profiles', 'full_name_am'), hideFromList: true },
    { key: 'notes', label: 'ማስታወሻ', kind: 'textarea', hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'members'>;

export const guardiansResource = {
  table: 'guardians',
  titleAm: 'ወላጆችና ተሞጋቾች',
  singularAm: 'ወላጅ',
  description: 'ለተማሪዎች የሚመደቡ ወላጆች፤ ተማሪውን ከ“ወላጅ-ተማሪ ግንኙነት” ጋር ያስተሳስራሉ።',
  read: 'students.read',
  write: 'students.write',
  remove: 'students.delete',
  search: ['full_name_am', 'full_name_en', 'parish', 'occupation'],
  order: { by: 'created_at', descending: true },
  defaults: { is_active: true },
  fields: [
    { key: 'full_name_am', label: 'ሙሉ ስም', kind: 'text', required: true },
    { key: 'full_name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'phone', label: 'ስልክ', kind: 'phone' },
    { key: 'email', label: 'ኢሜይል', kind: 'email', hideFromList: true },
    { key: 'occupation', label: 'ሙያ', kind: 'text' },
    { key: 'address_am', label: 'አድራሻ', kind: 'textarea', hideFromList: true },
    { key: 'parish', label: 'ቤተ ክርስቲያን/ሰብዐ', kind: 'text' },
    { key: 'photo_media_id', label: 'ፎቶ', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'user_id', label: 'የተያያዘ ተጠቃሚ', kind: 'media', load: fkOptions('profiles', 'full_name_am'), hideFromList: true, help: 'የወላጅ ገጽ ሲከፈት' },
    { key: 'is_active', label: 'ንቁ ነው', kind: 'checkbox' },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'guardians'>;

export const guardianStudentsResource = {
  table: 'guardian_students',
  keyFields: ['guardian_id', 'student_id'],
  titleAm: 'ወላጅ-ተማሪ ግንኙነቶች',
  singularAm: 'ግንኙነት',
  description: 'የትኛው ወላጅ የትኛውን ተማሪ እንደሚመለከት የሚያሳይ፤ ዋናው ወላጅ ለፈቃድና ለመልእክት ይለየናል።',
  read: 'students.read',
  write: 'students.write',
  remove: 'students.delete',
  search: ['relation_am'],
  // Neither created_at nor sort_order exists on this join table, so primary
  // guardians come first.
  order: { by: 'is_primary', descending: true },
  defaults: { is_primary: false, can_consent: true },
  fields: [
    { key: 'guardian_id', label: 'ወላጅ', kind: 'media', required: true, load: fkOptions('guardians', 'full_name_am') },
    { key: 'student_id', label: 'ተማሪ', kind: 'media', required: true, load: fkOptions('student_profiles', 'full_name_am') },
    { key: 'relation_am', label: 'ግንኙነት', kind: 'text', required: true, default: 'ወላጅ', placeholder: 'እናት / አባት / አያት…' },
    { key: 'is_primary', label: 'ዋና ወላጅ', kind: 'checkbox', help: 'ለፈቃድና ለወሳኝ መልእክት የሚላክበት' },
    { key: 'can_consent', label: 'ፈቃድ ሰጪ ነው', kind: 'checkbox' },
  ],
} satisfies Resource<'guardian_students'>;

export const studentEnrollmentsResource = {
  table: 'student_enrollments',
  titleAm: 'የክፍል ምዝገባዎች',
  singularAm: 'ምዝገባ',
  description: 'የተማሪ ወደ ክፍል የሚገባበትና የሚወጣበት — በዓመት፣ በክፍል የተለየ መዝገብ።',
  read: 'students.read',
  write: 'students.write',
  remove: 'students.delete',
  search: ['status', 'seat_note'],
  order: { by: 'created_at', descending: true },
  defaults: { status: 'enrolled' },
  fields: [
    { key: 'student_id', label: 'ተማሪ', kind: 'media', required: true, load: fkOptions('student_profiles', 'full_name_am') },
    { key: 'class_id', label: 'ክፍል', kind: 'media', required: true, load: fkOptions('classes', 'name_am') },
    { key: 'academic_year_id', label: 'ዓመት', kind: 'media', load: fkOptions('academic_years', 'label_am') },
    {
      key: 'status',
      label: 'ሁኔታ',
      kind: 'select',
      options: ENROLLMENT_STATUS_OPTIONS,
      required: true,
      default: 'enrolled',
    },
    { key: 'enrolled_on', label: 'የተመዘገበበት ቀን', kind: 'date', required: true },
    { key: 'ended_on', label: 'የተጠናቀቀበት ቀን', kind: 'date', hideFromList: true },
    { key: 'seat_note', label: 'የቦታ ማስታወሻ', kind: 'text', hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'student_enrollments'>;

export const studentDocumentsResource = {
  table: 'student_documents',
  titleAm: 'የተማሪ ሰነዶች',
  singularAm: 'ሰነድ',
  description: 'ለአንድ ተማሪ የሚያገለግሉ ሰነዶች — የመታወቂያ፣ የጥምቀት ምስክር፣ ሕክምናና ፈቃድ። ፋይሉ ከሰቀላ በኋላ ይመዘገባል።',
  read: 'documents.read',
  write: 'documents.write',
  remove: 'documents.write',
  search: ['title_am', 'kind', 'bucket'],
  order: { by: 'created_at', descending: true },
  defaults: { bucket: 'private-docs', kind: 'other' },
  fields: [
    { key: 'student_id', label: 'ተማሪ', kind: 'media', required: true, load: fkOptions('student_profiles', 'full_name_am') },
    { key: 'kind', label: 'ዓይነት', kind: 'select', options: DOCUMENT_KIND_OPTIONS, required: true, default: 'other' },
    { key: 'title_am', label: 'ርዕስ', kind: 'text' },
    { key: 'bucket', label: 'ማከማቻ ቦታ', kind: 'text', required: true, default: 'private-docs', hideFromList: true },
    { key: 'storage_path', label: 'የፋይል አድራሻ', kind: 'text', required: true, hideFromList: true, help: 'ከሰቀላው በኋላ የሚመረጥ የፋይል መንገድ' },
    { key: 'expires_on', label: 'የሚያበቃበት ቀን', kind: 'date' },
    { key: 'created_at', label: 'የተጨመረበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'student_documents'>;

export const disciplineRecordsResource = {
  table: 'discipline_records',
  titleAm: 'የስነ-ምግባር መዝገቦች',
  singularAm: 'መዝገብ',
  description: 'ለተማሪ የሚይዝ ማስታወሻና ቅጣት መዝገብ፤ ወላጅ መጠነቀቂያ እንደተሰጠው ይታይናል።',
  read: 'students.read',
  write: 'students.write',
  remove: 'students.delete',
  search: ['severity', 'description_am', 'action_am'],
  order: { by: 'created_at', descending: true },
  defaults: { severity: 'note' },
  fields: [
    { key: 'student_id', label: 'ተማሪ', kind: 'media', required: true, load: fkOptions('student_profiles', 'full_name_am') },
    { key: 'recorded_on', label: 'የተመዘገበበት ቀን', kind: 'date', required: true },
    { key: 'severity', label: 'ክብደት', kind: 'select', options: DISCIPLINE_SEVERITY_OPTIONS, required: true, default: 'note' },
    { key: 'description_am', label: 'ዝርዝር ክስተት', kind: 'textarea', required: true, maxLength: 4000, hideFromList: true },
    { key: 'action_am', label: 'የተወሰደ እርምጃ', kind: 'textarea', maxLength: 2000, hideFromList: true },
    { key: 'guardian_informed', label: 'ወላጅ ተነግሯል', kind: 'checkbox' },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'discipline_records'>;

export const studentIdCardsResource = {
  table: 'student_id_cards',
  titleAm: 'የተማሪ መታወቂያ ካርዶች',
  singularAm: 'ካርድ',
  description: 'የተሰጡ የተማሪ መለያ ካርዶች። ቁጥር፣ ቀን፣ QR ኮድና ቅርጽ ካርዱ በሚያዘጋጅRPC ይሞላሉ፤ እዚህ ለማንበብ ብቻ ነው።',
  read: 'students.read',
  write: 'students.write',
  remove: 'students.delete',
  search: ['serial'],
  order: { by: 'created_at', descending: true },
  fields: [
    { key: 'student_id', label: 'ተማሪ', kind: 'media', required: true, load: fkOptions('student_profiles', 'full_name_am') },
    { key: 'serial', label: 'የካርድ ቁጥር', kind: 'text', computed: true, hideFromForm: true },
    { key: 'issued_on', label: 'የተሰጠበት ቀን', kind: 'date', computed: true, hideFromForm: true },
    { key: 'expires_on', label: 'የሚያበቃበት ቀን', kind: 'date', computed: true, hideFromForm: true },
    { key: 'qr_payload', label: 'የQR ይዘት', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'card_design', label: 'የካርድ ቅርጽ (JSON)', kind: 'json', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'printed_at', label: 'የተተሀዘበት ሰዓት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'student_id_cards'>;

export const applicationsResource = {
  table: 'applications',
  titleAm: 'ማመልከቻዎች',
  singularAm: 'ማመልከቻ',
  description: 'ከድረ-ገጽና በስልክ የሚመጡ ለተማሪ፣ መምህርና አቅም ሰጪ ማመልከቻዎች። ሁኔታው በግምገማ RPCዎች ይቀየራል፤ እዚህ ማንበብና መረጃ ማስተካከል ብቻ።',
  read: 'applications.read',
  write: 'applications.write',
  search: ['reference', 'full_name_am', 'full_name_en', 'parish'],
  order: { by: 'created_at', descending: true },
  defaults: { source: 'website' },
  fields: [
    { key: 'kind', label: 'የማመልከቻ ዓይነት', kind: 'select', options: APPLICATION_KIND_OPTIONS, required: true },
    { key: 'reference', label: 'የማመልከቻ ቁጥር', kind: 'text', required: true, help: 'የተለየ አሳሽ ቁጥር' },
    { key: 'full_name_am', label: 'ሙሉ ስም', kind: 'text', required: true },
    { key: 'full_name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'baptismal_name_am', label: 'የጥምቀት ስም', kind: 'text', hideFromList: true },
    { key: 'email', label: 'ኢሜይል', kind: 'email' },
    { key: 'phone', label: 'ስልክ', kind: 'phone' },
    { key: 'gender', label: 'ጾታ', kind: 'select', options: GENDER_OPTIONS, hideFromList: true },
    { key: 'birth_date', label: 'የልደት ቀን', kind: 'date', hideFromList: true },
    { key: 'address_am', label: 'አድራሻ', kind: 'textarea', hideFromList: true },
    { key: 'parish', label: 'ቤተ ክርስቲያን/ሰብዐ', kind: 'text' },
    { key: 'guardian_name', label: 'የወላጅ ስም', kind: 'text', hideFromList: true },
    { key: 'guardian_phone', label: 'የወላጅ ስልክ', kind: 'phone', hideFromList: true },
    { key: 'level_requested', label: 'የጠየቀ ደረጃ', kind: 'text', hideFromList: true },
    { key: 'department_pref', label: 'የተመረጠ ዘርፍ', kind: 'text', hideFromList: true },
    { key: 'skills', label: 'ክህሎቶች', kind: 'tags', hideFromList: true },
    { key: 'availability', label: 'የሚቻልበት ጊዜ', kind: 'text', hideFromList: true },
    { key: 'motivation_am', label: 'ምክንያት/ሐሳብ', kind: 'textarea', maxLength: 4000, hideFromList: true },
    { key: 'source', label: 'ምንጭ', kind: 'select', options: APPLICATION_SOURCE_OPTIONS, default: 'website' },
    { key: 'documents', label: 'የታደሱ ሰነዶች (JSON)', kind: 'json', hideFromList: true },
    { key: 'extra', label: 'ተጨማሪ (JSON)', kind: 'json', hideFromList: true },
    { key: 'review_notes', label: 'የግምገማ ማስታወሻ', kind: 'textarea', maxLength: 4000, hideFromList: true },
    { key: 'reviewed_at', label: 'የተገመገመበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
    {
      key: 'status',
      label: 'ሁኔታ',
      kind: 'select',
      options: APPLICATION_STATUS_OPTIONS,
      computed: true,
      hideFromForm: true,
    },
    { key: 'converted_student_id', label: 'የተቀየረው ተማሪ', kind: 'media', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'converted_teacher_id', label: 'የተቀየረው መምህር', kind: 'media', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'converted_user_id', label: 'የተፈጠረ ተጠቃሚ', kind: 'media', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'submitted_at', label: 'የቀረበበት ሰዓት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'applications'>;

export const eventRegistrationsResource = {
  table: 'event_registrations',
  titleAm: 'የፕሮግራም ምዝገባዎች',
  singularAm: 'ምዝገባ',
  description: 'ለምዝገባ ለፈቀዱ ፕሮግራሞች የሚመጡ ተሳታፊዎችና በበዓል ቀኑ የሚደረግ ማረጋገጫ።',
  read: 'events.read',
  write: 'events.write',
  search: ['full_name_am', 'parish', 'source', 'status'],
  order: { by: 'created_at', descending: true },
  defaults: { source: 'website', status: 'registered', participants: 1 },
  fields: [
    { key: 'event_id', label: 'ፕሮግራም', kind: 'media', required: true, load: fkOptions('events', 'title_am') },
    { key: 'full_name_am', label: 'ሙሉ ስም', kind: 'text', required: true },
    { key: 'phone', label: 'ስልክ', kind: 'phone' },
    { key: 'email', label: 'ኢሜይል', kind: 'email', hideFromList: true },
    { key: 'parish', label: 'ቤተ ክርስቲያን/ሰብዐ', kind: 'text' },
    { key: 'participants', label: 'የሚመጡ ብዛት', kind: 'number', required: true, min: 1, max: 50 },
    { key: 'notes', label: 'ማስታወሻ', kind: 'textarea', maxLength: 2000, hideFromList: true },
    { key: 'source', label: 'ምንጭ', kind: 'select', options: REGISTRATION_SOURCE_OPTIONS, default: 'website' },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: REGISTRATION_STATUS_OPTIONS, default: 'registered' },
    { key: 'checked_in_at', label: 'የተመዘገበበት ሰዓት', kind: 'datetime', hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'event_registrations'>;
