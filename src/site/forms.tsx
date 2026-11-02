// The seven public endpoints of the specification, as real forms.
//
// Nothing here writes a table directly: `anon` has no insert grant at all, so each
// form posts to one SECURITY DEFINER function in the migrations, which sanitises
// the text, enforces the limits and decides the row's starting status. The zod
// rules below mirror those same limits so a visitor sees the error before the
// database raises it — never after.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, ErrorNote } from '@/components/ui/surface';
import { DateInput, Field, Input, Select, Textarea, type Option } from '@/components/ui/form';
import { amText, amountField, ethEmail, ethPhone, isoDate, requiredChoice } from '@/lib/validation';
import { callFn } from '@/lib/supabase';
import { UI } from '@/lib/i18n';
import { env, isSupabaseConfigured } from '@/lib/env';

import { PageHeader, SiteSection } from './common';
import { Seo } from './Seo';
import { useRows } from './data';
import type { ViewRow } from '@/lib/supabase';

const APPLICATION_KINDS: Option[] = [
  { value: 'student', label: 'የሰንበት ትምህርት ተማሪ' },
  { value: 'teacher', label: 'መምህር/መምህራን' },
  { value: 'volunteer', label: 'በፈቃደኝነት አገልጋይ' },
  { value: 'member', label: 'የቤተ ክርስቲያን አባል' },
];

const CONTACT_TOPICS: Option[] = [
  { value: 'general', label: 'አጠቃላይ ጥያቄ' },
  { value: 'registration', label: 'ምዝገባ' },
  { value: 'donation', label: 'ልገሳ' },
  { value: 'media', label: 'ሐቀፍና ድምጽ' },
  { value: 'prayer', label: 'ጸሎት' },
  { value: 'volunteer', label: 'በፈቃደኝነት አገልግሎት' },
  { value: 'other', label: 'ሌላ' },
];

const PRAYER_CATEGORIES: Option[] = [
  { value: 'healing', label: 'ጤና' },
  { value: 'family', label: 'ቤተሰብ' },
  { value: 'travel', label: 'ጉዞ' },
  { value: 'work', label: 'ሥራ' },
  { value: 'thanksgiving', label: 'አመሰግና' },
  { value: 'deceased', label: 'ለተሻመነ ነፍስ' },
  { value: 'church', label: 'ለቤተ ክርስቲያን' },
  { value: 'nation', label: 'ለሀገር' },
  { value: 'general', label: 'አጠቃላይ' },
];

const DONATION_METHODS: Option[] = [
  { value: 'cash', label: 'በጥሬ ገንዘብ' },
  { value: 'bank_transfer', label: 'በባንክ ማስተላለፍ' },
  { value: 'mobile_money', label: 'በሞባይል ገንዘብ' },
  { value: 'check', label: 'ቼክ' },
  { value: 'card', label: 'ካርድ' },
  { value: 'other', label: 'ሌላ' },
];

