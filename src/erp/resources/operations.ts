// Operations & housekeeping resources — the library, stores, fixed assets, the
// ERP document centre, the certificate register and the volunteer roster.
//
// None of these tables is a `content_types` row, so nothing here moves through the
// draft→approve→publish ladder: loan/copy status, stock movement and volunteer
// hours are plain columns, some of which Postgres rewrites from a trigger or a
// domain RPC. Every field names a real column, every select lists only the values
// the CHECK constraints in the migrations accept, and the ledger tables keep their
// history (library_loans and inventory_movements cannot be deleted here).

import type { Resource, Option } from '../crud/resource';
import { fkOptions } from '../crud/options';
import { CONTENT_STATE } from '@/lib/i18n';

/** `documents.state` — the shared `content_state` enum, reused from the glossary. */
const CONTENT_STATE_OPTIONS: Option[] = Object.entries(CONTENT_STATE).map(([value, label]) => ({ value, label }));

/** `library_copies.status` — CHECK list in 20261102001000_operations.sql. */
const COPY_STATUS_OPTIONS: Option[] = [
  { value: 'available', label: 'በማዕከሉ አለ (ዝግጁ)' },
  { value: 'on_loan', label: 'በተበዳሪ ዘንድ' },
  { value: 'lost', label: 'ጠፍቷል' },
  { value: 'damaged', label: 'ጉዳት የደረሰ' },
  { value: 'processing', label: 'በማዘጋጀት ላይ' },
];

/** `library_loans.status` — CHECK list in operations.sql. */
const LOAN_STATUS_OPTIONS: Option[] = [
  { value: 'borrowed', label: 'በዕዳ ላይ' },
  { value: 'returned', label: 'ተመልሷል' },
  { value: 'overdue', label: 'የመመለሻ ቀኑ አልፏል' },
  { value: 'lost_written_off', label: 'ጠፍቶ ተክዏ ይታሰባል' },
];

/** `inventory_movements.direction` — CHECK list in operations.sql. */
const MOVEMENT_DIRECTION_OPTIONS: Option[] = [
  { value: 'in', label: 'ገቢ (ወደ ክምችት)' },
  { value: 'out', label: 'ወጪ (ከክምችት)' },
  { value: 'adjust', label: 'የቆጠራ ማስተካከያ' },
];

/** `assets.kind` — CHECK list in operations.sql. */
const ASSET_KIND_OPTIONS: Option[] = [
  { value: 'equipment', label: 'መሣሪያ' },
  { value: 'furniture', label: 'የቤት ዕቃ (ገበታና ጠረጴዛ)' },
  { value: 'vehicle', label: 'ተሽከርካሪ' },
  { value: 'electronics', label: 'ኤሌክትሮኒካዊ ዕቃ' },
  { value: 'building', label: 'ህንፃ' },
  { value: 'book_set', label: 'የመጻሕፍት ስብስብ' },
  { value: 'instrument', label: 'የሙዚቃ መሣሪያ' },
  { value: 'other', label: 'ሌላ' },
];

/** `assets.status` — CHECK list in operations.sql. */
const ASSET_STATUS_OPTIONS: Option[] = [
  { value: 'active', label: 'ንቁ አገልግሎት' },
  { value: 'in_use', label: 'በአጠቃቀም ላይ' },
  { value: 'storage', label: 'በማከማቻ' },
  { value: 'repair', label: 'በጥገና ላይ' },
  { value: 'retired', label: 'ከአገልግሎት የወጣ' },
  { value: 'lost', label: 'ጠፍቷል' },
];

/** `documents.category` — CHECK list in operations.sql. */
const DOCUMENT_CATEGORY_OPTIONS: Option[] = [
  { value: 'general', label: 'አጠቃላይ' },
  { value: 'governance', label: 'አስተዳደርና ደንብ' },
  { value: 'minutes', label: 'የስብሰባ ደቂቃ' },
  { value: 'policy', label: 'ፖሊሲ' },
  { value: 'report', label: 'ሪፖርት' },
  { value: 'form', label: 'ቅጽ' },
  { value: 'contract', label: 'ሐዋሳ/ኮንትራት' },
  { value: 'curriculum', label: 'ሥርዓተ ትምህርት' },
  { value: 'finance', label: 'ሒሳብና ገንዘብ' },
  { value: 'other', label: 'ሌላ' },
];

