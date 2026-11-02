// Liturgical layer over the Ethiopian calendar: the Fasika computus, the fixed
// and movable feasts, and the fasting seasons the ERP shows on attendance
// slips, event pages and reports.
//
// Fasika follows the Bahire Hasab result, which is the Julian computus applied
// to the Julian year the Ethiopian year runs into (Ethiopian Y = Julian Y + 8).
// Anchored against published dates: ፳፻፺፭ → 16 April 2023, ፳፻፺፯ → 20 April 2025,
// ፳፻፺ → 2 May 2027.
//
// Feasts are keyed to Ethiopian dates, which is why Genna falls on 8 January
// and Timket on 20 January in the year after an Ethiopian leap year. The fasts
// are counted from Fasika the way the Bahire Hasab counts them — ጾመ ነቢያት the
// Monday-to-Wednesday 69 days before Pascha (2017 ዓ.ም.: Yekatit 3 = 10 February
// 2025), ዓቢይ ጾም the 62 days from Clean Monday through Holy Saturday, and 43/55
// day ጾመ ግንባታ taken as the 55 days that end on ርእሰ ልደት. A parish that keeps a
// different reckoning overrides it in the events module rather than in this file.

// The `./ethiopian.ts` extension is deliberate: scripts/verify-lib.mjs imports
// these pure modules directly under node's type stripping, without a bundler.
import {
  ETH_MONTHS,
  ETH_WEEKDAYS,
  dateFromFixed,
  daysBetween,
  ethiopianFromFixed,
  fixedFromEthiopian,
  fixedFromGregorian,
  fixedOf,
  fromEthiopian,
  toGeEz,
  weekdayIndex,
  type EthDate,
} from './ethiopian.ts';

export type FastKind = 'great' | 'nineveh' | 'apostles' | 'mary' | 'nativity' | 'week';

export type LiturgicalEntry = { key: string; nameAm: string };

export type DayDevotion = {
  eth: EthDate;
  weekdayAm: string;
  isFeast: boolean;
  isFastDay: boolean;
  feasts: LiturgicalEntry[];
  fast: LiturgicalEntry | null;
  fastKind: FastKind | null;
  seasonAm: string;
};

/** Julian-to-Gregorian drift for the given year (13 days across the 1900s and 2000s). */
function julianDrift(year: number): number {
  return Math.floor(year / 100) - Math.floor(year / 400) - 2;
}

/** Orthodox Pascha (a Sunday) for a Julian-calendar year, as a Gregorian day. */
function orthodoxPaschaJulian(julianYear: number): number {
  const a = julianYear % 4;
  const b = julianYear % 7;
  const c = julianYear % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return fixedFromGregorian({ year: julianYear, month, day }) + julianDrift(julianYear);
}

/** Fixed-date (day-number) accessors, so every rule below is plain arithmetic. */
export function fasikaFixed(ethYear: number): number {
  return orthodoxPaschaJulian(ethYear + 8);
}

export function fasika(ethYear: number): Date {
  return dateFromFixed(fasikaFixed(ethYear));
}

export const GENNA = { month: 4, day: 29 } as const;
export const TIMKET = { month: 5, day: 11 } as const;

function yearFixed(ethYear: number, eth: { month: number; day: number }): number {
  return fixedFromEthiopian({ year: ethYear, month: eth.month, day: eth.day });
}

export function genna(ethYear: number): Date {
  return fromEthiopian({ year: ethYear, month: GENNA.month, day: GENNA.day });
}

export function timket(ethYear: number): Date {
  return fromEthiopian({ year: ethYear, month: TIMKET.month, day: TIMKET.day });
}

type Span = (ethYear: number) => [number, number];