/** One line of explanation above every public form, in the church's own voice. */
function FormIntro({ children }: { children: ReactNode }) {
  return <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function Notice({ kind, children }: { kind: 'success' | 'error'; children: ReactNode }) {
  if (kind === 'error') return <ErrorNote className="mb-5" message={String(children)} />;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-leaf/40 bg-leaf/10 px-4 py-3 text-sm">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/**
 * Every public form runs through this: the submit is a single RPC, its `message_am`
 * is the receipt, and a Postgres failure surfaces as the Amharic text the function
 * raised rather than as a silent toast.
 */
function usePublicSubmit() {
  const [failure, setFailure] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(call: () => Promise<unknown>) {
    setFailure(null);
    setBusy(true);
    try {
      const data = (await call()) as Record<string, unknown> | null;
      setReceipt(data ?? {});
      return data;
    } catch (e) {
      setFailure(e instanceof Error ? e.message : UI.serverError);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { failure, receipt, busy, run, reset: () => setReceipt(null) };
}

function SubmitButton({ busy, disabled, label }: { busy: boolean; disabled?: boolean; label: string }) {
  return (
    <Button type="submit" loading={busy} disabled={disabled || !isSupabaseConfigured} icon={<Send className="h-4 w-4" aria-hidden />}>
      {label}
    </Button>
  );
}

// ─── ማመልከቻ · application ────────────────────────────────────────────────────
const applicationSchema = z.object({
  kind: requiredChoice(['student', 'teacher', 'volunteer', 'member'] as const, 'የማመልከቻ ዓይነት'),
  full_name_am: amText('ሙሉ ስም', { min: 2, max: 120 }),
  baptismal_name_am: amText('የገላ ስም', { min: 2, max: 120, required: false }),
  phone: ethPhone('ስልክ ቁጥር', { required: true }),
  email: ethEmail('ኢሜይል አድራሻ'),
  gender: z.union([z.literal(''), z.literal('male'), z.literal('female')]),
  birth_date: isoDate('የልደት ቀን').optional().or(z.literal('')),
  address_am: amText('አድራሻ', { min: 2, max: 500, required: false }),
  parish: amText('የመንፈስ ቅዱስ ጉባኤ', { min: 2, max: 200, required: false }),
  guardian_name: amText('የአባት ወይም የእናት ስም', { min: 2, max: 120, required: false }),
  guardian_phone: ethPhone('የወላጅ ስልክ'),
  level_requested: amText('የተጠየቀ የትምህርት ደረጃ', { min: 1, max: 120, required: false }),
  department_pref: amText('የክፍለ ጉዳይ ምርጫ', { min: 1, max: 120, required: false }),
  availability: amText('የሰዓት አቅም', { min: 1, max: 200, required: false }),
  motivation_am: amText('ሐሳብ / ምክንያት', { min: 4, max: 2000, required: false }),
});
type ApplicationValues = z.infer<typeof applicationSchema>;

export function ApplicationForm() {
  const { failure, receipt, busy, run, reset } = usePublicSubmit();
  const form = useForm<ApplicationValues>({ resolver: zodResolver(applicationSchema), mode: 'onSubmit' });
  const kind = form.watch('kind');
  const isStudent = kind === 'student';

  if (receipt) {
    return (
      <Card className="max-w-xl">
        <CardBody className="space-y-3">
          <Notice kind="success">
            <p>{String(receipt.message_am ?? 'ማመልከቻዎ ተቀብሏል።')}</p>
            <p className="mt-2 font-medium">
              የማመልከቻ መከታተያ ቁጥር፦ <span className="font-mono">{String(receipt.reference ?? '')}</span>
            </p>
          </Notice>
          <p className="text-sm text-muted-foreground">በ “የማመልከቻ ውጤት” ገጽ በዚህ ቁጥርና በስልክዎ ወይም በኢሜይልዎ ማየት ይችላሉ።</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/status">
              <Button variant="outline" size="sm">
                ሁኔታዬን ይከታተሉ
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={reset}>
              ሌላ ማመልከቻ ይሙሉ
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardBody>
        {!isSupabaseConfigured ? <ErrorNote className="mb-4" message={`ድረ ገጹ ገና ከ${env.appName} መረጃ ማዕከል ጋር አልተገናኘም — ቅጹ መላክ አይችልም።`} /> : null}
        {failure ? <Notice kind="error">{failure}</Notice> : null}
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((values) => run(() => callFn('submit_application', { p: values })))}
        >
          <Field label="የማመልከቻ ዓይነት" htmlFor="kind" required error={form.formState.errors.kind?.message} className="sm:col-span-2">
            <Select id="kind" options={APPLICATION_KINDS} invalid={Boolean(form.formState.errors.kind)} {...form.register('kind')} />
          </Field>

          <Field label="ሙሉ ስም" htmlFor="full_name_am" required error={form.formState.errors.full_name_am?.message}>
            <Input id="full_name_am" autoComplete="name" invalid={Boolean(form.formState.errors.full_name_am)} {...form.register('full_name_am')} />
          </Field>
          <Field label="የገላ ስም" htmlFor="baptismal_name_am" error={form.formState.errors.baptismal_name_am?.message} hint="የገላ ስም ካለዎት ይጻፉ።">
            <Input id="baptismal_name_am" invalid={Boolean(form.formState.errors.baptismal_name_am)} {...form.register('baptismal_name_am')} />
          </Field>
          <Field label="ስልክ ቁጥር" htmlFor="phone" required error={form.formState.errors.phone?.message}>
            <Input id="phone" type="tel" inputMode="tel" placeholder="09…" autoComplete="tel" invalid={Boolean(form.formState.errors.phone)} {...form.register('phone')} />
          </Field>
          <Field label="ኢሜይል አድራሻ" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
          </Field>
          <Field label="ፆታ" htmlFor="gender" error={form.formState.errors.gender?.message}>
            <Select id="gender" options={[{ value: '', label: '— አለ —' }, { value: 'male', label: 'ወንድ' }, { value: 'female', label: 'ሴት' }]} invalid={Boolean(form.formState.errors.gender)} {...form.register('gender')} />
          </Field>
          <Field label="የልደት ቀን" htmlFor="birth_date" error={form.formState.errors.birth_date?.message} hint="በግሪጎሪያን ቀን ይቀመጣል፤ የኢትዮጵያ ቀን ከታች ይታያል።">
            <DateInput id="birth_date" value={form.watch('birth_date') ?? ''} onValueChange={(next) => form.setValue('birth_date', next, { shouldDirty: true })} />
          </Field>
          <Field label="አድራሻ" htmlFor="address_am" error={form.formState.errors.address_am?.message} className="sm:col-span-2">
            <Input id="address_am" invalid={Boolean(form.formState.errors.address_am)} {...form.register('address_am')} />
          </Field>
          <Field label="የመንፈስ ቅዱስ ጉባኤ" htmlFor="parish" error={form.formState.errors.parish?.message} className="sm:col-span-2">
            <Input id="parish" placeholder="የሚንበሩበት ጉባኤ" invalid={Boolean(form.formState.errors.parish)} {...form.register('parish')} />
          </Field>

          {isStudent ? (
            <>
              <Field label="የአባት/የእናት ስም" htmlFor="guardian_name" error={form.formState.errors.guardian_name?.message}>
                <Input id="guardian_name" invalid={Boolean(form.formState.errors.guardian_name)} {...form.register('guardian_name')} />
              </Field>
              <Field label="የወላጅ ስልክ" htmlFor="guardian_phone" error={form.formState.errors.guardian_phone?.message}>
                <Input id="guardian_phone" type="tel" placeholder="09…" invalid={Boolean(form.formState.errors.guardian_phone)} {...form.register('guardian_phone')} />
              </Field>
              <Field label="የሚፈለግ የትምህርት ደረጃ" htmlFor="level_requested" error={form.formState.errors.level_requested?.message} hint="ለምሳሌ፦ ደረጃ ፫፣ መዝሙር ዕጣ፣ ትምህርተ ሐዋሳ">
                <Input id="level_requested" invalid={Boolean(form.formState.errors.level_requested)} {...form.register('level_requested')} />
              </Field>
            </>
          ) : (
            <>
              <Field label="የሚመረጥ ክፍለ ጉዳይ" htmlFor="department_pref" error={form.formState.errors.department_pref?.message}>
                <Input id="department_pref" invalid={Boolean(form.formState.errors.department_pref)} {...form.register('department_pref')} />
              </Field>
              <Field label="የሰዓት አቅም" htmlFor="availability" error={form.formState.errors.availability?.message} hint="ለምሳሌ፦ እሁድ ከጠዋት ፪ ሰዓት">
                <Input id="availability" invalid={Boolean(form.formState.errors.availability)} {...form.register('availability')} />
              </Field>
            </>
          )}

          <Field label="ምክንያትዎ / ሐሳብዎ" htmlFor="motivation_am" error={form.formState.errors.motivation_am?.message} className="sm:col-span-2">
            <Textarea id="motivation_am" rows={4} invalid={Boolean(form.formState.errors.motivation_am)} {...form.register('motivation_am')} />
          </Field>

          <div className="sm:col-span-2">
            <SubmitButton busy={busy} label="ማመልከቻ ላክ" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function RegisterPage() {
  return (
    <>
      <Seo title="ምዝገባ" description="የተክለቴዎፍሎስ ሰንበት ት/ቤት የተማሪ፣ መምህርና አቅም ሰጪ ማመልከቻ" />
      <PageHeader title="ምዝገባ" description="ለሰንበት ትምህርት ቤት፣ ለመምህርነትና ለበፈቃደኝነት አገልግሎት ማመልከቻ ይሙሉ።" eyebrow="ማመልከቻ" />
      <SiteSection>
        <FormIntro>
          ቅጹ ከተላከ በኃላ በቤተ ክርስቲያኑ ኃላፊዎች ይከታተላል፤ ውጤቱ በመከታተያ ቁጥርና በስልክዎ ወይም በኢሜይልዎ ሊገኝ ይችላል።
        </FormIntro>
        <ApplicationForm />
      </SiteSection>
    </>
  );
}

// ─── የማመልከቻ ውጤት · status ──────────────────────────────────────────────────
const statusSchema = z.object({
  p_reference: amText('መከታተያ ቁጥር', { min: 3, max: 40 }),
  p_contact: z.union([ethEmail('ስልክ ወይም ኢሜይል', { required: true }), ethPhone('ስልክ ወይም ኢሜይል', { required: true })]),
});
type StatusValues = z.infer<typeof statusSchema>;

export function StatusPage() {
  const { failure, receipt, busy, run, reset } = usePublicSubmit();
  const form = useForm<StatusValues>({ resolver: zodResolver(statusSchema), mode: 'onSubmit' });

  return (
    <>
      <Seo title="የማመልከቻ ውጤት" description="የተላከ ማመልከቻ ሁኔታ በመከታተያ ቁጥር ይመልከቱ" />
      <PageHeader title="የማመልከቻ ውጤት" description="ማመልከቻዎ የት እንዳለ በመከታተያ ቁጥርዎ ይከታተሉ።" eyebrow="ክትትል" />
      <SiteSection>
        <FormIntro>
          መከታተያ ቁጥሩ ማመልከቻ ሲያጠናቅቁ የተሰጠዎት ኮድ ነው። ለደህንነቱ የተጠየቀውን ስልክ ወይም ኢሜይል መሙላት ያስፈልጋል።
        </FormIntro>

        {receipt ? (
          <Card className="max-w-xl">
            <CardBody className="space-y-2">
              <p className="font-display text-lg font-semibold">{String(receipt.status_am ?? 'በመከታተል ላይ')}</p>
              <p className="text-sm text-muted-foreground">
                ዓይነት፦ {String(receipt.kind ?? '')} · ኮድ፦ <span className="font-mono">{String(receipt.reference ?? '')}</span>
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-sm">
                <span>የቀረበበት፦ {String(receipt.submitted_at ?? '—')}</span>
                {receipt.reviewed_at ? <span>የተመመበት፦ {String(receipt.reviewed_at)}</span> : null}
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={reset}>
                ሌላ ማመልከቻ ይፈልጉ
              </Button>
            </CardBody>
          </Card>
        ) : (
          <Card className="max-w-xl">
            <CardBody>
              {failure ? <Notice kind="error">{failure}</Notice> : null}
              <form
                className="grid gap-4"
                noValidate
                onSubmit={form.handleSubmit((values) => run(() => callFn('check_application_status', values)))}
              >
                <Field label="መከታተያ ቁጥር" htmlFor="p_reference" required error={form.formState.errors.p_reference?.message}>
                  <Input id="p_reference" className="font-mono" placeholder="ለምሳሌ APP-2026-0007" invalid={Boolean(form.formState.errors.p_reference)} {...form.register('p_reference')} />
                </Field>
                <Field label="ስልክ ወይም ኢሜይል" htmlFor="p_contact" required error={form.formState.errors.p_contact?.message} hint="ማመልከቻው ላይ የጻፉትን ይጠቀሙ።">
                  <Input id="p_contact" invalid={Boolean(form.formState.errors.p_contact)} {...form.register('p_contact')} />
                </Field>
                <div>
                  <SubmitButton busy={busy} label="ሁኔታዬን ይመልከቱ" />
                </div>
              </form>
            </CardBody>
          </Card>
        )}
      </SiteSection>
    </>
  );
}

// ─── ግንኙነት · contact ────────────────────────────────────────────────────────
const contactSchema = z.object({
  name_am: amText('ስም', { min: 2, max: 120 }),
  email: ethEmail('ኢሜይል አድራሻ', { required: true }),
  phone: ethPhone('ስልክ ቁጥር'),
  topic: z.string().trim().optional(),
  subject_am: amText('ርዕስ', { min: 2, max: 200 }),
  message_am: amText('መልእክት', { min: 10, max: 4000 }),
});
type ContactValues = z.infer<typeof contactSchema>;

export function ContactForm() {
  const { failure, receipt, busy, run, reset } = usePublicSubmit();
  const form = useForm<ContactValues>({ resolver: zodResolver(contactSchema), mode: 'onSubmit' });

  if (receipt) {
    return (
      <Card className="max-w-xl">
        <CardBody>
          <Notice kind="success">{String(receipt.message_am ?? 'መልእክትዎ ደርሷል።')}</Notice>
          <Button variant="ghost" size="sm" onClick={reset}>
            ሌላ መልእክት ይላኩ
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardBody>
        {!isSupabaseConfigured ? <ErrorNote className="mb-4" message="ድረ ገጹ ገና ከመረጃ ማዕከል ጋር አልተገናኘም — መልእክት መላክ አይችልም።" /> : null}
        {failure ? <Notice kind="error">{failure}</Notice> : null}
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((values) => run(() => callFn('submit_contact_message', { p: { ...values, source_url: window.location.pathname } })))}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ስም" htmlFor="name_am" required error={form.formState.errors.name_am?.message}>
              <Input id="name_am" autoComplete="name" invalid={Boolean(form.formState.errors.name_am)} {...form.register('name_am')} />
            </Field>
            <Field label="ርዕስ" htmlFor="topic" error={form.formState.errors.topic?.message}>
              <Select id="topic" options={CONTACT_TOPICS} {...form.register('topic')} />
            </Field>
            <Field label="ኢሜይል አድራሻ" htmlFor="email" required error={form.formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
            </Field>
            <Field label="ስልክ ቁጥር" htmlFor="phone" error={form.formState.errors.phone?.message}>
              <Input id="phone" type="tel" placeholder="09…" autoComplete="tel" {...form.register('phone')} />
            </Field>
          </div>
          <Field label="የመልእክት ርዕስ" htmlFor="subject_am" required error={form.formState.errors.subject_am?.message}>
            <Input id="subject_am" invalid={Boolean(form.formState.errors.subject_am)} {...form.register('subject_am')} />
          </Field>
          <Field label="መልእክት" htmlFor="message_am" required error={form.formState.errors.message_am?.message} hint="በዝንትነት መልእክትዎን ይጻፉ (10 ቢያንስ ቁፍሪ)።">
            <Textarea id="message_am" rows={6} invalid={Boolean(form.formState.errors.message_am)} {...form.register('message_am')} />
          </Field>
          <div>
            <SubmitButton busy={busy} label="መልእክት ላክ" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function ContactPage() {
  return (
    <>
      <Seo title="አድራሻና ግንኙነት" description="የቀርሳ ፈለገ ብርሐን ቅድስት ልደታ ለማርያምና አቡነ ገብርኤል መንፈስ ቅዱስ ቤተ ክርስቲያን አድራሻ" />
      <PageHeader title="አድራሻና ግንኙነት" description="ጥያቄ፣ አስተያየት ወይም መረጃ ለቤተ ክርስቲያኑ መስመር ይላኩ።" eyebrow="ግንኙነት" />
      <SiteSection>
        <FormIntro>መልእክትዎ ወደ ቤተ ክርስቲያኑ የግንኙነት ክፍል ይደርሳል፤ በቅርቡ ምላሽ ይሰጥዎታል።</FormIntro>
        <ContactForm />
      </SiteSection>
    </>
  );
}

// ─── ጸሎት · prayer ───────────────────────────────────────────────────────────
const prayerSchema = z.object({
  name_am: amText('ስም', { min: 2, max: 120, required: false }),
  contact: z.union([ethPhone('የግንኙነት መረጃ'), ethEmail('የግንኙነት መረጃ')]),
  category: z.string().trim().optional(),
  for_whom: amText('ለማን', { min: 1, max: 120, required: false }),
  request_am: amText('የጸሎት ጥያቄ', { min: 10, max: 3000 }),
  is_public: z.union([z.literal('true'), z.literal('false'), z.literal('')]).optional(),
});
type PrayerValues = z.infer<typeof prayerSchema>;

export function PrayerForm() {
  const { failure, receipt, busy, run, reset } = usePublicSubmit();
  const form = useForm<PrayerValues>({ resolver: zodResolver(prayerSchema), mode: 'onSubmit' });

  if (receipt) {
    return (
      <Card className="max-w-xl">
        <CardBody>
          <Notice kind="success">{String(receipt.message_am ?? 'የጸሎት ጥያቄዎ ተቀብሏል።')}</Notice>
          <Button variant="ghost" size="sm" onClick={reset}>
            ሌላ ጸሎት ይላኩ
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="max-w-xl">
      <CardBody>
        {failure ? <Notice kind="error">{failure}</Notice> : null}
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((values) => {
            const { is_public: isPublic, ...rest } = values;
            return run(() => callFn('submit_prayer_request', { p: { ...rest, is_public: isPublic === 'true' } }));
          })}
        >
          <Field label="ስም" htmlFor="name_am" error={form.formState.errors.name_am?.message} hint="ይፈልጉ ከሆነ በስምዎ ይሁኑ።">
            <Input id="name_am" autoComplete="name" {...form.register('name_am')} />
          </Field>
          <Field label="ምድብ" htmlFor="category" error={form.formState.errors.category?.message}>
            <Select id="category" options={PRAYER_CATEGORIES} {...form.register('category')} />
          </Field>
          <Field label="ስልክ ወይም ኢሜይል" htmlFor="contact" error={form.formState.errors.contact?.message} hint="ለምላሽ ካስፈለገ ብቻ።">
            <Input id="contact" {...form.register('contact')} />
          </Field>
          <Field label="ለማን እንደሆነ" htmlFor="for_whom" error={form.formState.errors.for_whom?.message}>
            <Input id="for_whom" placeholder="ለራስዎ፣ ለቤተ ሰብ፣ ለሐዋሴ…" {...form.register('for_whom')} />
          </Field>
          <Field label="የጸሎት ጥያቄ" htmlFor="request_am" required error={form.formState.errors.request_am?.message} className="sm:col-span-2">
            <Textarea id="request_am" rows={6} invalid={Boolean(form.formState.errors.request_am)} {...form.register('request_am')} />
          </Field>
          <Field label="ጥያቄው ለሁሉም ይታይ?" htmlFor="is_public" className="sm:col-span-2" hint="‘አዎ’ ካሉ በድረ ገጹ ላይ ሊታይ ይችላል።">
            <Select id="is_public" options={[{ value: 'false', label: 'አይ — ለሒሳብ ክፍል ብቻ' }, { value: 'true', label: 'አዎ — ግልጽ ይሁን' }]} {...form.register('is_public')} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton busy={busy} label="ጸሎት ይላኩ" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function PrayerPage() {
  return (
    <>
      <Seo title="የጸሎት ጥያቄ" description="የጸሎት ጥያቄዎን ለሰንበት ት/ቤቱ ማህበር ይላኩ" />
      <PageHeader title="የጸሎት ጥያቄ" description="ጥያቄዎ ለሥርዓተ ጸሎትና ለሚመለከተው አገልግሎት ይደርሳል።" eyebrow="ጸሎት" />
      <SiteSection>
        <FormIntro>ሁሉም ጸሎት በሚመለከተው አገልግሎት ይከታተላል፤ ለሒሳብ ክፍል ብቻ የሆኑት ለሌላው አይጋሩም።</FormIntro>
        <PrayerForm />
      </SiteSection>
    </>
  );
}

// ─── ልገሳ · donation ─────────────────────────────────────────────────────────
const donationSchema = z.object({
  donor_name_am: amText('ስም', { min: 2, max: 120 }),
  donor_name_en: amText('ስም (እንግሊዝኛ)', { min: 2, max: 120, required: false }),
  phone: ethPhone('ስልክ ቁጥር'),
  email: ethEmail('ኢሜይል አድራሻ'),
  amount: amountField('የመባጀት መጠን', { min: 1, max: 10_000_000 }),
  campaign_id: z.string().trim().optional(),
  method: z.string().trim().optional(),
  in_honour_of: amText('በስም / በሐሳብ', { min: 1, max: 200, required: false }),
  purpose_am: amText('ዓላማ', { min: 1, max: 300, required: false }),
  notes: amText('ማስታወሻ', { min: 1, max: 500, required: false }),
});
type DonationValues = z.infer<typeof donationSchema>;

export function DonationForm() {
  const { failure, receipt, busy, run, reset } = usePublicSubmit();
  const form = useForm<DonationValues>({ resolver: zodResolver(donationSchema), mode: 'onSubmit' });
  const campaigns = useRows<ViewRow<'v_public_campaigns'>>('v_public_campaigns', { order: 'starts_on' }, 'donate-campaigns');
  const campaignOptions: Option[] = [
    { value: '', label: '— ያለ (አጠቃላይ ልገሳ) —' },
    ...(campaigns.data ?? []).map((row) => ({ value: String(row.id), label: row.name_am ?? '' })),
  ];

  if (receipt) {
    return (
      <Card className="max-w-xl">
        <CardBody className="space-y-3">
          <Notice kind="success">
            <p>{String(receipt.message_am ?? 'የመባጀት ሐሳብዎ ተቀብሏል።')}</p>
            {receipt.receipt_no ? (
              <p className="mt-2 font-medium">
                የደረሰኝ ቁጥር፦ <span className="font-mono">{String(receipt.receipt_no)}</span>
              </p>
            ) : null}
          </Notice>
          <p className="text-sm text-muted-foreground">ገንዘቡ በቤተ ክርስቲያኑ ዕጅት ሲደርስ በሒሳብ መጻሕፍቱ ይመዘገባል።</p>
          <Button variant="ghost" size="sm" onClick={reset}>
            ሌላ መባጀት ይሙሉ
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardBody>
        {!isSupabaseConfigured ? <ErrorNote className="mb-4" message="ድረ ገጹ ገና ከመረጃ ማዕከል ጋር አልተገናኘም — መባጀት መላክ አይችልም።" /> : null}
        {failure ? <Notice kind="error">{failure}</Notice> : null}
        <form
          className="grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={form.handleSubmit((values) => run(() => callFn('submit_donation', { p: values })))}
        >
          <Field label="ስም" htmlFor="donor_name_am" required error={form.formState.errors.donor_name_am?.message}>
            <Input id="donor_name_am" autoComplete="name" invalid={Boolean(form.formState.errors.donor_name_am)} {...form.register('donor_name_am')} />
          </Field>
          <Field label="መጠን (ብር)" htmlFor="amount" required error={form.formState.errors.amount?.message} hint="ከ1 ብር እስከ 10,000,000 ብር።">
            <Input id="amount" inputMode="decimal" placeholder="0.00" invalid={Boolean(form.formState.errors.amount)} {...form.register('amount')} />
          </Field>
          <Field label="ስልክ ቁጥር" htmlFor="phone" error={form.formState.errors.phone?.message}>
            <Input id="phone" type="tel" placeholder="09…" {...form.register('phone')} />
          </Field>
          <Field label="ኢሜይል አድራሻ" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" {...form.register('email')} />
          </Field>
          <Field label="ለየትኛው ዘመቻ" htmlFor="campaign_id" error={form.formState.errors.campaign_id?.message} className="sm:col-span-2">
            <Select id="campaign_id" options={campaignOptions} {...form.register('campaign_id')} />
          </Field>
          <Field label="ዘዴ" htmlFor="method" error={form.formState.errors.method?.message}>
            <Select id="method" options={DONATION_METHODS} {...form.register('method')} />
          </Field>
          <Field label="በስም / በሐሳብ" htmlFor="in_honour_of" error={form.formState.errors.in_honour_of?.message}>
            <Input id="in_honour_of" placeholder="ለተሻመነ አባትና ነፍስ ወ/ሮ…" {...form.register('in_honour_of')} />
          </Field>
          <Field label="ዓላማ" htmlFor="purpose_am" error={form.formState.errors.purpose_am?.message} className="sm:col-span-2">
            <Input id="purpose_am" placeholder="ለመማህራን ድጋፍ፣ ለመጻሕፍት፣ ለጽላ…" {...form.register('purpose_am')} />
          </Field>
          <Field label="ማስታወሻ" htmlFor="notes" error={form.formState.errors.notes?.message} className="sm:col-span-2">
            <Textarea id="notes" rows={3} {...form.register('notes')} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton busy={busy} label="መባጀቴን ላክ" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function DonatePage() {
  return (
    <>
      <Seo title="ለጋሽ" description="ለተክለቴዎፍሎስ ሰንበት ት/ቤት ዕጥየ ሒሳብና ለትምህርት ሥራ ይደግፉ" />
      <PageHeader title="ለጋሽ" description="የቤተ ክርስቲያኑን አገልግሎትና የሰንበት ትምህርት ሥራ በልገሳ ይደግፉ።" eyebrow="ልገሳ" />
      <SiteSection>
        <FormIntro>
          በድረ ገጹ የሚደረግ መባጀት ቅድመ ሐሳብ ነው፤ ገንዘቡ በእጅ ወይም በባንክ ሲደርስ በሒሳብ መጻሕፍቱ ተመዝግቦ ደረሰኝ ይከፈታል።
        </FormIntro>
        <DonationForm />
      </SiteSection>
    </>
  );
}

// ─── የመረጃ ማሳወቂያ · newsletter ──────────────────────────────────────────────
const newsletterSchema = z.object({
  email: ethEmail('ኢሜይል አድራሻ', { required: true }),
  name_am: amText('ስም', { min: 2, max: 120, required: false }),
  phone: ethPhone('ስልክ ቁጥር'),
});
type NewsletterValues = z.infer<typeof newsletterSchema>;

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const { failure, receipt, busy, run, reset } = usePublicSubmit();
  const form = useForm<NewsletterValues>({ resolver: zodResolver(newsletterSchema), mode: 'onSubmit' });

  if (receipt) {
    return (
      <div className={compact ? '' : 'max-w-xl'}>
        <Notice kind="success">{String(receipt.message_am ?? 'ለመረጃ ማሳወቂያ ተመዝግበዋል።')}</Notice>
        {!compact ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            ሌላ አድራሻ ይመዝገቡ
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Card className={compact ? undefined : 'max-w-xl'}>
      <CardBody>
        {failure ? <Notice kind="error">{failure}</Notice> : null}
        <form
          className={compact ? 'flex flex-wrap items-end gap-2' : 'grid gap-4 sm:grid-cols-2'}
          noValidate
          onSubmit={form.handleSubmit((values) =>
            run(() =>
              callFn('subscribe_newsletter', {
                p_email: values.email,
                p_name_am: values.name_am || undefined,
                p_phone: values.phone || undefined,
              })
            )
          )}
        >
          <Field label="ኢሜይል አድራሻ" htmlFor="nl-email" required error={form.formState.errors.email?.message} className={compact ? 'min-w-52 flex-1' : ''}>
            <Input id="nl-email" type="email" placeholder="you@example.com" invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
          </Field>
          {!compact ? (
            <>
              <Field label="ስም" htmlFor="nl-name" error={form.formState.errors.name_am?.message}>
                <Input id="nl-name" autoComplete="name" {...form.register('name_am')} />
              </Field>
              <Field label="ስልክ ቁጥር" htmlFor="nl-phone" error={form.formState.errors.phone?.message} className="sm:col-span-2">
                <Input id="nl-phone" type="tel" placeholder="09…" {...form.register('phone')} />
              </Field>
            </>
          ) : null}
          <Button type="submit" size={compact ? 'sm' : undefined} loading={busy} disabled={!isSupabaseConfigured}>
            ተመዝገብ
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ─── የፕሮግራም ምዝገባ · event registration ────────────────────────────────────
const eventRegSchema = z.object({
  full_name_am: amText('ሙሉ ስም', { min: 2, max: 120 }),
  phone: ethPhone('ስልክ ቁጥር', { required: true }),
  email: ethEmail('ኢሜይል አድራሻ'),
  parish: amText('የመንፈስ ቅዱስ ጉባኤ', { min: 2, max: 200, required: false }),
  participants: z
    .union([z.string(), z.number()])
    .transform((v) => Number(String(v)))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 50, { message: 'ተካፋይ ብዛት ከ1 እስከ 50 መሆን አለበት' }),
  notes: amText('ማስታወሻ', { min: 1, max: 500, required: false }),
});
type EventRegValues = z.infer<typeof eventRegSchema>;

export function EventRegistrationForm({ eventId }: { eventId: string }) {
  const { failure, receipt, busy, run, reset } = usePublicSubmit();
  const form = useForm<EventRegValues>({ resolver: zodResolver(eventRegSchema), mode: 'onSubmit' });

  if (receipt) {
    return (
      <Card className="max-w-lg">
        <CardBody className="space-y-2">
          <Notice kind="success">{String(receipt.message_am ?? 'ለፕሮግራሙ ተመዝግበዋል።')}</Notice>
          <Button variant="ghost" size="sm" onClick={reset}>
            ለሌላ ሰው ይመዝገቡ
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg">
      <CardBody>
        <p className="mb-4 font-display text-base font-semibold">ለፕሮግራሙ ተሳተፍ</p>
        {failure ? <Notice kind="error">{failure}</Notice> : null}
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit((values) => run(() => callFn('register_for_event', { p_event_id: eventId, p: values })))}
        >
          <Field label="ሙሉ ስም" htmlFor="full_name_am" required error={form.formState.errors.full_name_am?.message}>
            <Input id="full_name_am" autoComplete="name" invalid={Boolean(form.formState.errors.full_name_am)} {...form.register('full_name_am')} />
          </Field>
          <Field label="ስልክ ቁጥር" htmlFor="phone" required error={form.formState.errors.phone?.message}>
            <Input id="phone" type="tel" placeholder="09…" autoComplete="tel" invalid={Boolean(form.formState.errors.phone)} {...form.register('phone')} />
          </Field>
          <Field label="ኢሜይል አድራሻ" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" {...form.register('email')} />
          </Field>
          <Field label="የመንፈስ ቅዱስ ጉባኤ" htmlFor="parish" error={form.formState.errors.parish?.message}>
            <Input id="parish" {...form.register('parish')} />
          </Field>
          <Field label="ተካፋይ ብዛት" htmlFor="participants" required error={form.formState.errors.participants?.message}>
            <Input id="participants" type="number" min={1} max={50} defaultValue={1} invalid={Boolean(form.formState.errors.participants)} {...form.register('participants')} />
          </Field>
          <Field label="ማስታወሻ" htmlFor="reg-notes" error={form.formState.errors.notes?.message}>
            <Textarea id="reg-notes" rows={3} {...form.register('notes')} />
          </Field>
          <div>
            <SubmitButton busy={busy} label="ምዝገባ አጠናቅቅ" />
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