/** `documents.kind` — CHECK list in operations.sql. */
const DOCUMENT_KIND_OPTIONS: Option[] = [
  { value: 'pdf', label: 'ፒዲኤፍ (PDF)' },
  { value: 'doc', label: 'ዮታ (DOC)' },
  { value: 'sheet', label: 'ሂሳብ ገጽ (ሺት)' },
  { value: 'image', label: 'ምስል' },
  { value: 'audio', label: 'ድምጽ' },
  { value: 'video', label: 'ቪዲዮ' },
  { value: 'archive', label: 'የተጠቃለለ ፋይል' },
  { value: 'other', label: 'ሌላ' },
];

/** `certificate_templates.kind` — CHECK list in 20261102000600_academics.sql. */
const CERT_TEMPLATE_KIND_OPTIONS: Option[] = [
  { value: 'completion', label: 'የትምህርት ማጠናቀቂያ' },
  { value: 'merit', label: 'ክብር/ሽልማት' },
  { value: 'participation', label: 'ተሳትፎ' },
  { value: 'teacher_appreciation', label: 'የመምህር ማመስገን' },
  { value: 'leadership', label: 'አመራርና መሪነት' },
];

/** `volunteer_profiles.status` — CHECK list in 20261102000800_departments.sql. */
const VOLUNTEER_STATUS_OPTIONS: Option[] = [
  { value: 'pending', label: 'በመጠባበቂያ ላይ' },
  { value: 'active', label: 'ንቁ አገልጋይ' },
  { value: 'on_hold', label: 'ለጊዜው ቆሟል' },
  { value: 'inactive', label: 'ያልተገናኘ' },
];

/** `volunteer_assignments.status` — CHECK list in departments.sql. */
const ASSIGNMENT_STATUS_OPTIONS: Option[] = [
  { value: 'assigned', label: 'ተመድቧል' },
  { value: 'completed', label: 'ተጠናቋል' },
  { value: 'cancelled', label: 'ተሰርዟል' },
];

// ─── መጻሕፍት ማዕከል ────────────────────────────────────────────────────────────

