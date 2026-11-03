// Communication resources — the church's inbox, notice board and outbox.
//
// Contact messages and prayer requests arrive from the public site and are worked
// here; announcements ride the shared draft→approve→publish ladder (the only
// `content_types` row in this file); the in-app notices, their fan-out preferences,
// the templates and the delivery outbox are mostly read-only mirrors of what RPCs
// and the delivery worker write. Every select lists only the CHECK/enum values the
// migrations accept.

import type { Resource, Option } from '../crud/resource';
import { fkOptions, pairOptions } from '../crud/options';
import { CONTENT_STATE, DELIVERY_CHANNEL, DELIVERY_STATUS } from '@/lib/i18n';

/** `delivery_channel` — reused for channel columns everywhere below. */
const CHANNEL_OPTIONS: Option[] = Object.entries(DELIVERY_CHANNEL).map(([value, label]) => ({ value, label }));

/** `delivery_status` — the outbox lifecycle the delivery worker drives. */
const DELIVERY_STATUS_OPTIONS: Option[] = Object.entries(DELIVERY_STATUS).map(([value, label]) => ({ value, label }));

/** `content_state` — the announcement workflow ladder, from the shared glossary. */
const CONTENT_STATE_OPTIONS: Option[] = Object.entries(CONTENT_STATE).map(([value, label]) => ({ value, label }));

/** `announcements.kind` — CHECK list in 20261102001100_communication.sql. */
const ANNOUNCEMENT_KIND_OPTIONS: Option[] = [
  { value: 'general', label: 'አጠቃላይ' },
  { value: 'academic', label: 'ትምህርታዊ' },
  { value: 'liturgical', label: 'ሥዕደታዊ' },
  { value: 'event', label: 'ፕሮግራም' },
  { value: 'finance', label: 'ሒሳብና ገንዘብ' },
  { value: 'department', label: 'የዘርፍ' },
  { value: 'urgency', label: 'አስቸኳይ' },
];

/** `announcements.priority` — CHECK list in 20261102001100_communication.sql. */
const ANNOUNCEMENT_PRIORITY_OPTIONS: Option[] = [
  { value: 'low', label: 'ዝቅተኛ' },
  { value: 'normal', label: 'መደበኛ' },
  { value: 'high', label: 'ከፍተኛ' },
  { value: 'urgent', label: 'አስቸኳይ' },
];

/** `contact_messages.topic` — CHECK list in 20261102001100_communication.sql. */
const CONTACT_TOPIC_OPTIONS: Option[] = [
  { value: 'general', label: 'አጠቃላይ' },
  { value: 'registration', label: 'ምዝገባ' },
  { value: 'donation', label: 'ልገሳ' },
  { value: 'media', label: 'ሚዲያ' },
  { value: 'prayer', label: 'ጸሎት' },
  { value: 'volunteer', label: 'በፈቃደኝነት' },
  { value: 'other', label: 'ሌላ' },
];

/** `contact_messages.status` — CHECK list; `replied` is set by `reply_to_message`. */
const CONTACT_STATUS_OPTIONS: Option[] = [
  { value: 'new', label: 'አዲስ' },
  { value: 'in_progress', label: 'በሥራ ላይ' },
  { value: 'replied', label: 'መልስ ተሰጥቷል' },
  { value: 'archived', label: 'ወደ ማህደር የተላከ' },
  { value: 'spam', label: 'አናጢ ጽሑፍ' },
];

/** `prayer_requests.category` — CHECK list in 20261102001100_communication.sql. */
const PRAYER_CATEGORY_OPTIONS: Option[] = [
  { value: 'healing', label: 'ፈውስ' },
  { value: 'family', label: 'ቤተሰብ' },
  { value: 'travel', label: 'ጉዞ' },
  { value: 'work', label: 'ሥራ' },
  { value: 'thanksgiving', label: 'ምስጋና' },
  { value: 'deceased', label: 'ለሕያዋን ለፍቷል' },
  { value: 'church', label: 'ቤተ ክርስቲያን' },
  { value: 'nation', label: 'አገር' },
  { value: 'general', label: 'አጠቃላይ' },
];