export const FASTS: (LiturgicalEntry & { kind: FastKind; span: Span })[] = [
  {
    key: 'nineveh',
    kind: 'nineveh',
    nameAm: 'ጾመ ነቢያት',
    span: (y) => [fasikaFixed(y) - 69, fasikaFixed(y) - 67],
  },
  {
    key: 'great',
    kind: 'great',
    nameAm: 'ዓቢይ ጾም',
    span: (y) => [fasikaFixed(y) - 62, fasikaFixed(y) - 1],
  },
  {
    key: 'apostles',
    kind: 'apostles',
    nameAm: 'ጾመ ሐዋርያት',
    span: (y) => [fasikaFixed(y) + 50, yearFixed(y, { month: 10, day: 4 })],
  },
  {
    key: 'mary',
    kind: 'mary',
    nameAm: 'ጾመ ድህነት ወልደ ማርያም',
    span: (y) => [yearFixed(y, { month: 12, day: 1 }), yearFixed(y, { month: 12, day: 15 })],
  },
  {
    key: 'nativity',
    kind: 'nativity',
    nameAm: 'ጾመ ግንባታ',
    span: (y) => [yearFixed(y, { month: 4, day: 29 }) - 55, yearFixed(y, { month: 4, day: 28 })],
  },
];

/** The Gregorian start and end of one fast, for the fast-season screens. */
export function fastSpan(kind: FastKind, ethYear: number): [Date, Date] {
  const fast = FASTS.find((f) => f.kind === kind);
  if (!fast) throw new RangeError(`ጾም ${kind} በዝርዝሩ የለም`);
  const [start, end] = fast.span(ethYear);
  return [dateFromFixed(start), dateFromFixed(end)];
}

/** Days the fast lasts, counted inclusively — the number printed on the calendar. */
export function fastLength(kind: FastKind, ethYear: number): number {
  const [start, end] = fastSpan(kind, ethYear);
  return daysBetween(start, end) + 1;
}

export const FEASTS: (LiturgicalEntry & { span: Span })[] = [
  { key: 'enkutatash', nameAm: 'እንቁጣጣሽ (ዓመተ ምሕረት)', span: (y) => [yearFixed(y, { month: 1, day: 1 }), yearFixed(y, { month: 1, day: 1 })] },
  { key: 'meskel-eve', nameAm: 'መስከረም ፲፮ (ምዕራፈ ምስቀል)', span: (y) => [yearFixed(y, { month: 1, day: 16 }), yearFixed(y, { month: 1, day: 16 })] },
  { key: 'meskel', nameAm: 'ምስቀል', span: (y) => [yearFixed(y, { month: 1, day: 17 }), yearFixed(y, { month: 1, day: 17 })] },
  { key: 'genna', nameAm: 'ልደተ ሥጋው (ገና)', span: (y) => [yearFixed(y, { month: 4, day: 29 }), yearFixed(y, { month: 4, day: 29 })] },
  { key: 'timket-eve', nameAm: 'ቅዳሜ ዕለተ ጥምቀት', span: (y) => [yearFixed(y, { month: 5, day: 10 }), yearFixed(y, { month: 5, day: 10 })] },
  { key: 'timket', nameAm: 'ዕለተ ምዕማደ ብቱ (ጥምቀት)', span: (y) => [yearFixed(y, { month: 5, day: 11 }), yearFixed(y, { month: 5, day: 11 })] },
  { key: 'mika', nameAm: 'ቅዱስ ሚካኤል', span: (y) => [yearFixed(y, { month: 5, day: 12 }), yearFixed(y, { month: 5, day: 12 })] },
  { key: 'kidane', nameAm: 'ኪዳነ ምሕረት (ትንቢተ ማርያም)', span: (y) => [yearFixed(y, { month: 8, day: 13 }), yearFixed(y, { month: 8, day: 13 })] },
  { key: 'dedet', nameAm: 'ዕለተ ድህነት ወልደ ማርያም', span: (y) => [yearFixed(y, { month: 12, day: 16 }), yearFixed(y, { month: 12, day: 16 })] },
  { key: 'tabor', nameAm: 'ዕለተ ለሇተ ተራ (ደገ ማርያም)', span: (y) => [yearFixed(y, { month: 11, day: 1 }), yearFixed(y, { month: 11, day: 1 })] },
];

/** Feasts measured from Fasika; the offsets are in days. */
export const MOVABLE_FEASTS: (LiturgicalEntry & { offset: number })[] = [
  { key: 'hosanna', nameAm: 'ሆሳዕና', offset: -7 },
  { key: 'siclet', nameAm: 'ዓርብ ስቅለት', offset: -2 },
  { key: 'fasika', nameAm: 'ፋሲካ (ዕለተ ትንሣኤ)', offset: 0 },
  { key: 'merkab', nameAm: 'ዕርደት', offset: 39 },
  { key: 'pentecost', nameAm: 'ፈረግታ (ዕለተ መንፈስ ቅዱስ)', offset: 49 },
];

