// System administration screens — who exists, what they may do, and what the
// platform is configured with.
//
// Profiles, roles and the two grant tables (user_roles, role_permissions) are the
// only ones a person edits; audit_logs, rls_rules, content_types and permissions
// are registries the database itself maintains, so they open as read-only lists.
// Tables keyed by `key` or a composite have no `id`, so no screen deletes on them.

import type { Resource } from '../crud/resource';
import { fkOptions, pairOptions, GENDER_OPTIONS, MEMBER_STATUS_OPTIONS } from '../crud/options';
import type { Option } from '../crud/resource';

/** site_settings.value_type — the CHECK list from migration 0200. */
const VALUE_TYPES: Option[] = [
  { value: 'string', label: 'አጭር ጽሑፍ (string)' },
  { value: 'text', label: 'ረዥም ጽሑፍ (text)' },
  { value: 'number', label: 'ቁጥር' },
  { value: 'boolean', label: 'አዎ/አይ' },
  { value: 'select', label: 'ዝርዝር ምርጫ' },
  { value: 'url', label: 'አድራሻ (URL)' },
  { value: 'image', label: 'ሥዕል' },
  { value: 'color', label: 'ቀለም' },
  { value: 'media_ref', label: 'ከሚዲያ ማህደር' },
  { value: 'json', label: 'JSON' },
];

