// The four screens between "no session" and "in the ERP".
//
// Sign-in, the forgotten-password mail, the reset form that mail links to, and
// the page a person lands on when they are signed in but not allowed. Each one
// keeps the Amharic voice of the rest of the platform and refuses to pretend: if
// `.env` has no project wired up, the form says so instead of failing mysteriously.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, LogIn, MailCheck } from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Spinner } from '@/components/ui/surface';
import { Field, Input } from '@/components/ui/form';
import { requestPasswordReset, signIn, updatePassword } from '@/lib/auth';
import { env, isSupabaseConfigured, missingConfigHint } from '@/lib/env';
import { FORGOT_PATH, LOGIN_PATH, RESET_PATH } from '@/lib/routes';
import { ethEmail, passwordField, passwordPair } from '@/lib/validation';
import { UI } from '@/lib/i18n';

const loginSchema = z.object({ email: ethEmail('ኢሜይል አድራሻ', { required: true }), password: passwordField() });
type LoginValues = z.infer<typeof loginSchema>;

const resetSchema = passwordPair();
type ResetValues = z.infer<typeof resetSchema>;

function AuthFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <div className="border-b border-border px-6 py-5 text-center">
          <p className="font-display text-lg font-semibold">{env.appName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{UI.churchName}</p>
          <h1 className="mt-4 font-display text-xl font-semibold">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="px-6 py-5">{children}</div>
      </Card>
    </div>
  );
}

