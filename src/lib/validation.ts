// Form schemas that say the same thing the database says.
//
// Every CHECK constraint and every `public_text/public_phone/public_email` rule
// in the migrations has a twin here, with the identical Amharic wording. A form
// that is stricter than the database annoys people; one that is looser lets them
// type for five minutes before the server refuses. Either way the database
// decides — this file only moves the answer earlier.

import { z } from 'zod';

/** Mirrors `public.public_text`: required by default, trimmed, bounded. */
export function amText(field: string, { min = 1, max = 4000, required = true } = {}) {
  const base = z
    .string()
    .trim()
    .refine((v) => !required || v.length > 0, { message: `እባክዎ ${field} ይሙሉ` })
    .refine((v) => v === '' || v.length >= min, { message: `${field} በጣም አጭር ነው` })
    .refine((v) => v.length <= max, { message: `${field} በጣም ረጅም ነው (ከ${max} ብዛት በላይ ሊሆን አይችልም)` });
  return required ? base : base.optional().transform((v) => v ?? '');
}

export const amName = (field = 'ስም', max = 160) => amText(field, { min: 2, max });

/** Mirrors `public.public_phone`: digits and an optional `+`, 9–12 of them. */
export const ethPhone = (field = 'ስልክ ቁጥር', { required = false } = {}) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[^\d+]/g, ''))
    .refine(
      (v) => (required ? v.length > 0 : true),
      { message: `እባክዎ ${field} ይሙሉ` }
    )
    .refine((v) => v === '' || (v.replace(/\+/g, '').length >= 9 && v.replace(/\+/g, '').length <= 12), {
      message: 'ስልክ ቁጥሩ ትክክለኛ አይመስልም',
    });

/** Mirrors `public.public_email`, including the lower-casing it performs. */
export const ethEmail = (field = 'ኢሜይል አድራሻ', { required = false } = {}) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => (required ? v.length > 0 : true), { message: `እባክዎ ${field} ይሙሉ` })
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: 'የኢሜይል አድራሻው ትክክለኛ አይመስልም',
    });

/** The slug CHECK used by pages, news, events, albums, campaigns and departments. */
export const slugField = (field = 'አድራሻ ሐጸር (slug)') =>
  z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, `${field} በንṹ ሕጉ መሠረት በትንሹ እንግሊዝኛና በቁጥር ብቻ መሆን አለበት`);

export const roleKeyField = () =>
  z.string().trim().regex(/^[a-z][a-z0-9_]{1,59}$/, 'የተጠቃሚ ደረጃ ቁልፍ በትንሹ እንግሊዝኛ መጀመሪያ ላይ መሆን አለበት');

export const permissionKeyField = () =>
  z.string().trim().regex(/^[a-z_]+\.[a-z_]+$/, 'የፍቃድ ቁልፍ "ክፍል.ተግባር" መልክ ይዘው መገባል');

/** Money: positive, sane ceiling, two decimals — the same range the RPC allows. */
export const amountField = (field = 'መጠን', { max = 10_000_000, min = 0.01 } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))))
    .refine((v) => Number.isFinite(v), { message: `${field} በቁጥር መሆን አለበት` })
    .refine((v) => v >= min, { message: `${field} ከ${min} ማነስ የለበትም` })
    .refine((v) => v <= max, { message: 'ከገደቡ በላይ ለሆነ መጠን እባክዎ ቤተ ክርስቲያኑን በስልክ ይገናኙ' });

/** Ethiopian calendar date typed as `YYYY-MM-DD` (Gregorian storage). */
export const isoDate = (field = 'ቀን') =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${field} በዓ.ም ፲፬/፩/፩ መልክ ይጻፉ`)
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: `${field} ትክክለኛ ቀን አይደለም` });

export const yearField = (field = 'ዓ.ም') =>
  z.coerce
    .number()
    .int(`${field} ሙሉ ቁጥር መሆን አለበት`)
    .min(1900, `${field} በጣም ያለፈ ነው`)
    .max(2100, `${field} በጣም የሚጠበቅ ነው`);

export const requiredChoice = <T extends readonly [string, ...string[]]>(values: T, field: string) =>
  z.enum(values, { errorMap: () => ({ message: `${field} ይምረጡ` }) });

/** The sign-in secret. Supabase itself refuses anything shorter than six. */
export const passwordField = () =>
  z.string().min(6, 'የይለፍ ቃሉ ቢያንስ 6 ፊደላት መሆን አለበት').max(200, 'የይለፍ ቃሉ በጣም ረጅም ነው');

/** The two new passwords a reset form collects. */
export const passwordPair = () =>
  z
    .object({ password: passwordField(), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: 'የይለፍ ቃሎቹ አይዛመዱም', path: ['confirm'] });

/** Reads the first message zod produced, for a single inline error under a field. */
export function firstIssue(error: z.ZodError): string {
  return error.errors[0]?.message ?? 'እባክዎ መረጃውን ያረጋግጡ';
}

export function issueMap(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