/** `prayer_requests.status` — CHECK list; answered by staff editing the row. */
const PRAYER_STATUS_OPTIONS: Option[] = [
  { value: 'pending', label: 'በመጠባበቂያ ላይ' },
  { value: 'active', label: 'ንቁ' },
  { value: 'answered', label: 'መልሱ ተሰጥቷል' },
  { value: 'archived', label: 'ወደ ማህደር የተላከ' },
];

/** `notifications.severity` — CHECK list in 20261102001100_communication.sql. */
const NOTIFICATION_SEVERITY_OPTIONS: Option[] = [
  { value: 'info', label: 'መረጃ' },
  { value: 'success', label: 'በደስታ' },
  { value: 'warning', label: 'ማንቂያ' },
  { value: 'danger', label: 'አደገኛ' },
];

/** `subscribers.source` — CHECK list in 20261102001100_communication.sql. */
const SUBSCRIBER_SOURCE_OPTIONS: Option[] = [
  { value: 'website', label: 'ድረ-ገጽ' },
  { value: 'erp', label: 'በመተግበሪያው' },
  { value: 'event', label: 'ፕሮግራም' },
  { value: 'newsletter', label: 'የዜና መልእክት' },
];

/** `subscribers.status` — CHECK list in 20261102001100_communication.sql. */
const SUBSCRIBER_STATUS_OPTIONS: Option[] = [
  { value: 'subscribed', label: 'የተመዘገበ' },
  { value: 'unsubscribed', label: 'የተወጋ' },
  { value: 'bounced', label: 'መልእክቱ አልደረሰም' },
];

