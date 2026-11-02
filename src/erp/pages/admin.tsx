// The three screens that administer the platform itself: who exists, what they
// may do, and how the office takes a copy of the data with it.
//
// The RBAC tables are the interesting part, because the browser is not the
// authority on them:
//   · `profiles`   — readable with `system.read`, writable with `system.write`
//   · `roles`, `user_roles`, `role_permissions` — readable with `system.read`,
//     but migration 140 only lets `is_super_admin()` write them
// so every control here is gated twice: the grant the sidebar uses, and the role
// the database will actually accept. A person with `system.write` who is not a
// super admin sees the list and an explanation instead of a button that can only
// fail. `has_permission()` also returns true for super_admin without looking at
// `role_permissions`, so that row is marked as implied rather than trusted.
//
// Two things the schema genuinely cannot do from a browser are therefore printed
// as instructions rather than faked as controls: creating an auth account (only
// `bootstrap_super_admin(p_email)`, which is service-role-only) and scheduling a
// physical database backup (Supabase dashboard, not the app).
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardCopy, Download, FileJson, RefreshCw, ScrollText, Search, ShieldCheck, Table2, Trash2, UserPlus, X } from 'lucide-react';

import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/ui/overlay';
import { Avatar, ProgressBar } from '@/components/ui/tabs';
import { Card, CardBody, CardDescription, CardHeader, CardTitle, EmptyState, ErrorNote, PageHeading, StatusBadge } from '@/components/ui/surface';
import { MEMBER_STATUS, MODULE_NAMES, UI } from '@/lib/i18n';
import { dateAm, dateTimeAm, num, phoneAm, truncate } from '@/lib/format';
import { downloadTextFile, exportCsv, exportExcel, type ExportColumn } from '@/lib/export';
import { isSupabaseConfigured } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { ALL_PERMISSION_KEYS, labelOf, moduleOf, type PermissionKey } from '@/lib/permissions';
import { fetchRows, listRows, storagePublicUrl, supabase, type Row } from '@/lib/supabase';

// ─── shared reads ────────────────────────────────────────────────────────────

/** `roles` plus `user_roles` — every holder count and every badge is derived from these two. */
async function readRbacTables(): Promise<{ roles: Row<'roles'>[]; userRoles: Row<'user_roles'>[] }> {
  const [roles, userRoles] = await Promise.all([
    listRows(supabase.from('roles').select('*').order('key', { ascending: true }).limit(200)),
    listRows(supabase.from('user_roles').select('*').limit(5000)),
  ]);
  return { roles: roles as unknown as Row<'roles'>[], userRoles: userRoles as unknown as Row<'user_roles'>[] };
}

/**
 * The two gates a writer of these tables needs. `mayWrite` is what the database
 * will accept; `needsSuperAdmin` is the sentence shown when the grant is held but
 * the role is not.
 */
function useAdminAccess() {
  const { identity, can, refresh } = useAuth();
  const isSuper = Boolean(identity?.roles.includes('super_admin'));
  return {
    isSuper,
    mayRead: can('system.read'),
    mayWrite: can('system.write') && isSuper,
    needsSuperAdmin: can('system.write') && !isSuper,
    refresh,
  };
}

/** A SQL fragment with a copy button — the only executable thing an instruction can be. */
function SqlBlock({ label, sql }: { label: string; sql: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      toast.success('ቅንብሩ ተቀድቷል።');
    } catch {
      toast.error('መቅዳት አልተሳካም፤ ጽሑፉን በእጅ ይውሰዱ።');
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="relative rounded-md border border-border bg-muted/60 p-3">
        <pre className="overflow-x-auto whitespace-pre pe-10 font-mono text-xs leading-relaxed" dir="ltr">{sql}</pre>
        <Button variant="ghost" size="sm" className="absolute end-1.5 top-1.5" onClick={() => void copy()} icon={<ClipboardCopy className="h-3.5 w-3.5" aria-hidden />}>
          ቅዳ
        </Button>
      </div>
    </div>
  );
}

// ─── 1 · the staff directory ─────────────────────────────────────────────────

