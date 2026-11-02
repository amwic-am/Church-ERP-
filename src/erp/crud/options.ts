// Where a dropdown's choices come from.
//
// Foreign keys are live lists, not hard-coded strings: the same row level security
// that gates the table gates the option list, so a department head picks their own
// departments and nobody sees a name they may not read.

import { listRows, supabase, type TableName } from '@/lib/supabase';
import { GENDER, MEMBER_STATUS } from '@/lib/i18n';
import type { Option } from '../crud/resource';

/** `id` + a label column, newest first, capped so a select stays usable. */
export function fkOptions<T extends TableName>(table: T, labelKey: string, labelKey2?: string) {
  return async (): Promise<Option[]> => {
    const rows = await listRows(supabase.from(table).select('*').limit(400).order('created_at', { ascending: false }));
    // The builder's row type is a conditional over a generic table name, so TS
    // cannot resolve it here; the labels below are read by key at runtime.
    return (rows as unknown as Record<string, unknown>[]).map((row) => {
      const first = row[labelKey];
      const second = labelKey2 ? row[labelKey2] : undefined;
      const label = [first, second].filter((v) => typeof v === 'string' && v).join(' · ');
      return { value: String(row.id), label: label || String(row.id) };
    });
  };
}

/** A select of two fixed columns, e.g. `full_name_am` and a code. */
export function pairOptions<T extends TableName>(table: T, valueKey: string, labelKey: string) {
  return async (): Promise<Option[]> => {
    const rows = await listRows(supabase.from(table).select('*').limit(400));
    return (rows as unknown as Record<string, unknown>[]).map((row) => ({
      value: String(row[valueKey]),
      label: String(row[labelKey] ?? row[valueKey]),
    }));
  };
}

export const GENDER_OPTIONS: Option[] = Object.entries(GENDER).map(([value, label]) => ({ value, label }));
export const MEMBER_STATUS_OPTIONS: Option[] = Object.entries(MEMBER_STATUS).map(([value, label]) => ({ value, label }));

export const YES_NO: Option[] = [
  { value: 'true', label: 'አዎ' },
  { value: 'false', label: 'አይ' },
];

/** The event kinds the public site groups by. */
export const EVENT_TYPES: Option[] = [
  { value: 'worship', label: 'ሥዕደት/ልዩ ጸሎት' },
  { value: 'feast', label: 'በዓል' },
  { value: 'fasting', label: 'ጾም' },
  { value: 'meeting', label: 'ስብሰባ' },
  { value: 'class', label: 'የሰንበት ትምህርት' },
  { value: 'retreat', label: 'ማሰላሰያ' },
  { value: 'charity', label: 'የጸጋ ሥራ' },
  { value: 'other', label: 'ሌላ' },
];

/** The block types the homepage and the page templates understand. */
export const BLOCK_TYPES: Option[] = [
  { value: 'hero', label: 'መከላከያ ስዕል (hero)' },
  { value: 'heading', label: 'ርዕስ' },
  { value: 'text', label: 'ጽሑፍ' },
  { value: 'cards', label: 'ካርዶች' },
  { value: 'list', label: 'ዝርዝር' },
  { value: 'gallery', label: 'ፎቶ ማህደር' },
  { value: 'events', label: 'የሚመጡ ፕሮግራሞች' },
  { value: 'news', label: 'የቅርብ ጊዜ ዜና' },
  { value: 'sermons', label: 'ንብዕቶች' },
  { value: 'mezmur', label: 'መዝሙሮች' },
  { value: 'verses', label: 'የቅዱስ ውቅር ጥቅስ' },
  { value: 'quote', label: 'ጥቅስ' },
  { value: 'cta', label: 'ወደ ተግባር የሚጋብዝ' },
  { value: 'map', label: 'ካርታ' },
  { value: 'contact', label: 'የግንኙነት መረጃ' },
  { value: 'donate', label: 'ልገሳ' },
  { value: 'stats', label: 'ቁጥሮች' },
  { value: 'video', label: 'ቪዲዮ' },
];

export const PAGE_TEMPLATES: Option[] = [
  { value: 'default', label: 'ደረጃውን የጠበቀ' },
  { value: 'landing', label: 'የመነሻ ቅጽ' },
  { value: 'article', label: 'ጽሑፍ' },
  { value: 'contact', label: 'ግንኙነት' },
  { value: 'full', label: 'ሙሉ ገጽ' },
];

export const MENU_LOCATIONS: Option[] = [
  { value: 'header', label: 'የላይኛው ዝርዝር' },
  { value: 'footer', label: 'የታችኛው ዝርዝር' },
  { value: 'mobile', label: 'የስልክ ዝርዝር' },
  { value: 'quick', label: 'ፈጣን አገናኞች' },
];

