// Finance resources — the ledger half of the platform: chart of accounts,
// categories, money in/out (transactions), gifts to the church (donations and
// their campaigns), annual budgets and the small set of finance settings.
//
// Money history is never deleted from the UI: transaction and donation rows
// stay, and the approval ladder (draft → pending → approved/rejected/void) is
// walked by SECURITY DEFINER RPCs, so RPC-written columns are computed here.

import type { Option, Resource } from '../crud/resource';
import { fkOptions } from '../crud/options';
import { CONTENT_STATE, PAYMENT_METHOD, TRANSACTION_TYPE } from '@/lib/i18n';

const TRANSACTION_TYPE_OPTIONS: Option[] = Object.entries(TRANSACTION_TYPE).map(([value, label]) => ({ value, label }));
const PAYMENT_METHOD_OPTIONS: Option[] = Object.entries(PAYMENT_METHOD).map(([value, label]) => ({ value, label }));
const STATE_OPTIONS: Option[] = Object.entries(CONTENT_STATE).map(([value, label]) => ({ value, label }));

/** Only `decide_transaction` may write the last three states — shown, not typed. */
const TX_STATUS_OPTIONS: Option[] = [
  { value: 'draft', label: 'ቅድመ ሐሳብ' },
  { value: 'pending_approval', label: 'ማረጋገጫ ጠባቂ' },
  { value: 'approved', label: 'ጸድቋል', disabled: true },
  { value: 'rejected', label: 'ተክዷል', disabled: true },
  { value: 'void', label: 'ተሰርዟል', disabled: true },
];

/** finance_accounts.kind — the CHECK list in 20261102000900_finance.sql. */
const ACCOUNT_KIND_OPTIONS: Option[] = [
  { value: 'asset', label: 'ንብረት' },
  { value: 'liability', label: 'ኃላፊነት' },
  { value: 'equity', label: 'ክፍልጋዜ' },
  { value: 'income', label: 'ገቢ' },
  { value: 'expense', label: 'ወጪ' },
  { value: 'fund', label: 'የተዘጋጀ ገንዳ' },
];

const DONATION_STATUS_OPTIONS: Option[] = [
  { value: 'pledged', label: 'ተክየሉ' },
  { value: 'partially_paid', label: 'ከፊል ተከፍሏል' },
  { value: 'paid', label: 'ተከፍሏል' },
  { value: 'cancelled', label: 'ተሰርዟል' },
  { value: 'refunded', label: 'ተመልሷል' },
];

const DONATION_SOURCE_OPTIONS: Option[] = [
  { value: 'website', label: 'ከድረ ገጽ' },
  { value: 'erp', label: 'ከመተግበሪያው' },
  { value: 'cash', label: 'በእጅ ሲሰጥ' },
  { value: 'event', label: 'በፕሮግራም' },
  { value: 'phone', label: 'በስልክ' },
];

const BUDGET_STATUS_OPTIONS: Option[] = [
  { value: 'draft', label: 'ቅድመ ሐሳብ' },
  { value: 'submitted', label: 'የቀረበ' },
  { value: 'approved', label: 'ጸድቋል' },
  { value: 'rejected', label: 'ተክዷል' },
  { value: 'closed', label: 'ተዘግቷል' },
];