export function UsersScreen() {
  const { identity } = useAuth();
  const { mayRead, mayWrite, needsSuperAdmin, refresh } = useAdminAccess();

  const [profiles, setProfiles] = useState<Row<'profiles'>[]>([]);
  const [roles, setRoles] = useState<Row<'roles'>[]>([]);
  const [userRoles, setUserRoles] = useState<Row<'user_roles'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [selected, setSelected] = useState<Row<'profiles'> | null>(null);
  const [draft, setDraft] = useState({ full_name_am: '', phone: '', member_status: '', is_active: false });
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<{ user: Row<'profiles'>; role: Row<'roles'> } | null>(null);
  const [showProvisioning, setShowProvisioning] = useState(false);

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    if (!mayRead) {
      setLoading(false);
      setError(UI.permissionDenied);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500);
      if (term.trim()) {
        const like = `%${term.trim().replace(/[%_]/g, '')}%`;
        query = query.or(`full_name_am.ilike.${like},full_name_en.ilike.${like},email.ilike.${like},phone.ilike.${like},parish.ilike.${like}`);
      }
      const [rows, rbac] = await Promise.all([listRows(query), readRbacTables()]);
      setProfiles(rows as unknown as Row<'profiles'>[]);
      setRoles(rbac.roles);
      setUserRoles(rbac.userRoles);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [identity, mayRead, term]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), term ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, term]);

  /** How many people hold each role — the same rows the badges are built from. */
  const holders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const grant of userRoles) counts.set(grant.role_id, (counts.get(grant.role_id) ?? 0) + 1);
    return counts;
  }, [userRoles]);

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const rolesByUser = useMemo(() => {
    const map = new Map<string, Row<'roles'>[]>();
    for (const grant of userRoles) {
      const role = roleById.get(grant.role_id);
      if (!role) continue;
      const list = map.get(grant.user_id) ?? [];
      list.push(role);
      map.set(grant.user_id, list);
    }
    return map;
  }, [userRoles, roleById]);

  const visible = useMemo(
    () => (roleFilter ? profiles.filter((p) => (rolesByUser.get(p.id) ?? []).some((r) => r.id === roleFilter)) : profiles),
    [profiles, roleFilter, rolesByUser]
  );

  function open(row: Row<'profiles'>) {
    setSelected(row);
    setDraft({ full_name_am: row.full_name_am ?? '', phone: row.phone ?? '', member_status: row.member_status, is_active: row.is_active });
  }

  /** The `scope` a grant carries — shown before revoking so a scoped grant is not deleted blind. */
  function scopeOf(userId: string | undefined, roleId: string | undefined): string {
    if (!userId || !roleId) return '';
    const grant = userRoles.find((g) => g.user_id === userId && g.role_id === roleId);
    const scope = grant?.scope;
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return '';
    return Object.keys(scope).length > 0 ? JSON.stringify(scope) : '';
  }

  /** One `.eq()` per half of the composite primary key `(user_id, role_id)`. */
  async function revokeGrant(user: Row<'profiles'>, role: Row<'roles'>) {
    setBusy(true);
    try {
      const { error: removeError } = await supabase.from('user_roles').delete().eq('user_id', user.id).eq('role_id', role.id);
      if (removeError) throw new Error(friendlyError(removeError));
      toast.success(`${user.full_name_am || 'ተጠቃሚ'} ከ“${role.name_am}” ሚና ተወግዷል።`);
      await load();
      // Their own powers may have just changed, so the sidebar is re-read too.
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
      setRevoking(null);
    }
  }

  async function grantRole(role: Row<'roles'>) {
    if (!selected) return;
    setBusy(true);
    try {
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({ user_id: selected.id, role_id: role.id, scope: {}, granted_by: identity?.userId } as never);
      if (insertError) throw new Error(friendlyError(insertError));
      toast.success(`${selected.full_name_am || 'ተጠቃሚ'} ወደ “${role.name_am}” ሚና ተጨምሯል።`);
      await load();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  /** Only the columns that actually changed are sent, so a saved profile keeps the rest. */
  async function saveProfile() {
    if (!selected) return;
    const payload: Record<string, unknown> = {};
    if (draft.full_name_am.trim() !== (selected.full_name_am ?? '')) payload.full_name_am = draft.full_name_am.trim();
    if (draft.phone.trim() !== (selected.phone ?? '')) payload.phone = draft.phone.trim() || null;
    if (draft.member_status !== selected.member_status) payload.member_status = draft.member_status;
    if (draft.is_active !== selected.is_active) payload.is_active = draft.is_active;
    if (Object.keys(payload).length === 0) {
      toast.info('የተቀየረ ነገር የለም');
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.from('profiles').update(payload as never).eq('id', selected.id);
      if (updateError) throw new Error(friendlyError(updateError));
      toast.success(UI.saved);
      const fresh = await listRows(supabase.from('profiles').select('*').eq('id', selected.id).limit(1));
      const updated = (fresh as unknown as Row<'profiles'>[])[0] ?? selected;
      setSelected(updated);
      setDraft({ full_name_am: updated.full_name_am ?? '', phone: updated.phone ?? '', member_status: updated.member_status, is_active: updated.is_active });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setBusy(false);
    }
  }

  const columns = useMemo<Column<Row<'profiles'>>[]>(
    () => [
      {
        key: 'full_name_am',
        header: 'ተጠቃሚ',
        sortable: true,
        cell: (row) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.full_name_am} src={storagePublicUrl(null, row.avatar_path)} size={32} />
            <div className="min-w-0">
              <p className="font-medium">{row.full_name_am || 'ያላ ስም'}</p>
              <p className="truncate text-xs text-muted-foreground">{row.email ?? '—'}</p>
            </div>
          </div>
        ),
      },
      { key: 'phone', header: 'ስልክ', hideBelow: 'sm', cell: (row) => <span className="whitespace-nowrap">{phoneAm(row.phone)}</span> },
      { key: 'member_status', header: 'የአባልነት ሁኔታ', hideBelow: 'md', cell: (row) => MEMBER_STATUS[row.member_status] ?? row.member_status },
      {
        key: 'is_active',
        header: 'ሥራ',
        cell: (row) => (row.is_active ? <StatusBadge tone="success">ንቁ</StatusBadge> : <StatusBadge tone="danger">ተሰናክሏል</StatusBadge>),
      },
      {
        key: '__roles',
        header: 'ሚናዎች',
        sortable: false,
        cell: (row) => (
          <div className="flex flex-wrap items-center gap-1">
            {(rolesByUser.get(row.id) ?? []).map((role) => (
              <span key={role.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs">
                {role.name_am}
                {mayWrite ? (
                  <button
                    type="button"
                    aria-label={`${role.name_am} አስወግድ`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRevoking({ user: row, role });
                    }}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </span>
            ))}
            {(rolesByUser.get(row.id) ?? []).length === 0 ? <span className="text-xs italic text-muted-foreground">ሚና የለውም</span> : null}
          </div>
        ),
      },
      {
        key: '__open',
        header: UI.details,
        sortable: false,
        cell: (row) => (
          <Button size="sm" variant="outline" onClick={() => open(row)}>
            ዝርዝር
          </Button>
        ),
      },
    ],
    [rolesByUser, mayWrite]
  );

  const held = selected ? (rolesByUser.get(selected.id) ?? []) : [];

  if (!isSupabaseConfigured) return <ErrorNote message="የተጠቃሚዎች መዝገብ ለማቅረጥ መረጃዎቹ ገና አልተገናኙም።" />;

  return (
    <div className="space-y-5">
      <PageHeading
        title="ተጠቃሚዎችና ሚናዎቻቸው"
        description="መገለጫዎች ከመግቢያ ሥርዓቱ (auth.users) በ trigger ይመጣሉ፤ እዚህ የሚቀመጠው ሚና ብቻ ነው — `user_roles` በ (ተጠቃሚ፣ ሚና) ይለያል።"
        actions={
          <>
            {mayRead ? (
              <Button variant="outline" size="sm" onClick={() => setShowProvisioning(true)} icon={<UserPlus className="h-4 w-4" aria-hidden />}>
                አዲስ መግቢያ እንዴት ይከፈት?
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              እንደገና
            </Button>
          </>
        }
      />

      {!mayRead ? <ErrorNote message={UI.permissionDenied} /> : null}
      {needsSuperAdmin ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          “ስርዓተ ኣዘራረብ ማስተዳደር” መብት ቢኖርዎም ይህ ሰንጠረዥ የሚጻፍበት የ <code dir="ltr">super_admin</code> ሚና ብቻ ነው (የደህንነት ሕጉ በማስገበሪያው 140 ውስጥ ተይዟል)፤ ስለዚህ ማስገቢያ ቁልፎች ተደብቀዋል።
        </p>
      ) : null}
      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <Field label={UI.search} htmlFor="usr-term" className="w-72">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="usr-term" className="ps-9" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ስም፣ ኢሜይል፣ ስልክ ወይም ቤተ ክርስቲያን" />
            </div>
          </Field>
          <Field label="በሚና አጣራ" htmlFor="usr-role" className="w-56">
            <Select
              id="usr-role"
              value={roleFilter}
              placeholder={UI.all}
              options={roles.map((r) => ({ value: r.id, label: `${r.name_am} (${num(holders.get(r.id) ?? 0)})` }))}
              onChange={(e) => setRoleFilter(e.target.value)}
            />
          </Field>
          <div className="ms-auto flex flex-wrap items-center gap-2 text-xs">
            <StatusBadge tone="info">{num(visible.length)} በዝርዝሩ</StatusBadge>
            <StatusBadge tone="neutral">{num(roles.length)} ሚናዎች</StatusBadge>
            <StatusBadge tone="success">{num(profiles.filter((p) => p.is_active).length)} ንቁ</StatusBadge>
          </div>
        </CardBody>
      </Card>

      <DataTable
        rows={visible}
        columns={columns}
        rowKey={(row) => row.id}
        loading={loading}
        onRowClick={open}
        pageSize={20}
        emptyTitle={term || roleFilter ? UI.emptySearch : 'ተጠቃሚ የለም'}
        emptyDescription="መግቢያ ከተከፈት መረጃው እዚህ ይታያል፤ አዲስ መግቢያ የሚከፈተው በ Supabase ዳሽቦርድ ብቻ ነው።"
        caption="ተጠቃሚዎች"
      />

      <Modal
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
        size="lg"
        title={selected ? selected.full_name_am || 'ያላ ስም' : UI.details}
        description={selected ? `${selected.email ?? 'ኢሜይል የለውም'} · ${phoneAm(selected.phone)}` : undefined}
        footer={
          mayWrite && selected ? (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                {UI.close}
              </Button>
              <Button variant="outline" onClick={() => void saveProfile()} loading={busy} icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>
                {UI.save}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {UI.close}
            </Button>
          )
        }
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={selected.is_active ? 'success' : 'danger'}>{selected.is_active ? 'ንቁ ተጠቃሚ' : 'ተሰናክሏል'}</StatusBadge>
              <StatusBadge tone="neutral">{MEMBER_STATUS[selected.member_status] ?? selected.member_status}</StatusBadge>
              <StatusBadge tone="info">{(rolesByUser.get(selected.id) ?? []).length} ሚና</StatusBadge>
            </div>

            {mayWrite ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={UI.name} htmlFor="usr-name">
                  <Input id="usr-name" value={draft.full_name_am} onChange={(e) => setDraft({ ...draft, full_name_am: e.target.value })} />
                </Field>
                <Field label="ስልክ" htmlFor="usr-phone">
                  <Input id="usr-phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="09…/07…" />
                </Field>
                <Field label="የአባልነት ሁኔታ" htmlFor="usr-status">
                  <Select
                    id="usr-status"
                    value={draft.member_status}
                    options={Object.entries(MEMBER_STATUS).map(([value, label]) => ({ value, label }))}
                    onChange={(e) => setDraft({ ...draft, member_status: e.target.value })}
                  />
                </Field>
                <div className="flex items-center gap-3 pb-1">
                  <Switch id="usr-active" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                  <label htmlFor="usr-active" className="text-sm">
                    ንቁ ተጠቃሚ
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <p>ስም፦ {selected.full_name_am || '—'}</p>
                <p>ስልክ፦ {phoneAm(selected.phone)}</p>
                <p className="text-xs text-muted-foreground">የመግቢያ መለያ፦ <span dir="ltr" className="font-mono">{selected.id}</span></p>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">ሚናዎች</CardTitle>
                <CardDescription>
                  {mayWrite ? 'ሚና መስጠትና ማስወገድ በቀጥታ በ `user_roles` ሰንጠረዥ ላይ ይጻፋል።' : 'ለመቀየር “ስርዓተ ኣዘራረብ ማስተዳደር” መብትና የ super_admin ሚና ያስፈልጋል።'}
                </CardDescription>
              </CardHeader>
              <CardBody className="space-y-2">
                {roles.map((role) => {
                  const has = held.some((r) => r.id === role.id);
                  return (
                    <div key={role.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {role.name_am}
                          {role.is_system ? <StatusBadge tone="neutral" className="ms-2">የስርዓት ሚና</StatusBadge> : null}
                          {has && scopeOf(selected.id, role.id) ? <StatusBadge tone="warning" className="ms-1">ወሰን አለው</StatusBadge> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground" dir="ltr">{role.key}</p>
                      </div>
                      {has ? (
                        mayWrite ? (
                          <Button size="sm" variant="outline" onClick={() => setRevoking({ user: selected, role })} icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}>
                            {UI.remove}
                          </Button>
                        ) : (
                          <StatusBadge tone="success">ተሰጥቷል</StatusBadge>
                        )
                      ) : mayWrite ? (
                        <Button size="sm" disabled={busy} onClick={() => void grantRole(role)} icon={<UserPlus className="h-3.5 w-3.5" aria-hidden />}>
                          ስጥ
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
                {roles.length === 0 ? <p className="text-sm text-muted-foreground">የተመዘገበ ሚና የለም።</p> : null}
              </CardBody>
            </Card>

            {!mayWrite ? (
              <p className="text-sm text-muted-foreground">
                መረጃ ለማረጋገጥ ብቻ ነው። {needsSuperAdmin ? 'የስርዓት አስተዳደር መብት ባይኖርዎም የ super_admin ሚና ስለሌለዎት ማስገቢያው በዳታቤዙ ይከለክላል።' : '“ስርዓተ ኣዘራረብ ማየት” መብት ያስፈልጋል።'}
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState title={UI.empty} description="ተጠቃሚ ለማየት ከዝርዝሩ ረድፍ ይጫኑ።" />
        )}
      </Modal>

      <ConfirmDialog
        open={revoking !== null}
        busy={busy}
        destructive
        title={`${UI.remove}: ${revoking?.role.name_am ?? ''}`}
        description={
          <>
            {revoking?.user.full_name_am || 'ተጠቃሚ'} ይህ ሚና ካጡ በፍቃዶቹ ይቀንሱታል፤ ሌላ ሚና ከሌላቸው ማስተዳደር አይችሉም። ረድፉ በ <code dir="ltr">(user_id, role_id)</code> ስለሚለይ ሁለቱም ቁልፎች ተጠቅመው ብቻ ይሰረዛል።
            {scopeOf(revoking?.user.id, revoking?.role.id).length > 0 ? (
              <p className="mt-2 text-xs">
                የተሐይረው ወሰን፦ <span dir="ltr" className="font-mono">{scopeOf(revoking?.user.id, revoking?.role.id)}</span>
              </p>
            ) : null}
          </>
        }
        confirmLabel={UI.delete}
        onConfirm={() => revoking && void revokeGrant(revoking.user, revoking.role)}
        onOpenChange={(next) => {
          if (!next) setRevoking(null);
        }}
      />

      <Modal open={showProvisioning} onOpenChange={setShowProvisioning} size="lg" title="አዲስ የመግቢያ መለያ መክፈት" description="በአሳሽ ውስጥ auth ተጠቃሚ መፍጠር አይቻልም — የ Supabase አማራጩ service_role ብቻ ነው።">
        <div className="space-y-4 text-sm">
          <ol className="list-decimal space-y-2 ps-5">
            <li>
              በ Supabase ዳሽቦርድ ውስጥ <b>Authentication → Users → Add user</b> ይምረጡና ኢሜይልና የይለፍ ቃል ያስገቡ (ማረጋገጫ ኢሜይል ሊያስፈልግ ይችላል)።
            </li>
            <li>
              ከዚያ <b>SQL Editor</b> ይክፈቱና መረጃውን ይሩጹ። ይህ ተግባር መገለጫውን (<code dir="ltr">profiles</code>) ያዘጋጃል፠ የ <code dir="ltr">super_admin</code> ሚናውንም ይሰጣል።
            </li>
            <li>ተጠቃሚው ሲገባ ሚናዎቹን ከዚህ ገጽ (“ሚናዎች” ክፍሉ) ማስተካከል ይቻላል።</li>
          </ol>

          <SqlBlock
            label="በ SQL Editor ውስጥ ለመሮጥ የሚያገለግል ትዕዛዝ"
            sql={`-- ተጠቃሚው በ Authentication ዝርዝር ውስጥ መኖር አለበት\nselect public.bootstrap_super_admin('new-admin@example.com');`}
          />

          <p className="text-xs text-muted-foreground">
            <code dir="ltr">bootstrap_super_admin(p_email)</code> service_role ለሌለው ክፍለ ጊዜ ፍቃድ የለውም፤ ስለዚህ በዚህ ገጽ ላይ ቁልፍ ሳይሆን መመሪያ ሆኖ ቀርቷል።
          </p>
        </div>
      </Modal>
    </div>
  );
}

// ─── 2 · roles and the permission matrix ─────────────────────────────────────

/** `${roleId}|${permissionKey}` — one string per grant row, so diffing is a set comparison. */
const grantId = (roleId: string, permissionKey: string) => `${roleId}|${permissionKey}`;
const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,59}$/;

export function RolesPermissionsScreen() {
  const { identity } = useAuth();
  const { mayRead, mayWrite, needsSuperAdmin, refresh } = useAdminAccess();

  const [roles, setRoles] = useState<Row<'roles'>[]>([]);
  const [userRoles, setUserRoles] = useState<Row<'user_roles'>[]>([]);
  const [grants, setGrants] = useState<Row<'role_permissions'>[]>([]);
  const [dbKeys, setDbKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState('');

  const [draft, setDraft] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<'create' | Row<'roles'> | null>(null);
  const [form, setForm] = useState({ key: '', name_am: '', name_en: '', description: '' });
  const [deleting, setDeleting] = useState<Row<'roles'> | null>(null);

  const load = useCallback(async () => {
    if (!identity || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    if (!mayRead) {
      setLoading(false);
      setError(UI.permissionDenied);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rbac, grantRows, permissionRows] = await Promise.all([
        readRbacTables(),
        listRows(supabase.from('role_permissions').select('*').limit(5000)),
        listRows(supabase.from('permissions').select('*').order('key', { ascending: true }).limit(400)),
      ]);
      setRoles(rbac.roles);
      setUserRoles(rbac.userRoles);
      setGrants(grantRows as unknown as Row<'role_permissions'>[]);
      setDbKeys((permissionRows as unknown as Row<'permissions'>[]).map((p) => p.key));
      setDraft(new Set((grantRows as unknown as Row<'role_permissions'>[]).map((g) => grantId(g.role_id, g.permission_key))));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [identity, mayRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const holders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const grant of userRoles) counts.set(grant.role_id, (counts.get(grant.role_id) ?? 0) + 1);
    return counts;
  }, [userRoles]);

  /**
   * The catalogue is the closed list the migrations seeded. A key that exists in
   * code but not in `permissions` cannot be granted (the foreign key refuses it),
   * so it stays out of the matrix and is reported instead.
   */
  const available = useMemo(() => ALL_PERMISSION_KEYS.filter((key) => dbKeys.includes(key)), [dbKeys]);
  const missingFromDb = useMemo(() => ALL_PERMISSION_KEYS.filter((key) => dbKeys.length > 0 && !dbKeys.includes(key)), [dbKeys]);

  const grouped = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const out = new Map<string, PermissionKey[]>();
    for (const key of available) {
      if (needle && !key.toLowerCase().includes(needle) && !labelOf(key).includes(term.trim())) continue;
      const module = moduleOf(key);
      if (!out.has(module)) out.set(module, []);
      out.get(module)!.push(key);
    }
    return [...out.entries()];
  }, [available, term]);

  const changes = useMemo(() => {
    const stored = new Set(grants.map((g) => grantId(g.role_id, g.permission_key)));
    const added: string[] = [];
    const removed: string[] = [];
    for (const id of draft) if (!stored.has(id)) added.push(id);
    for (const id of stored) if (!draft.has(id)) removed.push(id);
    return { added, removed, count: added.length + removed.length };
  }, [draft, grants]);

  function toggle(roleId: string, key: PermissionKey, next: boolean) {
    if (!mayWrite) return;
    setDraft((prev) => {
      const out = new Set(prev);
      const id = grantId(roleId, key);
      if (next) out.add(id);
      else out.delete(id);
      return out;
    });
  }

  /** Tick or clear a whole module at once for one role. */
  function toggleWholeModule(keys: PermissionKey[], roleId: string, next: boolean) {
    if (!mayWrite) return;
    setDraft((prev) => {
      const out = new Set(prev);
      for (const key of keys) {
        const id = grantId(roleId, key);
        if (next) out.add(id);
        else out.delete(id);
      }
      return out;
    });
  }

  /** Insert what was ticked, delete what was unticked — each delete filters on both key columns. */
  async function save() {
    if (changes.count === 0) {
      toast.info('የተቀየረ ፍቃድ የለም');
      return;
    }
    setSaving(true);
    try {
      if (changes.added.length > 0) {
        const rows = changes.added.map((id) => {
          const [role_id, permission_key] = id.split('|');
          return { role_id, permission_key };
        });
        const { error: insertError } = await supabase.from('role_permissions').insert(rows as never);
        if (insertError) throw new Error(friendlyError(insertError));
      }
      for (const id of changes.removed) {
        const [role_id, permission_key] = id.split('|');
        const { error: removeError } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', role_id)
          .eq('permission_key', permission_key);
        if (removeError) throw new Error(friendlyError(removeError));
      }
      toast.success(`${num(changes.added.length)} ፍቃድ ተሰጥቷል፣ ${num(changes.removed.length)} ተወግዷል።`);
      await load();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setEditing('create');
    setForm({ key: '', name_am: '', name_en: '', description: '' });
  }

  function openRename(role: Row<'roles'>) {
    setEditing(role);
    setForm({ key: role.key, name_am: role.name_am, name_en: role.name_en ?? '', description: role.description ?? '' });
  }

  async function saveRole() {
    const nameAm = form.name_am.trim();
    if (nameAm.length < 2) {
      toast.error('የሚና ስም (አማርኛ) ያስፈልጋል።');
      return;
    }

    setSaving(true);
    try {
      if (editing === 'create') {
        if (!ROLE_KEY_PATTERN.test(form.key)) {
          toast.error('ቁልፉ ትንሽ እንግሊዝኛ፠ ቁጥርና ዐረፍተ ነገር (_) ብቻ መሆን አለበት።');
          return;
        }
        const payload: Record<string, unknown> = { key: form.key, name_am: nameAm, is_system: false };
        if (form.name_en.trim()) payload.name_en = form.name_en.trim();
        if (form.description.trim()) payload.description = form.description.trim();
        const { error: insertError } = await supabase.from('roles').insert(payload as never);
        if (insertError) throw new Error(friendlyError(insertError));
        toast.success(`“${nameAm}” ተመዝግቧል።`);
      } else if (editing) {
        const payload: Record<string, unknown> = {};
        if (nameAm !== editing.name_am) payload.name_am = nameAm;
        if (form.name_en.trim() !== (editing.name_en ?? '')) payload.name_en = form.name_en.trim() || null;
        if (form.description.trim() !== (editing.description ?? '')) payload.description = form.description.trim() || null;
        if (Object.keys(payload).length === 0) {
          toast.info('የተቀየረ ነገር የለም');
          return;
        }
        const { error: updateError } = await supabase.from('roles').update(payload as never).eq('id', editing.id);
        if (updateError) throw new Error(friendlyError(updateError));
        toast.success(UI.saved);
      }
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setSaving(false);
    }
  }

  async function removeRole(role: Row<'roles'>) {
    setSaving(true);
    try {
      const { error: removeError } = await supabase.from('roles').delete().eq('id', role.id);
      if (removeError) throw new Error(friendlyError(removeError));
      toast.success(`“${role.name_am}” ተሰርዟል።`);
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : UI.serverError);
    } finally {
      setSaving(false);
    }
  }

  const roleColumns = useMemo<Column<Row<'roles'>>[]>(
    () => [
      {
        key: 'name_am',
        header: 'ሚና',
        sortable: true,
        cell: (role) => (
          <div className="min-w-0">
            <p className="font-medium">{role.name_am}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">{role.key}</p>
          </div>
        ),
      },
      { key: 'description', header: 'ማብራሪያ', hideBelow: 'md', cell: (role) => (role.description ? truncate(role.description, 70) : '—') },
      {
        key: 'is_system',
        header: 'ዐይነት',
        cell: (role) => (role.is_system ? <StatusBadge tone="neutral">የስርዓት (አይሰረዝም)</StatusBadge> : <StatusBadge tone="info">በእጅ የተዘጋጀ</StatusBadge>),
      },
      { key: '__holders', header: 'ተጠቃሚዎች', sortable: false, cell: (role) => num(holders.get(role.id) ?? 0) },
      {
        key: '__grants',
        header: 'ፍቃዶች',
        sortable: false,
        cell: (role) => {
          const explicit = grants.filter((g) => g.role_id === role.id).length;
          if (role.key === 'super_admin') return <span className="text-xs text-muted-foreground">ሁሉም (በራሱ)</span>;
          return `${num(explicit)} / ${num(available.length)}`;
        },
      },
      ...(mayWrite
        ? [
            {
              key: '__actions' as const,
              header: UI.actions,
              sortable: false,
              cell: (role: Row<'roles'>) => (
                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openRename(role)}>
                    {UI.edit}
                  </Button>
                  {role.is_system ? (
                    <span className="text-xs text-muted-foreground">የማስገበሪያ ሚና — አይሰረዝም</span>
                  ) : (holders.get(role.id) ?? 0) > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {num(holders.get(role.id) ?? 0)} ተጠቃሚ ስላለው አይሰረዝም፤ በመጀመሪያ ያስወግዱ
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} onClick={() => setDeleting(role)}>
                      {UI.delete}
                    </Button>
                  )}
                </div>
              ),
            },
          ]
        : []),
    ],
    [mayWrite, holders, grants, available.length]
  );

  if (!isSupabaseConfigured) return <ErrorNote message="ሚናዎችና ፍቃዶች ለማስተዳደር መረጃዎቹ ገና አልተገናኙም።" />;

  return (
    <div className="space-y-5">
      <PageHeading
        title="ሚናዎችና ፍቃዶች"
        description="የፍቃድ ዝርዝሩ (61 ቁልፎች) በማስገበሪያ የተዘጋጀ ነው፤ የሚቀየረው የትኛው ሚና የትኛውን ቁልፍ እንደሚይዝ ብቻ ነው — `role_permissions` በ (ሚና፣ ፍቃድ) ይለያል።"
        actions={
          <>
            {mayWrite ? (
              <Button size="sm" onClick={openCreate} icon={<UserPlus className="h-4 w-4" aria-hidden />}>
                {UI.add} ሚና
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              እንደገና
            </Button>
          </>
        }
      />

      {!mayRead ? <ErrorNote message={UI.permissionDenied} /> : null}
      {needsSuperAdmin ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          ለውጦችን የሚቀበለው <code dir="ltr">is_super_admin()</code> ብቻ ነው፤ መብት ቢኖርዎትም ይህ ሚና ከሌለዎት ማስገቢያው በዳታቤዙ ይመለሳል።
        </p>
      ) : null}
      {error ? <ErrorNote message={error} onRetry={() => void load()} /> : null}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Field label={UI.search} htmlFor="perm-term" className="w-72">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="perm-term" className="ps-9" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ፍቃድ በስም ወይም በቁልፍ ፈልግ" />
              </div>
            </Field>
            <div className="ms-auto flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge tone="info">{num(available.length)} ቁልፎች</StatusBadge>
              <StatusBadge tone="neutral">{num(roles.length)} ሚናዎች</StatusBadge>
              {changes.count > 0 ? <StatusBadge tone="warning">{num(changes.count)} ያልተቀመጡ ለውጦች</StatusBadge> : null}
            </div>
          </div>

          <DataTable
            rows={roles}
            columns={roleColumns}
            rowKey={(role) => role.id}
            loading={loading}
            pageSize={20}
            emptyTitle={UI.empty}
            emptyDescription="ሚናዎች በማስገበሪያ (migration) ይመሠረታሉ፤ ከዚህ በኋላ በዚህ ገጽ ይጨምራሉ።"
            caption="ሚናዎች"
          />
        </CardBody>
      </Card>

      {missingFromDb.length > 0 ? (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          ከኮዱ ዝርዝር ጋር የማይዛመዱ ቁልፎች ስለሌሉ ማስገቢያ ተከልክሏል፦ <span dir="ltr" className="font-mono">{missingFromDb.join('، ')}</span>
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-base">የፍቃድ ሰንጠረዥ</CardTitle>
            <CardDescription>
              {mayWrite
                ? 'ባል በማድረግ ሲያልቁ “ለውጦችን አስቀምጥ” ይጫኑ — የሚጻፉት የተጨመሩና የተወገዱ ረድፎች ብቻ ናቸው።'
                : 'ለአንባቢ ብቻ። ለውጥ ለማድረግ የ super_admin ሚና ያስፈልጋል።'}
            </CardDescription>
          </div>
          {mayWrite && changes.count > 0 ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setDraft(new Set(grants.map((g) => grantId(g.role_id, g.permission_key))))}>
                {UI.reset}
              </Button>
              <Button size="sm" loading={saving} onClick={() => void save()}>
                ለውጦችን አስቀምጥ ({num(changes.count)})
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardBody>
          {loading ? (
            <p className="text-sm text-muted-foreground">{UI.loading}</p>
          ) : roles.length === 0 || available.length === 0 ? (
            <EmptyState title="የሚና ወይም የፍቃድ ዝርዝር የለም" description="ዳታቤዙ ሲማላ ሁለቱም ዝርዝሮች ይሞላሉ።" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">በዘርፍ የተሰባሰቡ ፍቃዶች በሚናዎች መሠረት</caption>
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-xs text-muted-foreground">
                    <th scope="col" className="sticky start-0 z-10 bg-muted/60 px-3 py-2 text-start font-medium">
                      ፍቃድ
                    </th>
                    {roles.map((role) => (
                      <th key={role.id} scope="col" className="px-2 py-2 text-center font-medium">
                        <span className="block max-w-[7rem] truncate" title={role.name_am}>
                          {role.name_am}
                        </span>
                        <span className="block text-[10px] font-normal">{role.key === 'super_admin' ? 'ሁሉም' : `${num(holders.get(role.id) ?? 0)} ተጠቃሚ`}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([module, keys]) => (
                    <Fragment key={module}>
                      <tr className="border-y border-border bg-gold-soft/40">
                        <td colSpan={roles.length + 1} className="px-3 py-1.5 font-display text-xs font-semibold">
                          {MODULE_NAMES[module] ?? module} <span dir="ltr" className="text-muted-foreground">({module})</span>
                        </td>
                      </tr>
                      {keys.map((key) => (
                        <tr key={key} className="border-b border-border last:border-0">
                          <th scope="row" className="sticky start-0 z-10 bg-card px-3 py-2 text-start font-normal">
                            <p className="text-sm">{labelOf(key)}</p>
                            <p dir="ltr" className="font-mono text-[11px] text-muted-foreground">{key}</p>
                          </th>
                          {roles.map((role) => {
                            // super_admin holds every key through `has_permission()` alone, so the
                            // row it would need is shown as implied instead of tickable.
                            if (role.key === 'super_admin') {
                              return (
                                <td key={role.id} className="px-2 py-2 text-center">
                                  <span className="text-xs text-muted-foreground" title="በ super_admin ሚና ሁሉም ፍቃድ በራሱ ተሰጥቷል">
                                    ✓
                                  </span>
                                </td>
                              );
                            }
                            return (
                              <td key={role.id} className="px-2 py-2 text-center">
                                <Checkbox
                                  aria-label={`${role.name_am} — ${labelOf(key)}`}
                                  checked={draft.has(grantId(role.id, key))}
                                  disabled={!mayWrite}
                                  onChange={(e) => toggle(role.id, key, e.target.checked)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {mayWrite ? (
                        <tr className="border-b border-border">
                          <td className="px-3 py-1.5 text-xs text-muted-foreground" colSpan={roles.length + 1}>
                            <span dir="ltr" className="font-mono">{module}</span> ዘርፍን ለአንድ ሚና በሙሉ፦
                            {roles
                              .filter((role) => role.key !== 'super_admin')
                              .map((role) => (
                                <button
                                  key={role.id}
                                  type="button"
                                  className="mx-1 underline underline-offset-2 hover:text-foreground"
                                  onClick={() => {
                                    const allOn = keys.every((key) => draft.has(grantId(role.id, key)));
                                    toggleWholeModule(keys, role.id, !allOn);
                                  }}
                                >
                                  {role.name_am} {bulkLabel(keys, role.id, draft)}
                                </button>
                              ))}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={editing !== null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        size="md"
        title={editing === 'create' ? `${UI.add} ሚና` : `አስተካክል: ${editing?.name_am ?? ''}`}
        description={editing === 'create' ? 'ቁልፉ ከተቀመጠ በኋላ አይቀየርም — በኮድና በማስገበሪያ ስለሚጠቀም።' : 'ስምና ማብራሪያ ብቻ ይቀየራሉ፤ ቁልፉ አይቀየርም።'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {UI.cancel}
            </Button>
            <Button onClick={() => void saveRole()} loading={saving}>
              {UI.save}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="ቁልፍ (ለምሳሌ finance_officer)" htmlFor="role-key" required={editing === 'create'} hint="ትንሽ እንግሊዝኛ፠ ቁጥርና _ ብቻ።">
            <Input
              id="role-key"
              dir="ltr"
              value={form.key}
              disabled={editing !== 'create'}
              invalid={form.key.length > 0 && !ROLE_KEY_PATTERN.test(form.key)}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
          </Field>
          <Field label="ስም (አማርኛ)" htmlFor="role-name-am" required>
            <Input id="role-name-am" value={form.name_am} onChange={(e) => setForm({ ...form, name_am: e.target.value })} />
          </Field>
          <Field label="ስም (እንግሊዝኛ)" htmlFor="role-name-en" hint="ከፈለጉ፤ ለሪፖርት አገናኞች ብቻ።">
            <Input id="role-name-en" dir="ltr" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          </Field>
          <Field label="ማብራሪያ" htmlFor="role-desc">
            <Textarea id="role-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        busy={saving}
        destructive
        title={`${UI.delete}: ${deleting?.name_am ?? ''}`}
        description={
          <>
            <p>
              የሚናው ፍቃዶች በ <code dir="ltr">on delete cascade</code> አብረው ይጠፋሉ፤ ተመልሶ አይመለስም። {deleting?.key === 'super_admin' ? 'የ super_admin ሚና ሲወገድ የስርዓቱ አስተዳደር ሊከለከል ይችላል።' : ''}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">ተጠቃሚዎች ቢኖሩት መሰረዙ እዚህ ተከልክሏል — በመጀመሪያ ከ <code dir="ltr">user_roles</code> ያስወግዱ።</p>
          </>
        }
        confirmLabel={UI.delete}
        onConfirm={() => {
          if (!deleting) return;
          if (deleting.is_system) {
            toast.error('የስርዓት ሚና ስለሆነ መሰረዝ አይቻልም።');
            return;
          }
          void removeRole(deleting);
        }}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
      />
    </div>
  );
}

// ─── 3 · the export and backup centre ────────────────────────────────────────

/** A table the centre can read, the Amharic name it shows, and the grant its policy needs. */
type BackupTable = { table: string; label: string; perm: PermissionKey };

/**
 * The reference data the office maintains, plus the RBAC tables an admin always
 * wants in a copy. The grants are the ones the RLS policies (migration 150) use,
 * not the ones the sidebar screens happen to ask for.
 */
const REFERENCE_TABLES: BackupTable[] = [
  { table: 'site_settings', label: 'የመድረክ ቅንብሮች', perm: 'website.read' },
  { table: 'class_levels', label: 'የትምህርት ደረጃዎች', perm: 'academics.read' },
  { table: 'subjects', label: 'ትምህርቶች', perm: 'academics.read' },
  { table: 'grade_scales', label: 'የደረጃ መለኪያ', perm: 'results.read' },
  { table: 'finance_accounts', label: 'የሂሳብ ዝርዝር', perm: 'finance.read' },
  { table: 'finance_categories', label: 'የፋይናንስ ምድቦች', perm: 'finance.read' },
  { table: 'departments', label: 'ክፍሎች/ዘርፎች', perm: 'departments.read' },
  { table: 'org_units', label: 'የአዘራረብ መዋቅር', perm: 'website.read' },
  { table: 'certificate_templates', label: 'የምስክር ወረቀት ቅንጾች', perm: 'certificates.read' },
  { table: 'menus', label: 'የዝርዝር ቦታዎች', perm: 'website.read' },
  { table: 'menu_items', label: 'ዝርዝር አገናኞች', perm: 'website.read' },
  { table: 'faqs', label: 'ተደጋጋሚ ጥያቄዎች', perm: 'website.read' },
];

const RBAC_TABLES: BackupTable[] = [
  { table: 'roles', label: 'ሚናዎች', perm: 'system.read' },
  { table: 'permissions', label: 'ፍቃዶች', perm: 'system.read' },
  { table: 'user_roles', label: 'የተጠቃሚ ሚናዎች', perm: 'system.read' },
  { table: 'role_permissions', label: 'የሚና ፍቃዶች', perm: 'system.read' },
  { table: 'profiles', label: 'የተጠቃሚዎች መገለጫ', perm: 'system.read' },
  { table: 'audit_logs', label: 'የሥራ መከታተያ መዝገብ', perm: 'audit.read' },
];

/** Column names are English in the database; the headers a person reads are Amharic. */
const COLUMN_LABELS: Record<string, string> = {
  id: 'መለያ',
  key: 'ቁልፍ',
  created_at: 'የተፈጠረበት',
  updated_at: 'የተሻሻለበት',
  name_am: 'ስም (አማርኛ)',
  name_en: 'ስም (እንግሊዝኛ)',
  title_am: 'ርዕስ',
  description: 'ማብራሪያ',
  state: 'ሁኔታ',
  status: 'ሁኔታ',
  sort_order: 'ድርድር',
  is_active: 'ንቁ',
  is_public: 'ግልጽ',
  is_system: 'የስርዓት',
  phone: 'ስልክ',
  email: 'ኢሜይል',
  amount: 'መጠን',
  currency: 'ሳንባ',
  role_id: 'የሚና መለያ',
  user_id: 'የተጠቃሚ መለያ',
  permission_key: 'የፍቃድ ቁልፍ',
  table_name: 'ሰንጠረዝ',
  read_perm: 'የማንበብ ፍቃድ',
  write_perm: 'የመጻፍ ፍቃድ',
  delete_perm: 'የማጥፋት ፍቃድ',
};

const columnHeader = (column: string) => COLUMN_LABELS[column] ?? column;

/** Every column present in the rows read, in the order the first row returned them. */
function columnsOf(rows: Record<string, unknown>[]): ExportColumn[] {
  const seen: string[] = [];
  for (const row of rows.slice(0, 50)) {
    for (const key of Object.keys(row)) if (!seen.includes(key)) seen.push(key);
  }
  return seen.map((key) => ({ header: columnHeader(key), key }));
}

const stamp = () => dateAm(new Date()).replace(/\s/g, '');

export function BackupScreen() {
  const { identity, can } = useAuth();
  const { mayRead } = useAdminAccess();
  const mayExport = can('reports.export');
  const mayAudit = can('audit.read');

  const [registry, setRegistry] = useState<BackupTable[]>([]);
  const [table, setTable] = useState('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  const [dump, setDump] = useState<{ done: number; total: number; label: string; skipped: string[] } | null>(null);
  const [dumping, setDumping] = useState(false);
  const [dumpError, setDumpError] = useState<string | null>(null);

  const [audit, setAudit] = useState<Row<'audit_logs'>[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  /** The table list is the database's own registry (`rls_rules`) plus the RBAC tables it omits. */
  useEffect(() => {
    if (!identity || !isSupabaseConfigured) return;
    let cancelled = false;

    const known = [...RBAC_TABLES, ...REFERENCE_TABLES];
    if (!mayRead) {
      // Without `system.read` the registry itself is filtered out by RLS, so the
      // centre keeps the tables whose grants this person demonstrably holds.
      setRegistry(known.filter((item) => can(item.perm)));
      return;
    }

    void (async () => {
      try {
        const rules = await listRows(supabase.from('rls_rules').select('*').order('table_name', { ascending: true }).limit(400));
        if (cancelled) return;
        const fromRules: BackupTable[] = (rules as unknown as Row<'rls_rules'>[])
          .filter((rule) => (ALL_PERMISSION_KEYS as readonly string[]).includes(rule.read_perm))
          .map((rule) => {
            const perm = rule.read_perm as PermissionKey;
            const module = moduleOf(perm);
            return { table: rule.table_name, label: `${MODULE_NAMES[module] ?? module} · ${rule.table_name}`, perm };
          });
        const merged = [...known, ...fromRules];
        const unique: BackupTable[] = [];
        for (const item of merged) if (!unique.some((u) => u.table === item.table)) unique.push(item);
        setRegistry(unique.filter((item) => can(item.perm)));
      } catch {
        if (!cancelled) setRegistry(known.filter((item) => can(item.perm)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identity, mayRead, can]);

  const readTable = useCallback(
    async (name: string) => {
      if (!name) return;
      setLoadingTable(true);
      setTableError(null);
      try {
        // The same read path every report uses: RLS decides, the anon key never overrides it.
        const data = await fetchRows<Record<string, unknown>>(name, { limit: 2000 });
        setRows(data);
      } catch (e) {
        setRows([]);
        setTableError(friendlyError(e));
      } finally {
        setLoadingTable(false);
      }
    },
    []
  );

  const auditLoad = useCallback(async () => {
    if (!mayAudit) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      setAudit((await listRows(supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(15))) as unknown as Row<'audit_logs'>[]);
    } catch (e) {
      setAuditError(friendlyError(e));
    } finally {
      setAuditLoading(false);
    }
  }, [mayAudit]);

  useEffect(() => {
    void auditLoad();
  }, [auditLoad]);

  useEffect(() => {
    if (table) void readTable(table);
  }, [table, readTable]);

  const chosen = registry.find((item) => item.table === table) ?? null;
  const columns = useMemo(() => columnsOf(rows), [rows]);

  function downloadCsv() {
    if (columns.length === 0) return;
    exportCsv(columns, rows, `${table}-${stamp()}`);
    toast.success(`${num(rows.length)} ረድፎች CSV ሆነው ተዘጋጅተዋል።`);
  }

  function downloadExcel() {
    if (columns.length === 0) return;
    exportExcel([{ name: chosen?.label ?? table, columns, rows }], `${table}-${stamp()}.xlsx`);
    toast.success(`${num(rows.length)} ረድፎች ወደ ኤክሴል ተላክተዋል።`);
  }

  /** One JSON file with the reference data, table by table, so progress is real. */
  async function dumpReferenceData() {
    const allowed = REFERENCE_TABLES.filter((item) => can(item.perm));
    const skipped = REFERENCE_TABLES.filter((item) => !can(item.perm)).map((item) => item.table);
    if (allowed.length === 0) {
      toast.error('የማንኛውንም ዝርዝር ሰንጠረዥ ለማንበብ መብት የላይኝም።');
      return;
    }

    setDumping(true);
    setDumpError(null);
    setDump({ done: 0, total: allowed.length, label: 'በመጀመሪያው ሰንጠረዥ ላይ…', skipped });

    try {
      const payload: Record<string, unknown> = {
        generated_at: new Date().toISOString(),
        church: UI.churchName,
        tables: {} as Record<string, unknown>,
      };
      const tables = payload.tables as Record<string, unknown[]>;
      const failures: string[] = [];

      for (let index = 0; index < allowed.length; index += 1) {
        const item = allowed[index]!;
        setDump({ done: index, total: allowed.length, label: `${item.label} በማንበብ ላይ…`, skipped });
        try {
          tables[item.table] = await fetchRows<Record<string, unknown>>(item.table, { limit: 5000 });
        } catch {
          // A table this person may name but not read is recorded, not guessed at.
          failures.push(item.table);
          tables[item.table] = [];
        }
      }

      payload.failed = failures;
      payload.skipped_by_grant = skipped;
      setDump({ done: allowed.length, total: allowed.length, label: 'ተዘጋጅቷል', skipped });
      downloadTextFile(`reference-data-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      toast.success(
        failures.length > 0
          ? `${num(allowed.length - failures.length)} ሰንጠረዞች ተዘጋጅተዋል፤ ${num(failures.length)} ግን አልተነበቡም።`
          : `${num(allowed.length)} ሰንጠረዞች በ JSON ተዘጋጅተዋል።`
      );
    } catch (e) {
      // A dump that dies before the file exists says so on screen instead of spinning.
      const message = friendlyError(e);
      setDump(null);
      setDumpError(message);
      toast.error(message);
    } finally {
      setDumping(false);
    }
  }

  if (!isSupabaseConfigured) return <ErrorNote message="ቅጂ ለማዘጋጀት መረጃዎቹ ገና አልተገናኙም።" />;

  return (
    <div className="space-y-5">
      <PageHeading
        title="ቅጂና መረጃ ማውጣት"
        description="የሚወጡት ቅጂዎች በተመሳሳይ የማንበብ መንገድ (row level security) የተፈቀዱ ረድፎች ብቻ ያካትታሉ — የተሟላ የዳታቤዝ ቅጂ በ Supabase ዳሽቦርድ ይዘጋጃል።"
        actions={
          mayAudit ? (
            <Button variant="ghost" size="sm" onClick={() => void auditLoad()} loading={auditLoading} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
              መዝገብ እንደገና
            </Button>
          ) : null
        }
      />

      {!mayExport ? (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          ለማውረድ “ሪፖርት ማውጣት” (<code dir="ltr">reports.export</code>) መብት ያስፈልጋል፤ ስለዚህ የማውረድ ቁልፎች ተደብቀዋል — ማየት ግን ይችላሉ።
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-base">ሰንጠረዝ መርጠው ማውረድ</CardTitle>
            <CardDescription>ዝርዝሩ ከ <code dir="ltr">rls_rules</code> መዝገብ ይመጣል፤ የፍቃድዎ ማንበብ የሚችሉት ብቻ ይታያሉ።</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="ሰንጠረዝ" htmlFor="bk-table" className="w-80">
              <Select
                id="bk-table"
                value={table}
                placeholder={registry.length ? '— ሰንጠረዝ ይምረጡ —' : 'በፍቃድዎ የሚገኝ ሰንጠረዝ የለም'}
                options={registry.map((item) => ({ value: item.table, label: item.label }))}
                onChange={(e) => setTable(e.target.value)}
              />
            </Field>
            <Button variant="outline" size="md" disabled={!table || loadingTable} onClick={() => void readTable(table)} icon={<Table2 className="h-4 w-4" aria-hidden />}>
              ብዛት አንብብ
            </Button>
            {mayExport ? (
              <>
                <Button variant="outline" disabled={!rows.length || loadingTable} onClick={downloadCsv} icon={<Download className="h-4 w-4" aria-hidden />}>
                  CSV
                </Button>
                <Button disabled={!rows.length || loadingTable} onClick={downloadExcel} icon={<Download className="h-4 w-4" aria-hidden />}>
                  {UI.exportExcel}
                </Button>
              </>
            ) : null}
            <div className="ms-auto flex flex-wrap items-center gap-2 text-xs">
              {loadingTable ? <StatusBadge tone="info">በማንበብ ላይ…</StatusBadge> : null}
              {table && !loadingTable ? <StatusBadge tone="neutral">{num(rows.length)} ረድፎች ተነብበዋል</StatusBadge> : null}
              {table && !loadingTable && rows.length === 2000 ? <StatusBadge tone="warning">2000 ወሰን ገደቧል</StatusBadge> : null}
            </div>
          </div>

          {tableError ? <ErrorNote message={tableError} onRetry={() => void readTable(table)} /> : null}
          {chosen && !loadingTable && rows.length === 0 && !tableError ? (
            <EmptyState title="ሰንጠረዡ ባዶ ነው ወይም በፍቃድዎ ውስጥ ረድፍ የለም" description="የማንበብ መብት ማጣሪያ እንጋቢ አይደለም፤ ያሉ ረድፎች ብቻ ይመጣሉ።" />
          ) : null}

          {rows.length > 0 ? (
            <DataTable
              rows={rows.slice(0, 10)}
              columns={columns.slice(0, 8).map<Column<Record<string, unknown>>>((column) => ({
                key: column.key,
                header: column.header,
                sortable: false,
                hideBelow: 'md',
                cell: (row) => {
                  const value = row[column.key];
                  if (value === null || value === undefined || value === '') return '—';
                  return typeof value === 'object' ? truncate(JSON.stringify(value), 40) : truncate(String(value), 40);
                },
              }))}
              rowKey={(row, index) => String(row.id ?? row.key ?? index)}
              pageSize={10}
              emptyTitle="—"
              caption={`${chosen?.label ?? table} ናሙና`}
            />
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-base">የድጋፍ መረጃ JSON ቅጂ</CardTitle>
            <CardDescription>ቅንብሮች፠ የትምህርት ዝርዝሮች፠ የሂሳብ መዋቅርና ዝርዝሮች — ለጥናት ወይም ለሌላ ቦታ ለመድገም። የሚዛመዱ ሰነድና ሚዲያ ይዘቶች እዚህ የሉም።</CardDescription>
          </div>
          {mayExport ? (
            <Button variant="outline" loading={dumping} onClick={() => void dumpReferenceData()} icon={<FileJson className="h-4 w-4" aria-hidden />}>
              JSON አውርድ
            </Button>
          ) : null}
        </CardHeader>
        <CardBody className="space-y-3">
          {dump ? (
            <div className="space-y-2">
              <ProgressBar value={Math.round((dump.done / Math.max(1, dump.total)) * 100)} label={`${dump.label} (${num(dump.done)}/${num(dump.total)})`} />
              {dump.skipped.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  በፍቃድዎ ማንበብ ያልተቻሉ፦ <span dir="ltr" className="font-mono">{dump.skipped.join('، ')}</span>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {REFERENCE_TABLES.map((item) => (
                <StatusBadge key={item.table} tone={can(item.perm) ? 'neutral' : 'warning'}>
                  {item.label}
                  {can(item.perm) ? '' : ' (ፍቃድ የለም)'}
                </StatusBadge>
              ))}
            </div>
          )}
          {dumpError ? <ErrorNote message={dumpError} /> : null}
        </CardBody>
      </Card>

      {mayAudit ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="text-base">የቅርብ ጊዜ የሥራ መከታተያ መዝገብ</CardTitle>
              <CardDescription>15 የመጨረሻ ለውጦች። መዝገቡ በ trigger ብቻ ስለሚጻፍ እዚህ ማስተዳደር የለም።</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm" icon={<ScrollText className="h-4 w-4" aria-hidden />}>
              <Link to="/erp/system/audit">ሙሉ መዝገብ</Link>
            </Button>
          </CardHeader>
          <CardBody>
            {auditError ? (
              <ErrorNote message={auditError} onRetry={() => void auditLoad()} />
            ) : (
              <DataTable
                rows={audit}
                columns={[
                  { key: 'created_at', header: 'ቀንና ሰዓት', cell: (row) => <span className="whitespace-nowrap text-xs">{dateTimeAm(row.created_at)}</span> },
                  { key: 'user_label', header: 'ተጠቃሚ', cell: (row) => row.user_label ?? row.user_id ?? '—' },
                  { key: 'action', header: 'ተግባር', cell: (row) => <StatusBadge tone={row.action === 'DELETE' ? 'danger' : row.action === 'UPDATE' ? 'warning' : 'success'}>{row.action}</StatusBadge> },
                  { key: 'table_name', header: 'ሰንጠረዝ', hideBelow: 'sm', cell: (row) => <span dir="ltr" className="font-mono text-xs">{row.table_name}</span> },
                  { key: 'record_id', header: 'የረድፍ መለያ', hideBelow: 'lg', cell: (row) => <span dir="ltr" className="font-mono text-xs">{truncate(row.record_id ?? '—', 18)}</span> },
                ]}
                rowKey={(row) => String(row.id)}
                loading={auditLoading}
                pageSize={10}
                emptyTitle="የተሰመረ ለውጥ የለም"
                emptyDescription="የተመዘገቡ ለውጦች በማስገበሪያው ተቀማጭ ሰንጠረዞች ላይ ብቻ ይጠበቃሉ።"
                caption="የቅርብ ጊዜ መከታተያ"
              />
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              ለተጨማሪ ሰንጠረዝ የለውጥ መከታተያ መብት የሚከፈተው በዳሽቦርዱ ውስጥ ብቻ ነው (<code dir="ltr">enable_audit</code> የ trigger ማዘጋጀያ ስለሆነ)።
            </p>
          </CardBody>
        </Card>
      ) : (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          የሥራ መከታተያ መዝገብ ለማየት “የሥነ ምግባር መዝገብ ማየት” (<code dir="ltr">audit.read</code>) መብት ያስፈልጋል።
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">የተዘጋጀ የዳታቤዝ ቅጂ — በ Supabase ዳሽቦርድ ብቻ</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <p>
            ይህ መተግበሪያ የ <b>ሎጂካል</b> ቅጂ (CSV፠ ኤክሴል፠ JSON) ያዘጋጃል። የተሟላና ሊመለስ የሚችል <b>ፊዚካል</b> ቅጂ ግን በአሳሽ ሊወጣ አይችልም —
            የ Supabase ፕሮጀክት ቅንብርና የ service_role ቁልፍ ያስፈልገዋል።
          </p>
          <ol className="list-decimal space-y-1.5 ps-5">
            <li>ወደ Supabase ዳሽቦርድ ይግቡ፦ <b>Project Settings → Backups</b>።</li>
            <li>
              የዕለት ተዕለት ቅጂና <b>Point-in-Time Recovery</b> ከፈለጉ ያብሩ (የክፍያ ዕቅድ ያስፈልጋል)፤ ከሆነ የመጀመሪያው ቅጂ በ 24 ሰዓት ውስጥ ይዘጋጃል።
            </li>
            <li>
              ለእጅ ቅጂ <b>Database → SQL Editor</b> ውስጥ <code dir="ltr">pg_dump</code> በ CLI ወይም <b>Database → Types/Schema</b> ከሆነ የ schematic export ይውሰዱ፤
              የመልእክትና የሚዲያ ይዘት በ Storage ተሐድሷል — እነዚህ እዚህ ካሉት ቅጂዎች ውጭ ናቸው።
            </li>
            <li>
              ቅጂውን ለመመለስ ዳሽቦርዱ <b>Backups → Restore</b> ይጠይቃል፤ ይህ ማድረግ አዲሱን ፕሮጀክት ይተካልና ከፍተኛ ኃላፊነት ያለው ተጠቃሚ ብቻ ያደርገዋል።
            </li>
          </ol>
          <SqlBlock
            label="የመከታተያ መዝገብ ሽፋን ለማጥብቅ (አንድ ጊዜ በሰንጠረዝ)"
            sql={`-- በ SQL Editor (service role) ውስጥ\nselect public.enable_audit('transactions');`}
          />
          <p className="text-xs text-muted-foreground">
            በዚህ ገጽ ላይ “ቅጂ ጀምር” የሚል ቁልፍ የለም — ፕሮጀክቱን የሚቀጥነው ወይም የሚመልሰው የመተግበሪያው ክፍለ ጊዜ አይደለም፤ ሐሰተኛ ቁልፍ ከማየት ይልቅ መመሪያው ቀርቧል።
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

/** The small word beside a bulk module button, so it says what pressing it does. */
function bulkLabel(keys: PermissionKey[], roleId: string, draft: Set<string>): string {
  return keys.every((key) => draft.has(grantId(roleId, key))) ? 'ሁሉንም አውጣ' : 'ሁሉንም ስጥ';
}