export const profilesResource = {
  table: 'profiles',
  titleAm: 'የተጠቃሚዎች መገለጫ',
  singularAm: 'መገለጫ',
  description: 'ለእያንዳንዱ የመግቢያ ሂሳብ መረጃ። ኢሜይልና የመግቢያ መለያ የሚያዘጋጃቸው የመግቢያ አገልግሎቱ ነው፤ ሚናዎች በ “የተጠቃሚ ሚናዎች” ይሰጣሉ።',
  read: 'system.read',
  write: 'system.write',
  search: ['full_name_am', 'full_name_en', 'phone', 'parish'],
  order: { by: 'created_at', descending: true },
  fields: [
    { key: 'id', label: 'የመግቢያ መለያ (auth ID)', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'full_name_am', label: 'ሙሉ ስም (አማርኛ)', kind: 'text', required: true },
    { key: 'full_name_en', label: 'ሙሉ ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'phone', label: 'ስልክ', kind: 'phone' },
    { key: 'email', label: 'ኢሜይል', kind: 'email', computed: true, hideFromForm: true, help: 'ከመግቢያ ሥርዓቱ በራሱ ይመፃል፤ በዚህ ገጽ አይቀየርም።' },
    { key: 'avatar_path', label: 'የመለያ ሥዕል', kind: 'image', hideFromList: true },
    { key: 'gender', label: 'ጾታ', kind: 'select', options: GENDER_OPTIONS, hideFromList: true },
    { key: 'birth_date', label: 'የተወለደበት', kind: 'date', hideFromList: true },
    { key: 'member_status', label: 'የአባልነት ሁኔታ', kind: 'select', options: MEMBER_STATUS_OPTIONS, required: true },
    { key: 'parish', label: 'ቤተ ክርስቲያን/ሰብዐ', kind: 'text', hideFromList: true },
    { key: 'joined_at', label: 'የተቀላቀለበት', kind: 'date', hideFromList: true },
    { key: 'is_active', label: 'ንቁ ተጠቃሚ', kind: 'checkbox' },
    { key: 'preferences', label: 'የግል ቅንብሮች (JSON)', kind: 'json', help: 'ለምሳሌ { "theme": "light" }' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'profiles'>;

export const rolesResource = {
  table: 'roles',
  titleAm: 'ሚናዎች',
  singularAm: 'ሚና',
  description: 'የሥራ ሚናዎች ዝርዝር። እያንዳንዱ ሚና ፍቃዶቹን በ “የሚና ፍቃዶች” ገጽ ይኖረዋል፤ ፍቃድ መስጠትና መከልከል በ Postgres ብቻ ይጸናል።',
  read: 'system.read',
  write: 'system.write',
  search: ['key', 'name_am', 'name_en'],
  order: { by: 'key' },
  fields: [
    { key: 'key', label: 'ቁልፍ (ለምሳሌ super_admin)', kind: 'text', required: true, help: 'ትንሽ እንግሊዝኛና ዐረፍተ ነገር ብቻ፤ ከተቀመጠ በኋላ አይቀየርም።', maxLength: 60 },
    { key: 'name_am', label: 'ስም (አማርኛ)', kind: 'text', required: true },
    { key: 'name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'description', label: 'ማብራሪያ', kind: 'textarea', maxLength: 1000, hideFromList: true },
    { key: 'is_system', label: 'የስርዓት ሚና (አይሰረዝም)', kind: 'checkbox', help: 'በማስገቢያው (migration) የተመሠረተና ለተግበራው አስፈላጊ ሚና ነው።' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'roles'>;

export const permissionsResource = {
  table: 'permissions',
  keyFields: ['key'],
  titleAm: 'ፍቃዶች',
  singularAm: 'ፍቃድ',
  description: 'የፍቃድ ዝርዝር (module.action)። ዝርዝሩ በማስገቢያ (migration) ተዘጋጅቶ በኮድ ብቻ ስለሚጨምር ለአንባቢ ብቻ ይከፈታል።',
  read: 'system.read',
  search: ['key', 'module', 'name_am'],
  order: { by: 'key' },
  fields: [
    { key: 'key', label: 'ቁልፍ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'module', label: 'ዘርፍ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'action', label: 'ተግባር', kind: 'text', computed: true, hideFromForm: true },
    { key: 'name_am', label: 'ስም (አማርኛ)', kind: 'text', computed: true, hideFromForm: true },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'permissions'>;

export const userRolesResource = {
  table: 'user_roles',
  keyFields: ['user_id', 'role_id'],
  titleAm: 'የተጠቃሚ ሚናዎች',
  singularAm: 'የተሰጠ ሚና',
  description: 'ማን የትኛው ሚና እንደሚይዝ። “scope” ፍቃዱን ወደ ልዩ ክፍሎች ወይም ዘርፎች ለመገደብ ያገለግላል፤ ረድፉ በተጠቃሚና በሚና ቁልፍ ስለሚለይ መሰረዝ በዚህ ገጽ የለም።',
  read: 'system.read',
  write: 'system.write',
  order: { by: 'created_at', descending: true },
  fields: [
    { key: 'user_id', label: 'ተጠቃሚ', kind: 'media', required: true, load: fkOptions('profiles', 'full_name_am') },
    { key: 'role_id', label: 'ሚና', kind: 'media', required: true, load: fkOptions('roles', 'name_am') },
    { key: 'scope', label: 'ወሰን (JSON)', kind: 'json', help: '{ "class_ids": ["…"], "department_ids": ["…"] } — ባዶ ማለት ወሰን የለም።' },
    { key: 'granted_by', label: 'የሰጠው', kind: 'media', computed: true, hideFromForm: true },
    { key: 'created_at', label: 'የተሰጠበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'user_roles'>;

export const rolePermissionsResource = {
  table: 'role_permissions',
  keyFields: ['role_id', 'permission_key'],
  titleAm: 'የሚና ፍቃዶች',
  singularAm: 'የተሰጠ ፍቃድ',
  description: 'የትኛው ሚና ምን ፍቃድ እንዳለው የሚወስኑበት መዝገብ። ረድፉ በሚናና በፍቃድ ቁልፍ ስለሚለይ መሰረዝ በዚህ ገጽ የለም፤ ለውጡ በ Postgres ይጸናል።',
  read: 'system.read',
  write: 'system.write',
  search: ['permission_key'],
  order: { by: 'granted_at', descending: true },
  fields: [
    { key: 'role_id', label: 'ሚና', kind: 'media', required: true, load: fkOptions('roles', 'name_am') },
    {
      key: 'permission_key',
      label: 'ፍቃድ',
      kind: 'media',
      required: true,
      load: pairOptions('permissions', 'key', 'name_am'),
      help: 'ፍቃዱ ከዝርዝሩ (module.action) ይመረጣል፤ ስሙ በአማርኛ ይታያል።',
    },
    { key: 'granted_at', label: 'የተሰጠበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'role_permissions'>;

export const auditLogsResource = {
  table: 'audit_logs',
  titleAm: 'የሥራ መከታተያ መዝገብ',
  singularAm: 'መዝገብ',
  description: 'ማን ምን እንዳስቀየረ የሚያሳይ መዝገብ። በዳታቤዙ trigger (ማስገበሪያ) ብቻ ስለሚጻፍ ለአንባቢ ብቻ ነው፤ መሰረዝና ማሻሻል የለም።',
  read: 'audit.read',
  search: ['action', 'table_name', 'user_label'],
  order: { by: 'created_at', descending: true },
  limit: 500,
  fields: [
    { key: 'id', label: 'ደ.ቁ', kind: 'number', computed: true, hideFromForm: true, width: 'sm' },
    { key: 'created_at', label: 'ቀንና ሰዓት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'user_label', label: 'ተጠቃሚ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'user_id', label: 'የተጠቃሚ መለያ', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'action', label: 'ተግባር', kind: 'text', computed: true, hideFromForm: true },
    { key: 'table_name', label: 'ሰንጠረዝ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'record_id', label: 'የረድፍ መለያ', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'old_values', label: 'ከመቀየሩ በፊት (JSON)', kind: 'json', computed: true, hideFromForm: true },
    { key: 'new_values', label: 'ከቀየረ በኋላ (JSON)', kind: 'json', computed: true, hideFromForm: true },
    { key: 'ip', label: 'አድራሻ (IP)', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'audit_logs'>;

export const siteSettingsResource = {
  table: 'site_settings',
  keyFields: ['key'],
  titleAm: 'የመድረክ ቅንብሮች',
  singularAm: 'ቅንብር',
  description: 'የቤተ ክርስቲያኗን ስም፠ አድራሻና ሌሎች የአጠቃላይ ቅንብሮች የሚያዙ ሰንጠረዝ። በ“key” ስለሚለይ ማጥፋት በዚህ ገጽ የለም።',
  read: 'system.read',
  write: 'system.write',
  search: ['key', 'group_name', 'label_am'],
  order: { by: 'sort_order' },
  fields: [
    { key: 'key', label: 'ቁልፍ (ለምሳሌ church_name_am)', kind: 'text', required: true, maxLength: 100 },
    { key: 'group_name', label: 'ቡድን', kind: 'text', required: true, placeholder: 'general፠ contact፠ social፠ seo፠ system፠ finance' },
    { key: 'label_am', label: 'ስም (አማርኛ)', kind: 'text', required: true },
    { key: 'hint_am', label: 'መመሪያ (አማርኛ)', kind: 'text', hideFromList: true },
    { key: 'value', label: 'ዋጋ (JSON)', kind: 'json', required: true, help: 'እንደ value_type ይጻፋል፦ ጽሑፍ “ስም”፠ ቁጥር 10፠ አዎ/አይ true።' },
    { key: 'value_type', label: 'የዋጋ ዐይነት', kind: 'select', options: VALUE_TYPES, required: true },
    { key: 'options', label: 'ምርጫዎች (JSON፠ ለselect)', kind: 'json', help: 'ለምሳሌ ["am","en"] — ለ value_type = select ብቻ።' },
    { key: 'is_public', label: 'ለድረ ገጹ ግልጽ ነው', kind: 'checkbox' },
    { key: 'sort_order', label: 'ድርድር', kind: 'number', required: true, min: 0 },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'site_settings'>;

export const rlsRulesResource = {
  table: 'rls_rules',
  keyFields: ['table_name'],
  titleAm: 'የRLS ደንቦች',
  singularAm: 'ደንብ',
  description: 'የእያንዳንዱ ሰንጠረዝ የማንበብ/የመጻፍ/የማጥፋት ፍቃድ ደንብ። በ RLS ፖሊሲ ማስገበሪያ (migration 150) የተዘጋጀ ሲሆን በኮድ ብቻ ስለሚቀየር ለአንባቢ ብቻ ነው።',
  read: 'system.read',
  search: ['table_name', 'read_perm', 'write_perm'],
  order: { by: 'table_name' },
  fields: [
    { key: 'table_name', label: 'ሰንጠረዝ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'read_perm', label: 'የማንበብ ፍቃድ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'write_perm', label: 'የመጻፍ ፍቃድ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'delete_perm', label: 'የማጥፋት ፍቃድ', kind: 'text', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'rls_rules'>;

export const contentTypesResource = {
  table: 'content_types',
  keyFields: ['key'],
  titleAm: 'የይዘት ዐይነቶች መዝገብ',
  singularAm: 'የይዘት ዐይነት',
  description: 'የይዘት ዝዓጉል ሥራዎች (ዜና፣ ፕሮግራም፣ ገጽ…) የሚመሩበት መዝገብ። በማስገቢያ (migration) የተዘጋጀ ስለሆነ ለአንባቢ ብቻ ይከፈታል።',
  read: 'system.read',
  search: ['key', 'table_name'],
  order: { by: 'key' },
  fields: [
    { key: 'key', label: 'ቁልፍ (ለምሳሌ news)', kind: 'text', computed: true, hideFromForm: true },
    { key: 'table_name', label: 'ሰንጠረዝ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'label_column', label: 'የርዕስ አምድ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'state_column', label: 'የሁኔታ አምድ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'approve_permission', label: 'የማጽደቅ ፍቃድ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'submit_permission', label: 'የማቅረብ ፍቃድ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'published_column', label: 'የመውጣት አምድ', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'submitted_column', label: 'የመቅረብ አምድ', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'reviewed_column', label: 'የመገምገሚያ አምድ', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'notes_column', label: 'የማስታወሻ አምድ', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'portal_path', label: 'የግቢ አድራሻ', kind: 'text', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'content_types'>;