export const libraryBooksResource = {
  table: 'library_books',
  titleAm: 'የመጻሕፍት ዝርዝር',
  singularAm: 'መጽሐፍ',
  description: 'የመጻሕፍት ማዕከሉ የሚያዘጋጃቸው መጽሐፍት ዋና ዝርዝር፤ በእጅ ላይ ያሉ ቅጂዎች በ “የመጽሐፍ ቅጂዎች” ይመዘገባሉ።',
  read: 'operations.read',
  write: 'operations.write',
  remove: 'operations.write',
  search: ['title_am', 'author_am', 'isbn', 'category_am'],
  order: { by: 'created_at', descending: true },
  defaults: { language: 'am', is_reference_only: false },
  fields: [
    { key: 'title_am', label: 'ርዕስ', kind: 'text', required: true },
    { key: 'author_am', label: 'ደራሲ', kind: 'text' },
    { key: 'publisher', label: 'አሳሳሚ', kind: 'text', hideFromList: true },
    { key: 'published_on', label: 'የታተመበት ዓመት/ቀን', kind: 'date', hideFromList: true },
    { key: 'isbn', label: 'ISBN', kind: 'text' },
    { key: 'category_am', label: 'ምድብ', kind: 'text', placeholder: 'ለምሳሌ መጻሕፍተ ቅዱስ፣ ሐዋስያን' },
    { key: 'language', label: 'ቋንቋ', kind: 'text', required: true, default: 'am', hideFromList: true },
    { key: 'summary_am', label: 'ማቅረብ', kind: 'textarea', hideFromList: true },
    { key: 'cover_media_id', label: 'መሸፈኛ', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'total_copies', label: 'አጠቃላይ ቅጂዎች', kind: 'number', required: true, min: 0, default: 1 },
    { key: 'is_reference_only', label: 'መመሪያ ብቻ (አይበደርም)', kind: 'checkbox' },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'library_books'>;

export const libraryCopiesResource = {
  table: 'library_copies',
  titleAm: 'የመጽሐፍ ቅጂዎች',
  singularAm: 'ቅጂ',
  description: 'ለእያንዳንዱ መጽሐፍ የተለየ ባርኮድ ያለው ቅጂ፤ “በዕዳ ላይ/ዝግጁ” ሁኔታው ከብድር መዝገቡ በራሱ ይከታተላል።',
  read: 'operations.read',
  write: 'operations.write',
  remove: 'operations.write',
  search: ['barcode', 'note_am'],
  order: { by: 'barcode' },
  defaults: { status: 'available' },
  fields: [
    { key: 'book_id', label: 'መጽሐፍ', kind: 'select', required: true, load: fkOptions('library_books', 'title_am'), hideFromList: true },
    { key: 'barcode', label: 'ባርኮድ', kind: 'text', required: true, help: 'ለእያንዳንዱ ቅጂ የተለየ መለያ ቁጥር' },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: COPY_STATUS_OPTIONS, required: true, default: 'available', computed: true, hideFromForm: true, help: 'ከብድር መዝገቡ ስለሚከታተል እዚህ ለማንበብ ብቻ' },
    { key: 'note_am', label: 'ማስታወሻ', kind: 'textarea', maxLength: 1000, hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'library_copies'>;

export const libraryLoansResource = {
  table: 'library_loans',
  titleAm: 'የመጻሕፍት ብድር',
  singularAm: 'ብድር',
  description: 'የቅጂ መውሰድና መመለስ መዝገብ፤ ቅጂ ሲመለስ ወይም ሲጠፋ የቅጂው ሁኔታ በራሱ ይሻሻላል። ታሪክ ስለሚጠበቅ መሰረዝ የለም።',
  read: 'operations.read',
  write: 'operations.write',
  search: ['note_am'],
  order: { by: 'created_at', descending: true },
  defaults: { status: 'borrowed', fine_paid: false },
  fields: [
    { key: 'copy_id', label: 'ቅጂ', kind: 'select', required: true, load: fkOptions('library_copies', 'barcode') },
    { key: 'borrower_member_id', label: 'አባል ተበዳሪ', kind: 'select', load: fkOptions('members', 'full_name_am'), hideFromList: true, help: 'ከሦስቱ አንዱ ብቻ መሙላት አለበት' },
    { key: 'borrower_student_id', label: 'ተማሪ ተበዳሪ', kind: 'select', load: fkOptions('student_profiles', 'full_name_am'), hideFromList: true },
    { key: 'borrower_staff_id', label: 'መምህር ተበዳሪ', kind: 'select', load: fkOptions('teacher_profiles', 'full_name_am'), hideFromList: true },
    { key: 'loaned_on', label: 'የተበዳረበት ቀን', kind: 'date', required: true },
    { key: 'due_on', label: 'የሚመለስበት ቀን', kind: 'date' },
    { key: 'returned_on', label: 'የተመለሰበት ቀን', kind: 'date', hideFromList: true },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: LOAN_STATUS_OPTIONS, required: true, default: 'borrowed' },
    { key: 'fine', label: 'ቅጣት', kind: 'money', min: 0, hideFromList: true },
    { key: 'fine_paid', label: 'ቅጣቱ ተከፍሏል', kind: 'checkbox' },
    { key: 'handled_by', label: 'የተቆጣጠረው', kind: 'select', load: fkOptions('profiles', 'full_name_am'), hideFromList: true },
    { key: 'note_am', label: 'ማስታወሻ', kind: 'textarea', maxLength: 1000, hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'library_loans'>;

// ─── እቃ ክምችት ────────────────────────────────────────────────────────────────

export const inventoryItemsResource = {
  table: 'inventory_items',
  titleAm: 'እቃ ክምችት ዝርዝር',
  singularAm: 'እቃ',
  description: 'የቤተ ክርስቲያኑ እቃና ዕቃ ዋና ዝርዝር፤ የቀረው ብዛት ከእንቅስቃሴ መዝገብ በራሱ ስለሚሰላ እዚህ በእጅ አይቀየርም።',
  read: 'operations.read',
  write: 'operations.write',
  remove: 'operations.write',
  search: ['sku', 'name_am', 'category_am', 'supplier'],
  order: { by: 'sku' },
  defaults: { currency: 'ETB', is_active: true },
  fields: [
    { key: 'sku', label: 'የእቃ ኮድ (SKU)', kind: 'text', required: true, help: 'የተለየ የእቃ መለያ ኮድ' },
    { key: 'name_am', label: 'የእቃ ስም', kind: 'text', required: true },
    { key: 'category_am', label: 'ምድብ', kind: 'text', placeholder: 'ለምሳሌ የመሣሪያ፣ የቤት ዕቃ' },
    { key: 'unit_am', label: 'መለኪያ አሃድ', kind: 'text', required: true, default: 'አሃድ', placeholder: 'አሃድ / ኪሎ / ሊትር' },
    { key: 'quantity', label: 'ያለ መጠን', kind: 'number', min: 0, computed: true, hideFromForm: true, help: 'ከገቢና ወጪ እንቅስቃሴዎች የሚሰላ' },
    { key: 'reorder_level', label: 'እንደገና የሚዛወድበት መጠን', kind: 'number', min: 0, default: 0 },
    { key: 'unit_cost', label: 'የአሃድ ዋጋ', kind: 'money', min: 0, hideFromList: true },
    { key: 'currency', label: 'ብር ዓይነት', kind: 'text', default: 'ETB', hideFromList: true },
    { key: 'location_am', label: 'የሚያዝበው ቦታ', kind: 'text' },
    { key: 'supplier', label: 'አቅራቢ', kind: 'text', hideFromList: true },
    { key: 'is_active', label: 'ንቁ ነው', kind: 'checkbox' },
    { key: 'note_am', label: 'ማስታወሻ', kind: 'textarea', maxLength: 2000, hideFromList: true },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'inventory_items'>;

export const inventoryMovementsResource = {
  table: 'inventory_movements',
  titleAm: 'የእቃ እንቅስቃሴዎች',
  singularAm: 'እንቅስቃሴ',
  description: 'ወደ ክምችት የገቡና የወጡ እቃዎች መዝገብ፤ እያንዳንዱ መስመር የእቃውን ቀሪ ብዛት ያንቀሳቅሳል። ማረጋገጫ ስለሆነ መሰረዝ የለም።',
  read: 'operations.read',
  write: 'operations.write',
  search: ['reason_am', 'counterparty'],
  order: { by: 'created_at', descending: true },
  fields: [
    { key: 'item_id', label: 'እቃ', kind: 'select', required: true, load: fkOptions('inventory_items', 'name_am') },
    { key: 'direction', label: 'አቅጣጫ', kind: 'select', options: MOVEMENT_DIRECTION_OPTIONS, required: true },
    { key: 'quantity', label: 'መጠን', kind: 'number', required: true, help: 'ከዜሮ የተለየ ቁጥር ይሁን (ለማስተካከያ ምልክቱ አስፈላጊ ነው)' },
    { key: 'moved_on', label: 'የተንቀሳቀሰበት ቀን', kind: 'date', required: true },
    { key: 'reason_am', label: 'ምክንያት', kind: 'text', placeholder: 'ለምሳሌ ለሥዕደት መግዣ፣ ለክፍል ስርጭት' },
    { key: 'counterparty', label: 'የተሰጠው/የተወሰደው', kind: 'text', hideFromList: true },
    { key: 'transaction_id', label: 'የተያያዘ ግብይት', kind: 'select', load: fkOptions('transactions', 'ref_no'), hideFromList: true },
    { key: 'moved_by', label: 'ያንቀሳቀሰው', kind: 'select', load: fkOptions('profiles', 'full_name_am'), hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'inventory_movements'>;

export const assetsResource = {
  table: 'assets',
  titleAm: 'ቋሚ ንብረቶች',
  singularAm: 'ንብረት',
  description: 'የቤተ ክርስቲያኑ ቋሚ ንብረቶች — መሣሪያ፣ የቤት ዕቃ፣ ተሽከርካሪና ሌሎች — በዕለት ተዕለት አጠቃቀምና ጥገና መዝገብ።',
  read: 'operations.read',
  write: 'operations.write',
  remove: 'operations.write',
  search: ['tag', 'name_am', 'serial_no', 'supplier'],
  order: { by: 'tag' },
  defaults: { kind: 'equipment', status: 'active', currency: 'ETB' },
  fields: [
    { key: 'tag', label: 'የንብረት ማሰቢያ ቁጥር', kind: 'text', required: true, help: 'የተለየ አሰባበር ቁጥር' },
    { key: 'name_am', label: 'የንብረት ስም', kind: 'text', required: true },
    { key: 'kind', label: 'ዓይነት', kind: 'select', options: ASSET_KIND_OPTIONS, required: true, default: 'equipment' },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: ASSET_STATUS_OPTIONS, required: true, default: 'active' },
    { key: 'purchase_on', label: 'የተገዛበት ቀን', kind: 'date', hideFromList: true },
    { key: 'cost', label: 'የዋጋ ሐሳብ', kind: 'money', min: 0, hideFromList: true },
    { key: 'currency', label: 'ብር ዓይነት', kind: 'text', default: 'ETB', hideFromList: true },
    { key: 'supplier', label: 'አቅራቢ', kind: 'text', hideFromList: true },
    { key: 'serial_no', label: 'የመሣሪያ ቁጥር', kind: 'text' },
    { key: 'warranty_until', label: 'ዋስትና የሚያበቃበት', kind: 'date', hideFromList: true },
    { key: 'location_am', label: 'የሚገኝበት ቦታ', kind: 'text' },
    { key: 'department_id', label: 'ዘርፍ', kind: 'select', load: fkOptions('departments', 'name_am'), hideFromList: true },
    { key: 'assigned_to_member', label: 'የተሰጠው አባል', kind: 'select', load: fkOptions('members', 'full_name_am'), hideFromList: true },
    { key: 'assigned_to_staff', label: 'የተሰጠው መምህር', kind: 'select', load: fkOptions('teacher_profiles', 'full_name_am'), hideFromList: true },
    { key: 'photo_media_id', label: 'ምስል', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'maintenance_notes', label: 'የጥገና ማስታወሻ', kind: 'textarea', maxLength: 4000, hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'assets'>;

// ─── ሰነዶች ───────────────────────────────────────────────────────────────────

export const documentsResource = {
  table: 'documents',
  titleAm: 'ሰነዶች ማዕከል',
  singularAm: 'ሰነድ',
  description: 'ደንቦች፣ የስብሰባ ደቂቃዎች፣ ሪፖርቶችና ፖሊሲዎች የሚያዙ ማዕከላዊ ሰነድ ማህደር። ፋይሉ ከሰቀላ በኋላ መንገዱ ይመዘገባል።',
  read: 'documents.read',
  write: 'documents.write',
  remove: 'documents.write',
  search: ['title_am', 'bucket', 'storage_path'],
  order: { by: 'created_at', descending: true },
  ownedBy: { createdBy: 'uploaded_by' },
  defaults: { bucket: 'private-docs', category: 'general', kind: 'document', version: 1, is_public: false, state: 'published' },
  fields: [
    { key: 'title_am', label: 'የሰነዱ ርዕስ', kind: 'text', required: true },
    { key: 'category', label: 'ምድብ', kind: 'select', options: DOCUMENT_CATEGORY_OPTIONS, required: true, default: 'general' },
    { key: 'kind', label: 'ፋይል ዓይነት', kind: 'select', options: DOCUMENT_KIND_OPTIONS, required: true, default: 'document' },
    { key: 'bucket', label: 'ማከማቻ ቦታ', kind: 'text', required: true, default: 'private-docs', hideFromList: true },
    { key: 'storage_path', label: 'የፋይል አድራሻ', kind: 'text', required: true, hideFromList: true, help: 'ከሰቀላው በኋላ የሚመረጥ የፋይል መንገድ' },
    { key: 'version', label: 'ዕትም', kind: 'number', required: true, min: 1, default: 1 },
    { key: 'state', label: 'የሰነዱ ሁኔታ', kind: 'select', options: CONTENT_STATE_OPTIONS, required: true, default: 'published' },
    { key: 'tags', label: 'ታግዎች', kind: 'tags', placeholder: 'በሰሌዳ የተለያዩ', hideFromList: true },
    { key: 'is_public', label: 'ለሁሉም ይታያል', kind: 'checkbox' },
    { key: 'valid_until', label: 'የሚያበቃበት ቀን', kind: 'date', hideFromList: true },
    { key: 'linked', label: 'የተያያዙ ነገሮች (JSON)', kind: 'json', hideFromList: true, help: '{ "class_id": "", "department_id": "", "event_id": "" }' },
    { key: 'created_at', label: 'የተጨመረበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'documents'>;

// ─── ምስክር ወረቀቶች ────────────────────────────────────────────────────────────

export const certificateTemplatesResource = {
  table: 'certificate_templates',
  titleAm: 'የምስክር ወረቀት ቅንጾች',
  singularAm: 'ቅንጥ',
  description: 'ለተማሪዎችና መምህራን ለሚዘጋጁ ምስክር ወረቀቶች ቅንጮች፤ ርዕስ፣ ይዘትና ፊርማ እዚህ ይዘጋጃል።',
  read: 'certificates.read',
  write: 'certificates.write',
  remove: 'certificates.write',
  search: ['name_am', 'heading_am', 'issuer_am'],
  order: { by: 'created_at', descending: true },
  defaults: { kind: 'completion', is_active: true },
  fields: [
    { key: 'name_am', label: 'የቅንጡ ስም', kind: 'text', required: true },
    { key: 'kind', label: 'ዓይነት', kind: 'select', options: CERT_TEMPLATE_KIND_OPTIONS, required: true, default: 'completion' },
    { key: 'heading_am', label: 'ዋና ርዕስ', kind: 'text' },
    { key: 'body_am', label: 'ሐዋሳ', kind: 'textarea', hideFromList: true, placeholder: '{{student}} {{class}} {{year}} {{date}} ተለዋዋጮች ይጠቀሙ' },
    { key: 'issuer_am', label: 'አወጣጥ ተሽየጭ', kind: 'text', hideFromList: true },
    { key: 'signature_name_am', label: 'የፊርማ ስም', kind: 'text', hideFromList: true },
    { key: 'signature_title_am', label: 'የፊርማ ደረጃ', kind: 'text', hideFromList: true },
    { key: 'logo_media_id', label: 'ልጥፍ (Logo)', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'seal_media_id', label: 'ማህተም', kind: 'media', load: fkOptions('media_files', 'name'), hideFromList: true },
    { key: 'design', label: 'ቅርጽና ቅንብር (JSON)', kind: 'json', hideFromList: true },
    { key: 'is_active', label: 'ንቁ ቅንጥ ነው', kind: 'checkbox' },
    { key: 'created_at', label: 'የተፈጠረበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'certificate_templates'>;

export const issuedCertificatesResource = {
  table: 'issued_certificates',
  titleAm: 'የተሰጡ ምስክር ወረቀቶች',
  singularAm: 'ምስክር',
  description: 'በ “ምስክር መስጠት” ተግባር የተሰጡ ምስክር ወረቀቶች መዝገብ። ቁጥር፣ የማረጋገጫ ኮድና ቅርጽ በሂደቱ ይሞላሉ፤ እዚህ ለማንበብ ብቻ።',
  read: 'certificates.read',
  write: 'certificates.write',
  remove: 'certificates.write',
  search: ['certificate_no', 'verification_code', 'title_am'],
  order: { by: 'certificate_no', descending: true },
  fields: [
    { key: 'student_id', label: 'ተቀባይ ተማሪ', kind: 'select', required: true, load: fkOptions('student_profiles', 'full_name_am') },
    { key: 'title_am', label: 'የምስክሩ ርዕስ', kind: 'text', computed: true, hideFromForm: true },
    { key: 'certificate_no', label: 'የምስክር ቁጥር', kind: 'text', computed: true, hideFromForm: true },
    { key: 'verification_code', label: 'የማረጋገጫ ኮድ', kind: 'text', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'template_id', label: 'የተጠቀመው ቅንጥ', kind: 'select', load: fkOptions('certificate_templates', 'name_am'), hideFromList: true },
    { key: 'issued_on', label: 'የተሰጠበት ቀን', kind: 'date', computed: true, hideFromForm: true },
    { key: 'academic_year_id', label: 'የትምህርት ዓመት', kind: 'select', load: fkOptions('academic_years', 'label_am'), computed: true, hideFromForm: true, hideFromList: true },
    { key: 'class_id', label: 'ክፍል', kind: 'select', load: fkOptions('classes', 'name_am', 'code'), hideFromList: true },
    { key: 'render_snapshot', label: 'የታተመ ይዘት (JSON)', kind: 'json', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'verified_at', label: 'የተረጋገጠበት ሰዓት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
    { key: 'issued_by', label: 'የሰጠው', kind: 'select', load: fkOptions('profiles', 'full_name_am'), computed: true, hideFromForm: true, hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'issued_certificates'>;

// ─── በፈቃደኝነት አገልግሎት ───────────────────────────────────────────────────────

export const volunteerProfilesResource = {
  table: 'volunteer_profiles',
  titleAm: 'በፈቃደኝነት አገልጋዮች',
  singularAm: 'አገልጋይ',
  description: 'የበፈቃደኝነት አገልጋዮች መዝገብ፤ የተሰሩ ሰዓታት ከተጠናቋሉ ተግባራት በራሱ ስለሚደመሩ እዚህ በእጅ አይቀየርም።',
  read: 'volunteers.read',
  write: 'volunteers.write',
  remove: 'volunteers.write',
  search: ['availability'],
  order: { by: 'created_at', descending: true },
  defaults: { status: 'active' },
  fields: [
    { key: 'member_id', label: 'አባል', kind: 'select', required: true, load: fkOptions('members', 'full_name_am') },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: VOLUNTEER_STATUS_OPTIONS, required: true, default: 'active' },
    { key: 'skills', label: 'ክህሎቶች', kind: 'tags', placeholder: 'በሰሌዳ የተለያዩ', hideFromList: true },
    { key: 'interests', label: 'ዝንባሌዎች', kind: 'tags', placeholder: 'በሰሌዳ የተለያዩ', hideFromList: true },
    { key: 'service_areas', label: 'የአገልግሎት ዘርፎች', kind: 'tags', placeholder: 'በሰሌዳ የተለያዩ' },
    { key: 'availability', label: 'የሚቻልበት ጊዜ', kind: 'text', placeholder: 'ለምሳሌ እሁድ ሐምሌ' },
    { key: 'hours_logged', label: 'የተሰሩ ሰዓታት', kind: 'number', min: 0, computed: true, hideFromForm: true, help: 'ከተጠናቋሉ ተግባራት በራሱ ይደመራል' },
    { key: 'application_id', label: 'የመጣበት ማመልከቻ', kind: 'select', load: fkOptions('applications', 'reference'), hideFromList: true },
    { key: 'approved_by', label: 'ያጸደቀው', kind: 'select', load: fkOptions('profiles', 'full_name_am'), hideFromList: true },
    { key: 'approved_on', label: 'ያጸደቀበት ቀን', kind: 'date', hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
    { key: 'updated_at', label: 'የተሻሻለበት', kind: 'datetime', computed: true, hideFromForm: true, hideFromList: true },
  ],
} satisfies Resource<'volunteer_profiles'>;

export const volunteerAssignmentsResource = {
  table: 'volunteer_assignments',
  titleAm: 'የአገልጋይ ተግባራት',
  singularAm: 'ተግባር',
  description: 'አገልጋዮች ወደ ፕሮግራም፣ ወደ ዘርፍ ወይም ወደ ተግባር የሚመደቡበትና ሰዓት የሚመዘገብበት። ተግባሩ ሲጠናቀቅ የአገልጋዩ ሰዓት ይደመራል።',
  read: 'volunteers.read',
  write: 'volunteers.write',
  remove: 'volunteers.write',
  search: ['role_am', 'note_am'],
  order: { by: 'created_at', descending: true },
  defaults: { status: 'assigned' },
  fields: [
    { key: 'volunteer_id', label: 'አገልጋይ', kind: 'select', required: true, load: fkOptions('volunteer_profiles', 'member_id') },
    { key: 'status', label: 'ሁኔታ', kind: 'select', options: ASSIGNMENT_STATUS_OPTIONS, required: true, default: 'assigned' },
    { key: 'activity_id', label: 'የዘርፍ ተግባር', kind: 'select', load: fkOptions('department_activities', 'title_am'), hideFromList: true },
    { key: 'event_id', label: 'ፕሮግራም', kind: 'select', load: fkOptions('events', 'title_am'), hideFromList: true },
    { key: 'department_id', label: 'ዘርፍ', kind: 'select', load: fkOptions('departments', 'name_am'), hideFromList: true },
    { key: 'role_am', label: 'ተሰውቶት የቀመጠው ሚና', kind: 'text', placeholder: 'ለምሳሌ አዘጋጅ፣ የምግብ ሠራተኛ' },
    { key: 'hours', label: 'ሰዓት', kind: 'number', min: 0, default: 0 },
    { key: 'assigned_on', label: 'የተመደበበት ቀን', kind: 'date', required: true },
    { key: 'note_am', label: 'ማስታወሻ', kind: 'textarea', maxLength: 2000, hideFromList: true },
    { key: 'created_at', label: 'የተመዘገበበት', kind: 'datetime', computed: true, hideFromForm: true },
  ],
} satisfies Resource<'volunteer_assignments'>;