export const transactionsResource = {
  table: 'transactions',
  titleAm: 'ገንዘብ ንቅናቄዎች',
  singularAm: 'ንቅናቄ',
  description: 'የገቢና ወጪ መዝገብ። ወደ ላይኛው ደረጃ ከፈቀደው በላይ ለሆነ ወጪ ማረጋገጫ ያስፈልጋል፤ ማጽደቅና መሰረዝ በፋይናንስ አጻዳቂ ይፈጸማል።',
  read: 'finance.read',
  write: 'finance.write',
  search: ['ref_no', 'description_am', 'reference_ext'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'recorded_by' },
  defaults: { currency: 'ETB', method: 'cash', status: 'draft' },
  fields: [
    { key: 'ref_no', label: 'ማጣቀሻ ቁጥር', kind: 'text', computed: true, hideFromForm: true, width: 'sm' },
    { key: 'type', label: 'ዓይነት', kind: 'select', options: TRANSACTION_TYPE_OPTIONS, required: true, width: 'sm' },
    { key: 'amount', label: 'መጠን', kind: 'money', required: true, min: 0, width: 'md' },
    { key: 'currency', label: 'ብር ዓይነት', kind: 'text', default: 'ETB', hideFromList: true },
    { key: 'occurred_on', label: 'የተፈጸመበት ቀን', kind: 'date', required: true },
    { key: 'eth_date', label: 'የዐ.ዐ.ዓ ቀን', kind: 'text', hideFromList: true, placeholder: 'ለምሳሌ ፳፻፲፱/ጥር/፳፭' },
    { key: 'description_am', label: 'ማብራሪያ', kind: 'text', required: true },
    { key: 'method', label: 'የክፍያ መንገድ', kind: 'select', options: PAYMENT_METHOD_OPTIONS, required: true, default: 'cash' },
    { key: 'account_id', label: 'ከሂሳብ', kind: 'media', load: fkOptions('finance_accounts', 'name_am'), help: 'ለሽግግር የሚወጣው ሂሳብ፤ ሌሎች ግቢና ወጪ ለሚገቡበት' },
    { key: 'to_account_id', label: 'ወደ ሂሳብ', kind: 'media', load: fkOptions('finance_accounts', 'name_am'), hideFromList: true, help: '“ሽግግር” ብቻ ሁለቱንም ሂሳቦች ይፈልጋል' },
    { key: 'category_id', label: 'ምድብ', kind: 'media', load: fkOptions('finance_categories', 'name_am') },
    { key: 'department_id', label: 'ዘርፍ', kind: 'media', load: fkOptions('departments', 'name_am'), hideFromList: true },
    { key: 'event_id', label: 'ፕሮግራም', kind: 'media', load: fkOptions('events', 'title_am'), hideFromList: true },
    { key: 'member_id', label: 'አባል', kind: 'media', load: fkOptions('members', 'full_name_am'), hideFromList: true },
    { key: 'reference_ext', label: 'የውጭ ማጣቀሻ', kind: 'text', hideFromList: true, placeholder: 'ቼክ/የባንክ/የሞባይል ገንዘብ ቁጥር' },
    { key: 'receipt_media_id', label: 'የደረሰኝ ሐቀፍ', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    {
      key: 'status',
      label: 'ሁኔታ',
      kind: 'select',
      options: TX_STATUS_OPTIONS,
      required: true,
      default: 'draft',
      width: 'sm',
      help: 'ጸድቋል/ተክዷል/ተሰርዟል የሚባሉት በማጽደቅ ተግባር ብቻ ይሆናሉ',
    },
    { key: 'recorded_by', label: 'የመዘገበው', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'approved_by', label: 'ያጸደቀው', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'approved_at', label: 'የጸደቀበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'rejection_note', label: 'የተሰረዘበት ምክንያት', kind: 'textarea', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'reversal_of_id', label: 'የተሰረዘው ንቅናቄ', kind: 'media', load: fkOptions('transactions', 'ref_no'), computed: true, hideFromForm: true, hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'transactions'>;

export const donationsResource = {
  table: 'donations',
  titleAm: 'ልገሳዎች',
  singularAm: 'ልገሳ',
  description: 'በድረ ገጽ፣ በስልክ ወይም በእጅ የተቀበሉ ልገሳዎች። ወደ “ተከፍሏል” ሲቀየር ገቢው ንቅናቄ በራሱ ይፈጠራል።',
  read: 'donations.read',
  write: 'donations.write',
  search: ['receipt_no', 'donor_name_am', 'donor_name_en', 'purpose_am'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'recorded_by' },
  defaults: { currency: 'ETB', method: 'cash', status: 'pledged', source: 'erp', is_pledge: false },
  fields: [
    { key: 'receipt_no', label: 'የደረሰኝ ቁጥር', kind: 'text', computed: true, hideFromForm: true, width: 'sm' },
    { key: 'donor_name_am', label: 'የገልጹ ስም', kind: 'text', required: true },
    { key: 'donor_name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'amount', label: 'መጠን', kind: 'money', required: true, min: 0, width: 'md' },
    { key: 'currency', label: 'ብር ዓይነት', kind: 'text', default: 'ETB', hideFromList: true },
    { key: 'method', label: 'የክፍያ መንገድ', kind: 'select', options: PAYMENT_METHOD_OPTIONS, required: true, default: 'cash' },
    {
      key: 'status',
      label: 'ሁኔታ',
      kind: 'select',
      options: DONATION_STATUS_OPTIONS,
      required: true,
      default: 'pledged',
      width: 'sm',
      help: '“ተከፍሏል” የሚለው ሲመረጥ የገቢ ንቅናቄ በራሱ ተመዝግቧል ማለት ነው',
    },
    { key: 'campaign_id', label: 'የልገሳ ዘመቻ', kind: 'media', load: fkOptions('donation_campaigns', 'name_am') },
    { key: 'member_id', label: 'አባል', kind: 'media', load: fkOptions('members', 'full_name_am'), hideFromList: true },
    { key: 'application_id', label: 'ማመልከቻ', kind: 'media', load: fkOptions('applications', 'full_name_am'), hideFromList: true },
    { key: 'phone', label: 'ስልክ', kind: 'phone', hideFromList: true },
    { key: 'email', label: 'ኢሜይል', kind: 'email', hideFromList: true },
    { key: 'purpose_am', label: 'ዓላማ', kind: 'text', hideFromList: true, placeholder: 'ለምሳሌ ለምሳ ቤተ ክርስቲያን ግንባታ' },
    { key: 'in_honour_of', label: 'በአከባቢ / በስብከት', kind: 'text', hideFromList: true },
    { key: 'is_pledge', label: 'ሐሳብ (ገና ያልተከፈለ)', kind: 'checkbox', width: 'sm' },
    { key: 'pledged_on', label: 'የተከየበት', kind: 'date', hideFromList: true },
    { key: 'due_on', label: 'የሚቸፈልበት ቀን', kind: 'date', hideFromList: true },
    { key: 'received_on', label: 'የተቀበለበት ቀን', kind: 'date' },
    { key: 'source', label: 'የመጀመሪያ ምንጭ', kind: 'select', options: DONATION_SOURCE_OPTIONS, required: true, default: 'erp' },
    { key: 'notes', label: 'ማስታወሻ', kind: 'textarea', hideFromList: true },
    { key: 'transaction_id', label: 'የተፈጠረው ንቅናቄ', kind: 'media', load: fkOptions('transactions', 'ref_no'), computed: true, hideFromForm: true, hideFromList: true },
    { key: 'recorded_by', label: 'የመዘገበው', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'donations'>;

export const donationCampaignsResource = {
  table: 'donation_campaigns',
  titleAm: 'የልገሳ ዘመቻዎች',
  singularAm: 'ዘመቻ',
  description: 'ለድረ ገጽ “ልገሳ” ገጽ የሚዘጋጁ ዘመቻዎች፤ ግቡና የሚገኘው ገንዳና ምድብ ይመረጣል።',
  read: 'donations.read',
  write: 'donations.write',
  remove: 'donations.write',
  search: ['slug', 'name_am'],
  order: { by: 'created_at', descending: true },
  defaults: { currency: 'ETB', state: 'published', is_active: true, is_featured: false },
  fields: [
    { key: 'slug', label: 'አድራሻ ሐጸር', kind: 'slug', required: true },
    { key: 'name_am', label: 'ስም', kind: 'text', required: true },
    { key: 'summary_am', label: 'ማቅረብ', kind: 'textarea', hideFromList: true, maxLength: 1000 },
    { key: 'goal_amount', label: 'ግብ', kind: 'money', min: 0 },
    { key: 'currency', label: 'ብር ዓይነት', kind: 'text', default: 'ETB', hideFromList: true },
    { key: 'starts_on', label: 'የሚጀምር', kind: 'date' },
    { key: 'ends_on', label: 'የሚያልቅ', kind: 'date' },
    { key: 'account_id', label: 'የሚገባበት ሂሳብ', kind: 'media', load: fkOptions('finance_accounts', 'name_am'), hideFromList: true },
    { key: 'category_id', label: 'ምድብ', kind: 'media', load: fkOptions('finance_categories', 'name_am'), hideFromList: true },
    { key: 'cover_media_id', label: 'መሸፈኛ ሥዕል', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'is_active', label: 'ክፍት ነው', kind: 'checkbox' },
    { key: 'is_featured', label: 'ተለይቶ ይታይ', kind: 'checkbox' },
    { key: 'state', label: 'የድረ ገጽ ሁኔታ', kind: 'select', options: STATE_OPTIONS, required: true, default: 'published' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'donation_campaigns'>;

export const financeAccountsResource = {
  table: 'finance_accounts',
  titleAm: 'የሂሳብ ዝርዝር',
  singularAm: 'ሂሳብ',
  description: 'ሁሉም ገቢና ወጪ በእነዚህ ሂሳቦች ውስጥ ያልፋል። በኃላፊነት ደረጃ ሊከፋፈሉ ይችላሉ።',
  read: 'finance.read',
  write: 'finance.write',
  remove: 'finance.write',
  search: ['code', 'name_am', 'name_en'],
  order: { by: 'sort_order' },
  defaults: { currency: 'ETB', is_active: true, sort_order: 0 },
  fields: [
    { key: 'code', label: 'የሂሳብ ቁጥር', kind: 'text', required: true, width: 'sm', placeholder: 'ለምሳሌ 1000' },
    { key: 'name_am', label: 'ስም', kind: 'text', required: true },
    { key: 'name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'kind', label: 'ዓይነት', kind: 'select', options: ACCOUNT_KIND_OPTIONS, required: true, width: 'sm' },
    { key: 'parent_id', label: 'እናት ሂሳብ', kind: 'media', load: fkOptions('finance_accounts', 'name_am'), hideFromList: true },
    { key: 'currency', label: 'ብር ዓይነት', kind: 'text', default: 'ETB', hideFromList: true },
    { key: 'opening_balance', label: 'የመክፈቻ ነሣሴ', kind: 'money', required: true, min: 0, hideFromList: true },
    { key: 'is_active', label: 'ንቁ ነው', kind: 'checkbox' },
    { key: 'sort_order', label: 'ድርድር', kind: 'number', required: true, min: 0, width: 'sm' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'finance_accounts'>;

export const financeCategoriesResource = {
  table: 'finance_categories',
  titleAm: 'የፋይናንስ ምድቦች',
  singularAm: 'ምድብ',
  description: 'ገቢና ወጪ ለሪፖርት በምን ዓይነት ምድብ እንደሚከፋፈል። ለልገሳ የሚፈቀዱ ምድቦች ለየብቻ ይመለከታሉ።',
  read: 'finance.read',
  write: 'finance.write',
  remove: 'finance.write',
  search: ['name_am', 'name_en'],
  order: { by: 'sort_order' },
  defaults: { is_active: true, is_donation_eligible: false, sort_order: 0 },
  fields: [
    { key: 'name_am', label: 'ስም', kind: 'text', required: true },
    { key: 'name_en', label: 'ስም (እንግሊዝኛ)', kind: 'text', hideFromList: true },
    { key: 'kind', label: 'ዓይነት', kind: 'select', options: [
      { value: 'income', label: 'ገቢ' },
      { value: 'expense', label: 'ወጪ' },
    ], required: true, width: 'sm' },
    { key: 'account_id', label: 'የሚዛመደው ሂሳብ', kind: 'media', load: fkOptions('finance_accounts', 'name_am'), hideFromList: true },
    { key: 'description', label: 'ማብራሪያ', kind: 'textarea', hideFromList: true },
    { key: 'is_donation_eligible', label: 'ልገሳ ሊቀበል ይችላል', kind: 'checkbox' },
    { key: 'is_active', label: 'ንቁ ነው', kind: 'checkbox' },
    { key: 'sort_order', label: 'ድርድር', kind: 'number', required: true, min: 0, width: 'sm' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'finance_categories'>;

export const financeSettingsResource = {
  table: 'finance_settings',
  keyFields: ['key'],
  titleAm: 'የፋይናንስ ቅንብሮች',
  singularAm: 'ቅንብር',
  description: 'ምሳሌ የገንዘብ ምልክት፣ ራስ-ሰር የሚጸደቅ ከፍተኛ ወጪ። እሴቶች በJSON ነው፤ ቁጥር ከሆነ ብቻ በቁጥር ይጻፉ።',
  read: 'finance.read',
  write: 'finance.write',
  search: ['key', 'label_am'],
  order: { by: 'key' },
  fields: [
    { key: 'key', label: 'ቁልፍ', kind: 'text', required: true, width: 'sm', placeholder: 'ለምሳሌ auto_approve_limit' },
    { key: 'label_am', label: 'አማርኛ ስም', kind: 'text' },
    { key: 'value', label: 'እሴት (JSON)', kind: 'json', required: true, hideFromList: true, help: '{ } ፣ [ ] ፣ ቁጥር ወይም ጽሑፍ ሊሆን ይችላል' },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'finance_settings'>;

export const budgetsResource = {
  table: 'budgets',
  titleAm: 'በጀቶች',
  singularAm: 'በጀት',
  description: 'በየዘርፉና በየምድቡ የሚዘጋጁ የበጀት መስመሮች፤ የጸደቀ መጠኑን አጻዳቂ ይመዝግባል።',
  read: 'budget.read',
  write: 'budget.write',
  approve: 'budget.approve',
  remove: 'budget.write',
  search: ['period_label_am'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'created_by' },
  defaults: { currency: 'ETB', status: 'draft' },
  fields: [
    { key: 'period_label_am', label: 'የበጀት ዓመት ስም', kind: 'text', required: true, width: 'sm', placeholder: 'ለምሳሌ ፳፻፲፱ ሥ.ዓ' },
    { key: 'fiscal_year', label: 'የበጀት ዓመት (ዓ.ም)', kind: 'number', min: 0, width: 'sm' },
    { key: 'department_id', label: 'ዘርፍ', kind: 'media', load: fkOptions('departments', 'name_am') },
    { key: 'category_id', label: 'ምድብ', kind: 'media', load: fkOptions('finance_categories', 'name_am'), hideFromList: true },
    { key: 'account_id', label: 'ሂሳብ', kind: 'media', load: fkOptions('finance_accounts', 'name_am'), hideFromList: true },
    { key: 'planned_amount', label: 'የታቀደ መጠን', kind: 'money', required: true, min: 0, width: 'md' },
    { key: 'approved_amount', label: 'የጸደቀ መጠን', kind: 'money', min: 0, width: 'md', help: 'አጻዳቂ ብቻ ይሞላል' },
    { key: 'currency', label: 'ብር ዓይነት', kind: 'text', default: 'ETB', hideFromList: true },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: BUDGET_STATUS_OPTIONS, required: true, default: 'draft', width: 'sm' },
    { key: 'notes', label: 'ማስታወሻ', kind: 'textarea', hideFromList: true },
    { key: 'created_by', label: 'ያዘጋጀው', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'approved_by', label: 'ያጸደቀው', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'approved_at', label: 'የጸደቀበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'budgets'>;
