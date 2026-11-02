// Postgres/PostgREST failures translated for a congregation, not a developer.
//
// The database raises its own Amharic messages for form validation and workflow
// refusals, so those pass straight through. Everything else — a denied row-level
// security read, a duplicate key, a broken foreign key — arrives in English and
// is mapped here. The technical text stays on the console and in the audit trail.

export type DbErrorLike = { message?: string; code?: string; details?: string; hint?: string };

const ETHIOPIC = /[\u1200-\u137f]/;

/** SQLSTATE → the sentence shown to the user. */
const BY_CODE: Record<string, string> = {
  P0001: 'ይህንን መስፈርት ማከናወን አልተቻለም።እባክዎ መረጃውን አስተካክለው ይሞክሩ።',
  '42501': 'የዚህ መረጃ መከላት መብት የላይኝም።በስርዓቱ አማካሪ ወይም ከፍተኛ ኃላፊነት ያለው ተጠቃሚ ያስፈልጋል።',
  '23505': 'እንዲህ ያለ መረጃ ቀድሞ ተቀምጧል።ይህን ተደጋጋሚ እሴት ቀይረው ይሞክሩ።',
  '23503': 'የተከፈለው መረጃ ገና ጥናት ስላለበት ማጥፋት አልተቻለም።',
  '23514': 'የተሰጠው ዋጋ በሕጉ የተወሰነውን መስፈርት አያሟላም።',
  '23502': 'ያስፈልግ ያለ መረጃ ገና ላልተሞላበት ይህ ይኖርበታል።',
  PGRST116: 'የተጠየቀው መረጃ አልተገኘም ወይም ለማየት መብት የላይኝም።',
  PGRST301: 'መረጃው በተመዘገቡት መስጫዎች ሊገኝ አልተቻለም።',
  PGRST202: 'ይህ ቅጽ በመረጃው ውስጥ የለም።',
  '08001': 'ከመረጃ ማጠራቀሚያው ጋር መገናኘት አልተቻለም።',
  NETWORK_ERROR: 'ከመረጃው አገልግሎት ጋር ግንኙነት የለም።ኢንተርኔትዎን ያረጋግጡና እንደገና ይሞክሩ።',
};

/** Patterns for the English messages Postgres still produces. */
const PATTERNS: [RegExp, string][] = [
  [/relation "([^"]+)" does not exist/i, 'ይህ ሰንጠረዥ ገና አልተገነባም ($1)።'],
  [/column "([^"]+)" of relation/i, 'የተሰጠው ዓምድ ($1) በዚህ ሰንጠረዥ ውስጥ የለም።'],
  [/new row violates row-level security policy/i, 'ይህንን መረጃ ለመቅመጥ መብት የላይኝም።'],
  [/violates row-level security policy/i, 'የተቀመጠው መረጃ በፍቃድዎ ውስጥ አይገኝም።'],
  [/permission denied for function ([\w_]+)/i, 'ይህንን አገልግሎት ለመጠቀም መብት የላይኝም ($1)።'],
  [/duplicate key value violates unique constraint "([^"]+)"/i, 'ይህ ዋጋ ቀድሞ ስለተመዘገበ አይደገምም።'],
  [/violates foreign key constraint "([^"]+)"/i, 'የተራከቡበት መረጃ ስላለ መጥፋት አልተቻለም።'],
  [/insert or update on table .* violates check constraint "([^"]+)"/i, 'የሞሉት መረጃ የቤተ ክርስቲያኑን ሕግ አላሟላም።'],
  [/JWT expired/i, 'ክርድዎ አልፎበታል።እንደገና ይግቡ።'],
  [/JWT invalid/i, 'ክርድ ተቀባይነት የለውም።እንደገና ይግቡ።'],
  [/invalid login credentials/i, 'ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።'],
  [/Email not confirmed/i, 'የኢሜይል አድራሻዎ ገና ማረጋገጫ ያስፈልገዋል።'],
  [/For more information check/i, 'የስርዓቱ መልእክት ተመዝግቧል።እባክዎ እንደገና ይሞክሩ ወይም አድራሻ ይጠይቁ።'],
];

function technical(error: DbErrorLike): string {
  return [error.message, error.details, error.hint].filter(Boolean).join(' — ');
}

/** Amharic message for the screen; the English/original text goes to the log. */
export function friendlyError(error: DbErrorLike | unknown): string {
  const err = (error ?? {}) as DbErrorLike & { code?: string };
  const message = String(err.message ?? '').trim();
  const code = String(err.code ?? '').trim();

  if (ETHIOPIC.test(message)) return message;
  // The message-specific pattern wins over the SQLSTATE: PostgREST reports a
  // JWT expiry and a malformed query under the same 3xx code.
  for (const [pattern, amharic] of PATTERNS) {
    if (pattern.test(message)) return amharic.replace(/\$1/g, message.match(pattern)?.[1] ?? '');
  }
  if (code && BY_CODE[code]) return BY_CODE[code];
  if (message && /failed to fetch|networkerror|load failed/i.test(message)) return BY_CODE.NETWORK_ERROR;
  if (message) return message;
  return 'ያልተጠበቀ ችግር ተፈጥሯል።እባክዎ እንደገና ይሞክሩ።';
}

export function isRlsDenied(error: DbErrorLike): boolean {
  return error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '');
}

export { technical };
