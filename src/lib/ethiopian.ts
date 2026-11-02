// Ethiopian calendar (13 months) conversions and Ge'ez rendering.
//
// The platform stores dates as Gregorian `date`/`timestamptz` in Postgres and
// renders them in the Ethiopian calendar, so Sunday School terms, fees and fast
// days agree with the calendar on the parish wall.
//
// The epoch is pinned to the anchor the church itself observes —
//   1 መስከረም ፳፻፲፱ = Friday, 11 September 2026 —
// and every fourth Ethiopian year (year % 4 === 3) carries a sixth day in
// ጳጉሜ. That leap day is why New Year alternates between 11 and 12 September
// (2016 E.C. began 12 September 2023; 2017, 2018 and 2019 E.C. began 11
// September) and why Genna and Timket shift by a day in the year that follows.

export type EthDate = { year: number; month: number; day: number };

const DAY_MS = 86_400_000;

export const ETH_MONTHS = [
  'መስከረም',
  'ጥቅምት',
  'ኅዳር',
  'ታኅሣሥ',
  'ጥር',
  'የካቲት',
  'መጋቢት',
  'ሚያዝያ',
  'ግንቦት',
  'ሰኔ',
  'ሐምሌ',
  'ነሐሴ',
  'ጳጉሜ',
] as const;

export const ETH_WEEKDAYS = ['እሁድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ'] as const;

const GE_EZ_ONES = ['', '፩', '፪', '፫', '፬', '፭', '፮', '፯', '፰', '፱'];
const GE_EZ_TENS = ['', '፲', '፳', '፴', '፵', '፶', '፷', '፸', '፹', '፺'];
const GE_EZ_HUNDRED = '፻';
const GE_EZ_TEN_THOUSAND = '፼';

/** Fixed date (RD: day 1 = 1 January 1 CE Gregorian, a Monday) of 1/1/1 E.C. */
const ETH_EPOCH =
  fixedFromGregorian({ year: 2026, month: 9, day: 11 }) - (365 * 2018 + Math.floor(2019 / 4));

export function isEthLeapYear(year: number): boolean {
  return ((year % 4) + 4) % 4 === 3;
}

export function ethMonthLength(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 13) throw new RangeError(`የኢትዮጵያ ወር ${month} አይደለም`);
  return month === 13 ? (isEthLeapYear(year) ? 6 : 5) : 30;
}

export function ethYearLength(year: number): number {
  return isEthLeapYear(year) ? 366 : 365;
}

export function isGregorianLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function gregorianMonthLength(year: number, month: number): number {
  if (month === 2) return isGregorianLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Integer day number for a civil (wall-clock) Gregorian date. Building the UTC
 * instant by hand keeps years below 100 from being re-mapped into the 1900s.
 */
function utcMs({ year, month, day }: { year: number; month: number; day: number }): number {
  const ms = Date.UTC(2000, 0, 1);
  const dt = new Date(ms);
  dt.setUTCFullYear(year, month - 1, day);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.getTime();
}

export function fixedFromGregorian(parts: { year: number; month: number; day: number }): number {
  return Math.round(utcMs(parts) / DAY_MS) + 719_163;
}

export function gregorianFromFixed(fixed: number): { year: number; month: number; day: number } {
  const dt = new Date((fixed - 719_163) * DAY_MS);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function fixedFromEthiopian(date: EthDate): number {
  if (date.day < 1 || date.day > ethMonthLength(date.year, date.month)) {
    throw new RangeError(`${date.day} ${ETH_MONTHS[date.month - 1]} በ${date.year} ዓ.ም. የለም`);
  }
  return ETH_EPOCH + 365 * (date.year - 1) + Math.floor(date.year / 4) + 30 * (date.month - 1) + (date.day - 1);
}

export { fixedFromEthiopian };

export function ethiopianFromFixed(fixed: number): EthDate {
  const year = Math.floor((4 * (fixed - ETH_EPOCH) + 1463) / 1461);
  const start = ETH_EPOCH + 365 * (year - 1) + Math.floor(year / 4);
  const offset = fixed - start;
  const month = Math.min(13, Math.floor(offset / 30) + 1);
  return { year, month, day: offset - 30 * (month - 1) + 1 };
}

/** The civil date of a Date (local midnight) or an ISO `YYYY-MM-DD` string. */
function civilParts(value: Date | string): { year: number; month: number; day: number } {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) throw new RangeError(`ቀኑ "${value}" በትክክለኛ ቅርጸት አልተነበበም`);
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }
  return { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() };
}