function spans(year: number, span: Span, fixed: number): boolean {
  const [start, end] = span(year);
  return fixed >= start && fixed <= end;
}

/** The fifty days from Fasika to ፈረግታ, and the twelve from Genna to Timket, are fast-free. */
function isFastFree(fixed: number, ethYear: number): boolean {
  const pascha = fasikaFixed(ethYear);
  if (fixed >= pascha && fixed <= pascha + 49) return true;
  const christmas = yearFixed(ethYear, GENNA);
  return fixed >= christmas && fixed <= yearFixed(ethYear, TIMKET);
}

function weeklyFast(value: Date | string): LiturgicalEntry | null {
  const wd = weekdayIndex(value);
  if (wd !== 3 && wd !== 5) return null;
  return { key: 'week', nameAm: wd === 3 ? 'ረቡዕ ጾም' : 'ዓርብ ጾም' };
}

function seasonFor(fixed: number, ethYear: number, fast: LiturgicalEntry | null, kind: FastKind | null): string {
  if (kind === 'great') {
    const pascha = fasikaFixed(ethYear);
    return fixed >= pascha - 6 && fixed < pascha ? 'ልቅ ዓርብ ሳምንት' : 'ጾመ ነፍሳት';
  }
  if (kind === 'nativity') return 'ዘመነ ሌዋት (ጾመ ግንባታ)';
  if (kind === 'apostles') return 'ዘመነ መንፈስ (ጾመ ሐዋርያት)';
  if (kind === 'mary') return 'ጾመ ድህነት';
  if (kind === 'nineveh') return 'ጾመ ነቢያት';
  if (isFastFree(fixed, ethYear)) {
    const pascha = fasikaFixed(ethYear);
    if (fixed >= pascha && fixed <= pascha + 49) return 'ዘመነ ኃምሳ (የፋሲካ ደስታ)';
    return 'ዘመነ ልደት (የልደት ደስታ)';
  }
  if (fast) return 'ረቡዕና ዓርብ ጾም';
  const christmas = yearFixed(ethYear, GENNA);
  if (fixed < christmas) return 'ዘመነ በረከት';
  const pascha = fasikaFixed(ethYear);
  if (fixed >= pascha) return 'ዘመነ መንፈስ';
  return 'ዘመነ ነፍሳት';
}

/** Everything the church calendar says about one Gregorian day. */
export function devotionFor(value: Date | string): DayDevotion {
  const fixed = fixedOf(value);
  const eth = ethiopianFromFixed(fixed);
  const feasts = FEASTS.filter((f) => spans(eth.year, f.span, fixed)).map(({ key, nameAm }) => ({ key, nameAm }));
  for (const m of MOVABLE_FEASTS) {
    if (fixed === fasikaFixed(eth.year) + m.offset) feasts.push({ key: m.key, nameAm: m.nameAm });
  }
  const fastFree = isFastFree(fixed, eth.year);
  const major = fastFree ? undefined : FASTS.find((f) => spans(eth.year, f.span, fixed));
  const weekly = major || fastFree ? null : weeklyFast(value);
  const fast = major ? { key: major.key, nameAm: major.nameAm } : weekly;
  return {
    eth,
    weekdayAm: ETH_WEEKDAYS[weekdayIndex(value)],
    isFeast: feasts.length > 0,
    isFastDay: fast !== null,
    feasts,
    fast,
    fastKind: major ? major.kind : weekly ? 'week' : null,
    seasonAm: seasonFor(fixed, eth.year, fast, major ? major.kind : null),
  };
}

export function devotionSummary(value: Date | string): string {
  const d = devotionFor(value);
  const parts = [`${toGeEz(d.eth.day)} ${ETH_MONTHS[d.eth.month - 1]} ${d.weekdayAm}`];
  if (d.feasts.length) parts.push(d.feasts.map((f) => f.nameAm).join(' · '));
  if (d.fast) parts.push(d.fast.nameAm);
  return parts.join(' — ');
}