export function LoginPage() {
  const { status, home, identity, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = new URLSearchParams(location.search).get('from');
  const destination = target && target.startsWith('/erp') ? decodeURIComponent(target) : home;

  const form = useForm<LoginValues>({ resolver: zodResolver(loginSchema), mode: 'onSubmit' });

  useEffect(() => {
    if (status === 'ready' && identity) navigate(destination, { replace: true });
  }, [status, identity, destination, navigate]);

  async function onSubmit(values: LoginValues) {
    setFailure(null);
    setBusy(true);
    const { error } = await signIn(values.email, values.password);
    setBusy(false);
    if (error) {
      setFailure(error);
      return;
    }
    await refresh();
  }

  return (
    <AuthFrame title="ወደ አሠራር ገባ" description="የቤተ ክርስቲያኑን ሥራ የሚያስተዳድሩና የሚከታተሉ ሰዎች የራሳቸውን መገለጫ ይክፈቱ።">
      {!isSupabaseConfigured ? <ErrorNote className="mb-4" message={missingConfigHint} /> : null}
      {failure ? <ErrorNote className="mb-4" message={failure} /> : null}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="ኢሜይል አድራሻ" htmlFor="email" required error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="username" placeholder="you@example.com" invalid={Boolean(form.formState.errors.email)} {...form.register('email')} />
        </Field>

        <Field label="የይለፍ ቃል" htmlFor="password" required error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
        </Field>

        <Button type="submit" className="w-full" loading={busy} disabled={!isSupabaseConfigured} icon={<LogIn className="h-4 w-4" aria-hidden />}>
          {UI.signIn}
        </Button>

        <div className="text-center text-sm">
          <Link to={FORGOT_PATH} className="text-leaf underline underline-offset-2">
            የይለፍ ቃሌን ረስቻለሁ
          </Link>
        </div>
      </form>

      <div className="mt-5 border-t border-border pt-4 text-center text-sm text-muted-foreground">
        <Link to="/" className="underline underline-offset-2">
          ወደ ድረ ገጹ ተመለስ
        </Link>
      </div>
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const invalid = value.trim().length > 0 && !ethEmail().safeParse(value).success;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!ethEmail('ኢሜይል አድራሻ', { required: true }).safeParse(value).success) {
      setError('እባክዎ ትክክለኛ የኢሜይል አድራሻ ያስገቡ።');
      return;
    }
    setBusy(true);
    const result = await requestPasswordReset(value);
    setBusy(false);
    if (result.error) setError(result.error);
    else setSent(true);
  }

  return (
    <AuthFrame title="የይለፍ ቃል ማስተካከያ" description="አድራሻዎን ከገ቙ት በኋላ ማረጋገጫ አገናኙን በኢሜይል እንልክልዎታለን።">
      {!isSupabaseConfigured ? <ErrorNote className="mb-4" message={missingConfigHint} /> : null}
      {error ? <ErrorNote className="mb-4" message={error} /> : null}

      {sent ? (
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto h-8 w-8 text-leaf" aria-hidden />
          <p className="text-sm">
            መልእክት ተልኳል። ከኢሜይልዎ ውስጥ ባገናኙ የይለፍ ቃል ማረጋገጫ ወደ <span className="font-medium">{RESET_PATH}</span> ይሄዱ።
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to={LOGIN_PATH}>{UI.back}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="ኢሜይል አድራሻ" htmlFor="reset-email" required error={invalid ? 'የኢሜይል አድራሻው ትክክለኛ አይመስልም' : undefined}>
            <Input id="reset-email" type="email" value={value} onChange={(e) => setValue(e.target.value)} invalid={invalid} autoComplete="username" placeholder="you@example.com" />
          </Field>
          <Button type="submit" className="w-full" loading={busy} disabled={!isSupabaseConfigured} icon={<KeyRound className="h-4 w-4" aria-hidden />}>
            ማረጋገጫ ልክ
          </Button>
          <div className="text-center text-sm">
            <Link to={LOGIN_PATH} className="text-leaf underline underline-offset-2">
              {UI.back}
            </Link>
          </div>
        </form>
      )}
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  const { status, identity, home } = useAuth();
  // Supabase's own client finishes the recovery link when the app loads.
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  const form = useForm<ResetValues>({ resolver: zodResolver(resetSchema), mode: 'onSubmit' });

  async function onSubmit(values: ResetValues) {
    const { error } = await updatePassword(values.password);
    if (error) {
      form.setError('password', { message: error });
      return;
    }
    setDone(true);
    setTimeout(() => navigate(home, { replace: true }), 1200);
  }

  if (status === 'loading') {
    return (
      <AuthFrame title="የይለፍ ቃል አድስ">
        <Spinner label={UI.loading} />
      </AuthFrame>
    );
  }

  if (status !== 'ready' || !identity) {
    return (
      <AuthFrame title="የይለፍ ቃል አድስ">
        <ErrorNote message="ማረጋገጫ አገናኙ ግልጽ ሆኖ አልተገኘም። ከኢሜይልዎ ውስጥ ያለውን አገናኝ ዳግም ይክፈቱ።" />
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link to={FORGOT_PATH}>አዲስ መልእክት ጠይቅ</Link>
        </Button>
      </AuthFrame>
    );
  }

  if (done) {
    return (
      <AuthFrame title="የይለፍ ቃል ተቀይሯል">
        <p className="text-sm text-muted-foreground">ወደ ዋና ገጽዎ በመሄድ ላይ…</p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="አዲስ የይለፍ ቃል ይምረጡ" description={`ለ ${identity.nameAm} · ቢያንስ 6 ፊደላት`}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="አዲስ የይለፍ ቃል" htmlFor="password" required error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" invalid={Boolean(form.formState.errors.password)} {...form.register('password')} />
        </Field>
        <Field label="አዲሱን የይለፍ ቃል ደግመው ይጻፉ" htmlFor="confirm" required error={form.formState.errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" invalid={Boolean(form.formState.errors.confirm)} {...form.register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          {UI.save}
        </Button>
      </form>
    </AuthFrame>
  );
}

export function NoAccessPage() {
  const { identity, home, signOut } = useAuth();
  if (!identity) return <Navigate to={LOGIN_PATH} replace />;

  return (
    <AuthFrame title="መብት የላይኝም" description={`${identity.nameAm} · ${identity.roles.join('፣ ') || 'ደረጃ የለም'}`}>
      <p className="text-sm text-muted-foreground">
        ይህንን ገጽ ለማየት የሚያስፈልገው ፍቃድ በመገለጫዎ ላይ የለም። የቤተ ክርስቲያኑ ዋና አስተዳዳሪ ደረጃዎን ማስተካከል ይችላል።
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to={home}>{UI.dashboard}</Link>
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          {UI.signOut}
        </Button>
      </div>
    </AuthFrame>
  );
}