export function toEthiopian(value: Date | string): EthDate {
  return ethiopianFromFixed(fixedFromGregorian(civilParts(value)));
}

export function fromEthiopian(date: EthDate): Date {
  return dateFromFixed(fixedFromEthiopian(date));
}

export function ethToday(): EthDate {
  return toEthiopian(new Date());
}

export function dateFromFixed(fixed: number): Date {
  const g = gregorianFromFixed(fixed);
  return new Date(g.year, g.month - 1, g.day);
}

export function fixedOf(value: Date | string): number {
  return fixedFromGregorian(civilParts(value));
}

/** Signed whole days from `a` to `b`. */
export function daysBetween(a: Date | string, b: Date | string): number {
  return fixedOf(b) - fixedOf(a);
}

export function addDays(value: Date | string, days: number): Date {
  return dateFromFixed(fixedOf(value) + days);
}

export function addEthDays(date: EthDate, days: number): EthDate {
  return ethiopianFromFixed(fixedFromEthiopian(date) + days);
}

/** 0 = እሁድ … 6 = ቅዳሜ, matching `Date.getDay()`. */
export function weekdayIndex(value: Date | string): number {
  // RD 1 (1 January 1 CE Gregorian) was a Monday, so the day number mod 7 already
  // lands Sunday on 0 — no offset is needed.
  return ((fixedOf(value) % 7) + 7) % 7;
}

export function ethWeekdayName(value: Date | string): string {
  return ETH_WEEKDAYS[weekdayIndex(value)];
}

/** 2019 → ፳፻፲፱, 30 → ፴, 1 → ፩. Ge'ez numerals have no zero glyph. */
export function toGeEz(value: number): string {
  if (!Number.isInteger(value) || value <= 0) return String(value);
  return geEzGroup(value);
}

function geEzGroup(value: number): string {
  if (value < 10000) return geEzUnderTenThousand(value);
  const high = Math.floor(value / 10000);
  const low = value % 10000;
  const prefix = high === 1 ? GE_EZ_TEN_THOUSAND : geEzGroup(high) + GE_EZ_TEN_THOUSAND;
  return low === 0 ? prefix : prefix + geEzUnderTenThousand(low);
}

function geEzUnderTenThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const head = hundreds === 0 ? '' : (hundreds === 1 ? '' : geEzGroup(hundreds)) + GE_EZ_HUNDRED;
  return head + GE_EZ_TENS[Math.floor(rest / 10)] + GE_EZ_ONES[rest % 10];
}

export type EthRenderOptions = { weekday?: boolean; year?: boolean; gregorian?: boolean };

/** `፳፫ ሰኞ ጥቅምት ፳፻፲፱` — the string kept in `eth_date` columns. */
export function formatEthiopian(value: Date | string, options: EthRenderOptions = {}): string {
  const { weekday = true, year = true, gregorian = false } = options;
  const eth = toEthiopian(value);
  const parts = [toGeEz(eth.day)];
  if (weekday) parts.push(ETH_WEEKDAYS[weekdayIndex(value)]);
  parts.push(ETH_MONTHS[eth.month - 1]);
  if (year) parts.push(toGeEz(eth.year));
  if (gregorian) parts.push(`(${formatGregorian(value)})`);
  return parts.join(' ');
}

export function formatEthiopianShort(value: Date | string): string {
  return formatEthiopian(value, { weekday: false });
}

/** Ethiopian year a Gregorian date falls in — drives term and report filters. */
export function ethYearOf(value: Date | string): number {
  return toEthiopian(value).year;
}

/** 1 መስከረም of an Ethiopian year, as a Gregorian Date. */
export function ethNewYear(ethYear: number): Date {
  return fromEthiopian({ year: ethYear, month: 1, day: 1 });
}

export function ethYearLabel(ethYear: number): string {
  return `${toGeEz(ethYear)} ዓ.ም.`;
}

export function formatGregorian(value: Date | string): string {
  const p = civilParts(value);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Inclusive Ethiopian-date range as a Gregorian `[start, end]` pair. */
export function ethRange(ethYear: number, month: number, fromDay: number, toDay: number): [Date, Date] {
  return [
    fromEthiopian({ year: ethYear, month, day: fromDay }),
    fromEthiopian({ year: ethYear, month, day: toDay }),
  ];
}
