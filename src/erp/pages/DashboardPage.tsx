// The first screen after the door: what is true today, and what is waiting.
//
// Every number comes from `dashboard_kpis()` or a real table read; nothing here is
// a static illustration. Money only appears for people who may see money, and the
// approval queue only lists rows this person's role can actually decide.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck, HandCoins, Users } from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorNote, Metric, Spinner, StatusBadge } from '@/components/ui/surface';
import { br, dateBoth, dateTimeAm, pct } from '@/lib/format';
import { UI } from '@/lib/i18n';
import { isSupabaseConfigured } from '@/lib/env';
import { fetchKpis, kpiNumber, kpiText, type Kpis } from '@/lib/kpis';
import { callFn, type DbSchema } from '@/lib/supabase';
import { devotionFor, devotionSummary } from '@/lib/liturgical';
import { formatEthiopian } from '@/lib/ethiopian';
import { ROLE_LABELS } from '@/types/permissions';

type Approval = DbSchema['Functions']['pending_approvals']['Returns'][number];

export function DashboardPage() {
  const { identity, can } = useAuth();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [approvals, setApprovals] = useState<Approval[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) return;
    setBusy(true);
    setError(null);
    try {
      setKpis(await fetchKpis());
      if (can('finance.approve', 'budget.approve', 'results.release')) {
        setApprovals(await callFn('pending_approvals', {}));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }, [identity, can]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = new Date();
  const devotion = devotionFor(today);
  const currency = kpis ? kpiText(kpis, 'currency', 'ETB') : 'ETB';

  if (!isSupabaseConfigured) {
    return <ErrorNote message="የዳሽቦርዱ መረጃ ለመቅረጥ መረጃዎቹ ገና አልተገናኙም።" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold">እንኳን ደህና መጡ፣ {identity?.nameAm}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatEthiopian(today)} · {dateBoth(today)}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <CalendarCheck className="h-4 w-4 text-leaf" aria-hidden />
              {devotionSummary(today)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {devotion.fast ? <StatusBadge tone="warning">{devotion.fast.nameAm}</StatusBadge> : null}
            {devotion.feasts[0] ? <StatusBadge tone="gold">{devotion.feasts[0].nameAm}</StatusBadge> : null}
            <Button variant="outline" size="sm" onClick={() => void load()} loading={busy}>
              እንደገና ልክ
            </Button>
          </div>
        </CardBody>
      </Card>

      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      {!kpis && !error ? <Spinner label="መለኪያዎች በመጫን ላይ…" /> : null}

      {kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={UI.appName} value={kpiNumber(kpis, 'students_active')} hint="ንቁ ተማሪዎች" />
          <Metric label="መምህራን" value={kpiNumber(kpis, 'teachers_active')} hint="የሚያስተምሩ" />
          <Metric label="ክፍሎች" value={kpiNumber(kpis, 'classes_active')} hint="የሚሰሩ" />
          <Metric label={UI.pendingApprovals} value={kpiNumber(kpis, 'approvals_pending')} tone={kpiNumber(kpis, 'approvals_pending') > 0 ? 'warning' : 'neutral'} hint="የሚጠብቁ" />
          <Metric label="ዜናዎች" value={kpiNumber(kpis, 'content_published')} hint={`${kpiNumber(kpis, 'content_drafts')} ቅድመ ሐሳብ`} />
          <Metric label="ፕሮግራሞች" value={kpiNumber(kpis, 'events_upcoming')} hint="የሚመጡ" />
          <Metric label="አዲስ መልእክት" value={kpiNumber(kpis, 'unread_messages')} tone={kpiNumber(kpis, 'unread_messages') > 0 ? 'info' : 'neutral'} hint="ያልተነበቡ" />
          <Metric label="የመገኘት መጠን" value={pct(kpiNumber(kpis, 'attendance_rate'))} hint="ባሉ 60 ቀናት" />
        </div>
      ) : null}

      {kpis && can('finance.read') ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="የወር ገቢ" value={br(kpiNumber(kpis, 'income_month'), { cents: false })} hint={`በ${currency}`} tone="success" />
          <Metric label="የወር ወጪ" value={br(kpiNumber(kpis, 'expense_month'), { cents: false })} hint={`በ${currency}`} tone="danger" />
          <Metric label="የወር ልገሳ" value={br(kpiNumber(kpis, 'donations_month'), { cents: false })} hint={`በ${currency}`} tone="gold" />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-gold-deep" aria-hidden />
              {UI.pendingApprovals}
            </CardTitle>
          </CardHeader>
          <CardBody>
            {!can('finance.approve', 'budget.approve', 'results.release') ? (
              <p className="text-sm text-muted-foreground">የማጽደቅ መብት የላይኝም፤ የራስዎ ገጽ ዝርዝሩን ያሳይዎታል።</p>
            ) : approvals === null ? (
              <Spinner />
            ) : approvals.length === 0 ? (
              <EmptyState icon={<AlertTriangle className="h-7 w-7" aria-hidden />} title="የሚጠብቅ ነገር የለም" description="ሁሉም ሥራዎች ጸድቀዋል።" />
            ) : (
              <ul className="space-y-2">
                {approvals.slice(0, 8).map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{row.entity_label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {row.submitter_name} · {dateTimeAm(row.submitted_at)}
                      </span>
                    </span>
                    <StatusBadge tone={row.amount && Number(row.amount) > 0 ? 'gold' : 'info'}>{row.action}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
            {approvals && approvals.length > 0 ? (
              <div className="mt-4">
                <Button asChild variant="outline" size="sm">
                  <Link to="/erp/system/approvals">ሁሉንም ይመልከቱ</Link>
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-leaf" aria-hidden />
              ወዴት ልሄድ እፈልጋለሁ
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {identity?.roles.length ? (
                identity.roles.map((role) => (
                  <StatusBadge key={role} tone="neutral">
                    {ROLE_LABELS[role]}
                  </StatusBadge>
                ))
              ) : (
                <StatusBadge tone="danger">ደረጃ አልተሰጠም</StatusBadge>
              )}
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {can('students.read') ? (
                <li>
                  <Link className="text-leaf underline underline-offset-2" to="/erp/students/applications">
                    ማመልከቻዎችን መርምር
                  </Link>
                </li>
              ) : null}
              {can('attendance.mark') ? (
                <li>
                  <Link className="text-leaf underline underline-offset-2" to="/erp/attendance/mark">
                    የዛሬ መገኘት መመዝገብ
                  </Link>
                </li>
              ) : null}
              {can('news.write', 'website.write') ? (
                <li>
                  <Link className="text-leaf underline underline-offset-2" to="/erp/website/news">
                    ዜና ማዘጋጀት
                  </Link>
                </li>
              ) : null}
              <li>
                <Link className="text-leaf underline underline-offset-2" to="/">
                  ይዘቱን በድረ ገጹ ማየት
                </Link>
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
