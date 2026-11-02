// Money, dates, phones and numbers as the parish writes them.
//
// Amounts are Ethiopian br, digits stay Arabic numerals (what Sunday School
// registers use), and every date is rendered in the Ethiopian calendar with the
// Gregorian equivalent available for exports that have to match bank records.

import { formatEthiopian, formatGregorian, toGeEz, ETH_MONTHS, toEthiopian } from './ethiopian.ts';

const numberFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const moneyFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function num(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? numberFormat.format(n) : '0';
}

/** `ብር 1,250` — amounts render with the symbol first, as everywhere in Ethiopia. */
export function br(value: number | string | null | undefined, { cents = false } = {}): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!Number.isFinite(n)) return 'ብር 0';
  return `ብር ${cents ? moneyFormat.format(n) : numberFormat.format(Math.round(n * 100) / 100)}`;
}

export function pct(value: number | string | null | undefined, digits = 1): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(digits).replace(/\.0+$/, '')}%`;
}

export function dateAm(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return formatEthiopian(value);
}

export function dateAmShort(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return formatEthiopian(value, { weekday: false });
}

export function dateBoth(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return `${formatEthiopian(value)} (${formatGregorian(value)})`;
}

/** `2026-11-02T08:30:00+03:00` → `፲፬ ሰዓት ፴ ደቂቃ` style clock text. */
export function timeAm(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const hour = d.getHours();
  const civil = hour % 12 === 0 ? 12 : hour % 12;
  const period = hour < 6 ? 'ከሌሊት' : hour < 12 ? 'ጠዋት' : hour < 18 ? 'ከሰዓት' : 'ከምሽት';
  const minute = d.getMinutes();
  return `${toGeEz(civil)} ሰዓት${minute ? ` ${toGeEz(minute)} ደቂቃ` : ''} ${period}`;
}

export function dateTimeAm(value: Date | string): string {
  return `${dateAmShort(value)} — ${timeAm(value)}`;
}

/** Ethiopian local numbers normalise to +251 for SMS and directory display. */
export function phoneAm(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/[^\d+]/g, '');
  const bare = digits.replace(/^\+?251/, '').replace(/^0/, '');
  if (bare.length !== 9) return digits || '—';
  return `+251 ${bare.slice(0, 1)}${bare.slice(1, 3)} ${bare.slice(3, 6)} ${bare.slice(6)}`.replace('  ', ' ');
}

export function initials(nameAm: string | null | undefined): string {
  const words = (nameAm ?? '')
    .split(/[\s-]+/)
    .filter((w) => w.trim().length > 0)
    .slice(0, 2);
  const out = words.map((w) => [...w][0]).join('');
  return out || 'ቤ';
}

export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 ባይት';
  const units = ['ባይት', 'ኪሎ ባይት', 'ሜగా ባይት', 'ጊጋ ባይት'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** "3 ቀን በፊት" / "ካለፉት 2 ወራት" — used in dashboards and activity feeds. */
export function relativeAm(value: Date | string): string {
  const then = typeof value === 'string' ? new Date(value) : value;
  const diffDays = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (diffDays <= 0) {
    const diffHours = Math.round((Date.now() - then.getTime()) / 3_600_000);
    if (diffHours <= 0) return 'አሁን';
    return `ከ${diffHours} ሰዓት በፊት`;
  }
  if (diffDays === 1) return 'ትናንት';
  if (diffDays < 30) return `ከ${diffDays} ቀናት በፊት`;
  if (diffDays < 365) return `ከ${Math.round(diffDays / 30)} ወራት በፊት`;
  return `ከ${Math.round(diffDays / 365)} ዓመታት በፊት`;
}

export function ethMonthName(value: Date | string): string {
  return ETH_MONTHS[toEthiopian(value).month - 1];
}

export function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** CSV needs quoting, or an Amharic address with a comma breaks the export. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  if (!rows.length) return '';
  const cols = headers ?? Object.keys(rows[0]);
  const head = cols.map(csvCell).join(',');
  const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')).join('\n');
  // The BOM is what makes Excel read Amharic correctly instead of question marks.
  return `\ufeff${head}\n${body}`;
}