export const announcementsResource = {
  table: 'announcements',
  titleAm: 'ማስታወቂያዎች',
  singularAm: 'ማስታወቂያ',
  description: 'ወደ ገጾችና ወደ ውስጣዊ ማሳወቂያዎች የሚላኩ መልእክቶች። ቅድመ ሐሳብ ሆኖ ይጀምራል፣ ለማጽደቅ ይቀርባል፣ ከጸደቀ በኋላ ወጥቶ ይሰራጫል።',
  read: 'communication.read',
  write: 'communication.write',
  publish: 'communication.publish',
  approve: 'communication.publish',
  remove: 'communication.write',
  workflow: 'announcement',
  stateKey: 'state',
  search: ['title_am', 'kind', 'priority'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'created_by' },
  defaults: { kind: 'general', priority: 'normal', pinned: false },
  fields: [
    { key: 'title_am', label: 'ርዕስ', kind: 'text', required: true, maxLength: 300 },
    { key: 'body_am', label: 'ይዘት', kind: 'rich', required: true, hideFromList: true, maxLength: 20000 },
    { key: 'kind', label: 'ዓይነት', kind: 'select', options: ANNOUNCEMENT_KIND_OPTIONS, required: true, default: 'general' },
    { key: 'priority', label: 'ግዳጅነት', kind: 'select', options: ANNOUNCEMENT_PRIORITY_OPTIONS, required: true, default: 'normal' },
    {
      key: 'channels',
      label: 'የሚሰራጭባቸው መንገዶች',
      kind: 'multiselect',
      options: CHANNEL_OPTIONS,
      help: 'ምንም ካልመረጡ በመተግበሪያ ውስጥ ብቻ ይታያል',
    },
    {
      key: 'audience',
      label: 'ዒልም (JSON)',
      kind: 'json',
      hideFromList: true,
      help: '{ "roles": ["teacher"], "department_ids": [], "class_ids": [] } — ለማነጠል ኮድ በRPC ይዘጋጃል',
    },
    { key: 'pinned', label: 'በላይ ተቀምጧል', kind: 'checkbox' },
    { key: 'media_id', label: 'ሐቀፍ', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'department_id', label: 'ዘርፍ', kind: 'select', load: fkOptions('departments', 'name_am'), hideFromList: true },
    { key: 'publish_at', label: 'የሚወጣበት ሰዓት', kind: 'datetime', help: 'ባዶ ከሆነ ሲጸድቅ ወደፊት ይወጣል' },
    { key: 'expires_at', label: 'የሚያበቃበት ሰዓት', kind: 'datetime', hideFromList: true },
    { key: 'state', label: 'ሁኔታ', kind: 'select', options: CONTENT_STATE_OPTIONS, computed: true, hideFromForm: true },
    { key: 'reviewed_by', label: 'ያጸደቀው', kind: 'select', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'review_notes', label: 'የማጽደቅ ማስታወሻ', kind: 'textarea', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'announcements'>;

export const contactMessagesResource = {
  table: 'contact_messages',
  titleAm: 'የግንኙነት መልእክቶች',
  singularAm: 'መልእክት',
  description: 'ከድረ ገጹ “ኛን ሐዘር” ቅጽ የሚመጡ መልእክቶች። መልስ መስጠት በ “መልስ ስጥ” ቁልፍ የሚፈጸመው `reply_to_message` በሚባል RPC ነው።',
  read: 'communication.read',
  write: 'communication.write',
  search: ['name_am', 'subject_am', 'email'],
  order: { by: 'created_at', descending: true },
  defaults: { topic: 'general', lang: 'am', status: 'new' },
  fields: [
    { key: 'name_am', label: 'እንደተሰየመ', kind: 'text', required: true },
    { key: 'email', label: 'ኢሜይል', kind: 'email' },
    { key: 'phone', label: 'ስልክ', kind: 'phone' },
    { key: 'subject_am', label: 'ርዕሱ', kind: 'text', required: true },
    { key: 'message_am', label: 'መልእክቱ', kind: 'textarea', required: true, hideFromList: true, maxLength: 20000 },
    { key: 'topic', label: 'ጉዳዩ', kind: 'select', options: CONTACT_TOPIC_OPTIONS, required: true, default: 'general' },
    { key: 'lang', label: 'ቋንቋ', kind: 'text', default: 'am', hideFromList: true, placeholder: 'am' },
    { key: 'source_url', label: 'የመጣበት ገጽ', kind: 'url', hideFromList: true },
    { key: 'assigned_to', label: 'ተመድቧል', kind: 'select', load: fkOptions('profiles', 'full_name_am'), help: 'ኃላፊነት የተሰጠው ሰው' },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: CONTACT_STATUS_OPTIONS, required: true, default: 'new' },
    { key: 'reply_body', label: 'የተሰᠠመ መልስ', kind: 'textarea', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'replied_by', label: 'መልስ የሰጠው', kind: 'select', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'replied_at', label: 'መልስ የተሰጠበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'created_at', label: 'የደረሰበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'contact_messages'>;

export const prayerRequestsResource = {
  table: 'prayer_requests',
  titleAm: 'የጸሎት ጥያቄዎች',
  singularAm: 'የጸሎት ጥያቄ',
  description: 'ከድረ ገጹ የሚመጡ የጸሎት ጠያቂዎች። ስም ከተወገደ ለሕዝብ ይታያል፤ ሐዘር በመምረጥና ማስታወሻ በመጻፍ መልሱ ይሰጣል።',
  read: 'communication.read',
  write: 'communication.write',
  search: ['name_am', 'for_whom'],
  order: { by: 'created_at', descending: true },
  defaults: { category: 'general', is_public: false, status: 'pending' },
  fields: [
    { key: 'name_am', label: 'ስም', kind: 'text', help: 'ባዶ ከሆነ ለስላሳ ጥያቄ ነው' },
    { key: 'contact', label: 'የመገናኛ መረጃ', kind: 'text', hideFromList: true },
    { key: 'request_am', label: 'ጥያቄ', kind: 'textarea', required: true, hideFromList: true, maxLength: 8000 },
    { key: 'category', label: 'ምድብ', kind: 'select', options: PRAYER_CATEGORY_OPTIONS, required: true, default: 'general' },
    { key: 'for_whom', label: 'ለማን', kind: 'text', placeholder: 'ለሕመምተኛው ስም ወዘተ' },
    { key: 'is_public', label: 'ለሁሉም ይታያል', kind: 'checkbox' },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: PRAYER_STATUS_OPTIONS, required: true, default: 'pending' },
    { key: 'prayed_by', label: 'የጸለየለት', kind: 'select', load: fkOptions('profiles', 'full_name_am'), help: 'ጥያቄውን የሸከመው ሰው' },
    { key: 'answered_note', label: 'የመልስ ማስታወሻ', kind: 'textarea', hideFromList: true, maxLength: 4000, help: 'መልክ ወይም ምስጋና ሲመጣ ይመዘገባል' },
    { key: 'requested_on', label: 'የተጠየቀበት ቀን', kind: 'date', required: true },
    { key: 'created_at', label: 'የደረሰበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'prayer_requests'>;

export const notificationsResource = {
  table: 'notifications',
  titleAm: 'ማሳወቂያዎች',
  singularAm: 'ማሳወቂያ',
  description: 'የተጠቃሚው የውስጥ መልእክት ሳጥን፤ በማሳወቂያ ሰብሳቢ RPCዎች ብቻ ይሞላል። እዚህ ለማንበብ ብቻ ነው።',
  read: 'communication.read',
  search: ['title_am', 'kind'],
  order: { by: 'created_at', descending: true },
  fields: [
    { key: 'user_id', label: 'ተጠቃሚ', kind: 'select', required: true, load: fkOptions('profiles', 'full_name_am'), hideFromList: true },
    { key: 'title_am', label: 'ርዕስ', kind: 'text', required: true },
    { key: 'body_am', label: 'ይዘት', kind: 'textarea', hideFromList: true },
    { key: 'kind', label: 'ዓይነት', kind: 'text', default: 'system', hideFromList: true },
    { key: 'link', label: 'ወደ ገጽ አገናኝ', kind: 'text', hideFromList: true, placeholder: '/erp/…' },
    { key: 'severity', label: 'ክብደት', kind: 'select', options: NOTIFICATION_SEVERITY_OPTIONS, required: true, default: 'info' },
    { key: 'archived', label: 'ተቀምጧል', kind: 'checkbox' },
    { key: 'read_at', label: 'የተነበበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'created_at', label: 'የደረሰበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'notifications'>;

export const notificationTemplatesResource = {
  table: 'notification_templates',
  titleAm: 'የማሳወቂያ ቅዳሜዎች',
  singularAm: 'ቅዳሜ',
  description: 'በወጪ መልእክት ሰሌዳው የሚያገለግሉ ቅዳሜዎች፤ በ {{name}} ዓይነት ቦታዎች ይተካሉ።',
  read: 'communication.read',
  write: 'communication.write',
  search: ['key', 'name_am'],
  order: { by: 'created_at', descending: true },
  defaults: { channel: 'email', is_active: true },
  fields: [
    { key: 'key', label: 'ቁልፍ', kind: 'text', required: true, placeholder: 'ለምሳሌ application_received', help: 'የማይደጋገም አሳሽ ስም' },
    { key: 'name_am', label: 'ስም', kind: 'text', required: true },
    { key: 'channel', label: 'መንገድ', kind: 'select', options: CHANNEL_OPTIONS, required: true, default: 'email' },
    { key: 'subject_am', label: 'ርዕስ', kind: 'text', hideFromList: true },
    { key: 'body_am', label: 'ቅዳሜ ሐዋሳ', kind: 'textarea', required: true, hideFromList: true, maxLength: 20000 },
    { key: 'provider', label: 'አገልግሎት', kind: 'text', hideFromList: true, placeholder: 'resend / twilio …' },
    { key: 'is_active', label: 'ንቁ ነው', kind: 'checkbox', default: true },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'notification_templates'>;

export const notificationPreferencesResource = {
  table: 'notification_preferences',
  keyFields: ['user_id', 'kind', 'channel'],
  titleAm: 'የማሳወቂያ ምርጫዎች',
  singularAm: 'ምርጫ',
  description: 'እያንዳንዱ ሰው የትኛውን ዓይነት መልእክት በየትኛው መንገድ እንደሚቀበል የሚያሳይ፤ በ “ቅንብር” ገጽ ብቻ ይቀየራል።',
  read: 'communication.read',
  search: ['kind', 'channel'],
  // This table has no `id` and no timestamp — its key is (user_id, kind, channel).
  order: { by: 'user_id' },
  fields: [
    { key: 'user_id', label: 'ተጠቃሚ', kind: 'select', required: true, load: fkOptions('profiles', 'full_name_am') },
    { key: 'kind', label: 'የመልእክት ዓይነት', kind: 'text', required: true, placeholder: 'ለምሳሌ contact_message' },
    { key: 'channel', label: 'መንገድ', kind: 'select', options: CHANNEL_OPTIONS, required: true },
    { key: 'enabled', label: 'ነቁ ነው', kind: 'checkbox', default: true },
  ],
} satisfies Resource<'notification_preferences'>;

export const outboxMessagesResource = {
  table: 'outbox_messages',
  titleAm: 'የወጪ መልእክት ሰሌዳ',
  singularAm: 'መልእክት',
  description: 'እያንዳንዱ ወደ ውጭ የሚላክ ኢሜይል/ኤስኤምኤስ በዚህ ሰሌዳ ታርፎ በማድረሻ ተቋም ይላካል፤ የመላክ ታሪክ ስለሆነ አይጠፋም።',
  read: 'communication.read',
  write: 'communication.write',
  search: ['to_address', 'subject'],
  order: { by: 'queued_at', descending: true },
  defaults: { status: 'queued' },
  fields: [
    { key: 'template_key', label: 'ቅዳሜ', kind: 'select', load: pairOptions('notification_templates', 'key', 'name_am'), hideFromList: true },
    { key: 'channel', label: 'መንገድ', kind: 'select', options: CHANNEL_OPTIONS, required: true },
    { key: 'recipient_user_id', label: 'ተቀባዩ', kind: 'select', load: fkOptions('profiles', 'full_name_am'), hideFromList: true },
    { key: 'to_address', label: 'ወደ', kind: 'text', required: true, help: 'የኢሜይል ወይም የስልክ አድራሻ' },
    { key: 'subject', label: 'ርዕስ', kind: 'text' },
    { key: 'body', label: 'ይዘት', kind: 'textarea', required: true, hideFromList: true, maxLength: 20000 },
    { key: 'provider', label: 'አገልግሎት', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: DELIVERY_STATUS_OPTIONS, required: true, default: 'queued', computed: true, hideFromForm: true },
    { key: 'attempts', label: 'የመሞከሪያ ብዛት', kind: 'number', computed: true, hideFromForm: true },
    { key: 'last_error', label: 'የመጨረሻ ስህተት', kind: 'textarea', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'related', label: 'የተያያዘ (JSON)', kind: 'json', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'queued_at', label: 'በሰልፍ የተገባበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'sent_at', label: 'የተላከበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'delivered_at', label: 'ያደረሰበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'outbox_messages'>;

export const subscribersResource = {
  table: 'subscribers',
  titleAm: 'የዜና መልእክት ተዋይዎች',
  singularAm: 'ተዋይ',
  description: 'ዜና መልእክት ለመቀበል የተመዘገቡ አድራሻዎች፤ ፍቃድና መወጋት በቀን ይመዘገባል።',
  read: 'communication.read',
  write: 'communication.write',
  remove: 'communication.write',
  search: ['email', 'name_am'],
  order: { by: 'created_at', descending: true },
  defaults: { source: 'website', status: 'subscribed' },
  fields: [
    { key: 'email', label: 'ኢሜይል', kind: 'email', required: true },
    { key: 'name_am', label: 'ስም', kind: 'text' },
    { key: 'phone', label: 'ስልክ', kind: 'phone', hideFromList: true },
    { key: 'source', label: 'ምንጭ', kind: 'select', options: SUBSCRIBER_SOURCE_OPTIONS, required: true, default: 'website' },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: SUBSCRIBER_STATUS_OPTIONS, required: true, default: 'subscribed' },
    { key: 'topics', label: 'ርዕሶች', kind: 'tags', hideFromList: true, placeholder: 'በሰሌዳ የተለያዩ' },
    { key: 'consent_at', label: 'ፈቃድ የሰጠበት', kind: 'datetime' },
    { key: 'unsubscribed_at', label: 'የተወጋበት', kind: 'datetime', hideFromList: true, computed: true, hideFromForm: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'subscribers'>;
