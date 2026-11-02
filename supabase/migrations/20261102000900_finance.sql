-- 09 · Finance: chart of accounts, transactions, donations, campaigns, budgets

create table public.finance_accounts (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name_am    text not null,
  name_en    text,
  kind       text not null check (kind in ('asset','liability','equity','income','expense','fund')),
  parent_id  uuid references public.finance_accounts (id) on delete set null,
  currency   text not null default 'ETB',
  opening_balance numeric(14,2) not null default 0,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_categories (
  id          uuid primary key default gen_random_uuid(),
  name_am     text not null,
  name_en     text,
  kind        text not null check (kind in ('income','expense')),
  account_id  uuid references public.finance_accounts (id) on delete set null,
  description text,
  is_donation_eligible boolean not null default false,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (name_am, kind)
);

create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  ref_no         text not null unique,
  type           public.transaction_type not null,
  account_id     uuid references public.finance_accounts (id) on delete set null,
  to_account_id  uuid references public.finance_accounts (id) on delete set null,
  category_id    uuid references public.finance_categories (id) on delete set null,
  department_id  uuid references public.departments (id) on delete set null,
  event_id       uuid references public.events (id) on delete set null,
  member_id      uuid references public.members (id) on delete set null,
  amount         numeric(14,2) not null check (amount > 0),
  currency       text not null default 'ETB',
  occurred_on    date not null,
  eth_date       text,
  description_am text not null,
  method         public.payment_method not null default 'cash',
  reference_ext  text,                                  -- bank / check / mobile money no
  receipt_media_id uuid references public.media_files (id) on delete set null,
  status         text not null default 'pending_approval'
                  check (status in ('draft','pending_approval','approved','rejected','void')),
  recorded_by    uuid references public.profiles (id) on delete set null,
  approved_by    uuid references public.profiles (id) on delete set null,
  approved_at    timestamptz,
  rejection_note text,
  reversal_of_id uuid references public.transactions (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (type <> 'transfer' or (account_id is not null and to_account_id is not null))
);

create index transactions_date_idx on public.transactions (occurred_on desc, status);
create index transactions_account_idx on public.transactions (account_id, status);
create index transactions_category_idx on public.transactions (category_id, status);

-- Auto-generated receipt/voucher numbers: TT-INC-2026-000123
create or replace function public.assign_transaction_ref() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_seq bigint;
begin
  if new.ref_no is not null and new.ref_no <> '' then
    return new;
  end if;

  v_prefix := 'TT-' || upper(substr(new.type::text, 1, 3)) || '-' || to_char(new.occurred_on, 'YYYY');

  select count(*) + 1 into v_seq
    from transactions
   where ref_no like v_prefix || '-%';

  -- Retry on the rare race between two concurrent inserts.
  while exists (select 1 from transactions where ref_no = v_prefix || '-' || lpad(v_seq::text, 6, '0')) loop
    v_seq := v_seq + 1;
  end loop;

  new.ref_no := v_prefix || '-' || lpad(v_seq::text, 6, '0');
  return new;
end;
$$;

create trigger transactions_ref
  before insert on public.transactions
  for each row execute function public.assign_transaction_ref();

create table public.donation_campaigns (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_am       text not null,
  summary_am    text,
  goal_amount   numeric(14,2),
  currency      text not null default 'ETB',
  cover_media_id uuid references public.media_files (id) on delete set null,
  starts_on     date,
  ends_on       date,
  account_id    uuid references public.finance_accounts (id) on delete set null,
  category_id   uuid references public.finance_categories (id) on delete set null,
  is_active     boolean not null default true,
  is_featured   boolean not null default false,
  state         public.content_state not null default 'published',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.donations (
  id             uuid primary key default gen_random_uuid(),
  receipt_no     text unique,
  campaign_id    uuid references public.donation_campaigns (id) on delete set null,
  member_id      uuid references public.members (id) on delete set null,
  application_id uuid references public.applications (id) on delete set null,
  donor_name_am  text not null,
  donor_name_en  text,
  phone          text,
  email          text,
  in_honour_of   text,
  amount         numeric(14,2) not null check (amount > 0),
  currency       text not null default 'ETB',
  method         public.payment_method not null default 'cash',
  purpose_am     text,
  is_pledge      boolean not null default false,
  pledged_on     date,
  due_on         date,
  received_on    date,
  transaction_id uuid references public.transactions (id) on delete set null,
  source         text not null default 'website' check (source in ('website','erp','cash','event','phone')),
  status         text not null default 'pledged'
                  check (status in ('pledged','partially_paid','paid','cancelled','refunded')),
  notes        text,
  recorded_by    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index donations_campaign_idx on public.donations (campaign_id, status);
create index donations_date_idx on public.donations (created_at desc);

-- Marking a donation paid records the income transaction, and the link is kept
-- in one place so reports never double-count.
create or replace function public.donations_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tx uuid;
begin
  if new.status = 'paid' and new.transaction_id is null then
    insert into transactions (type, amount, currency, occurred_on, description_am, method,
                              category_id, account_id, member_id, status, recorded_by)
    values ('income', new.amount, new.currency, coalesce(new.received_on, current_date),
            'ለግስና ' || new.donor_name_am || coalesce(' – ' || new.purpose_am, ''), new.method,
            (select category_id from donation_campaigns where id = new.campaign_id),
            (select account_id from donation_campaigns where id = new.campaign_id),
            new.member_id, 'approved', new.recorded_by)
    returning id into v_tx;

    update donations set transaction_id = v_tx where id = new.id;
  end if;
  return new;
end;
$$;

create trigger donations_sync_transaction
  after insert or update of status on public.donations
  for each row execute function public.donations_after_change();

create table public.budgets (
  id              uuid primary key default gen_random_uuid(),
  period_label_am text not null,                        -- ፳፻፲፱ ሥ.ዓ
  fiscal_year     integer,
  department_id   uuid references public.departments (id) on delete set null,
  category_id     uuid references public.finance_categories (id) on delete set null,
  account_id      uuid references public.finance_accounts (id) on delete set null,
  planned_amount  numeric(14,2) not null default 0 check (planned_amount >= 0),
  approved_amount numeric(14,2),
  currency        text not null default 'ETB',
  status          text not null default 'draft' check (status in ('draft','submitted','approved','rejected','closed')),
  notes           text,
  created_by      uuid references public.profiles (id) on delete set null,
  approved_by     uuid references public.profiles (id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index budgets_line_unique on public.budgets
  (period_label_am, department_id, category_id, account_id) nulls not distinct;

create table public.finance_settings (
  key   text primary key,
  value jsonb not null,
  label_am text,
  updated_at timestamptz not null default now()
);

create trigger accounts_touch    before update on public.finance_accounts  for each row execute function public.touch_updated_at();
create trigger transactions_touch before update on public.transactions     for each row execute function public.touch_updated_at();
create trigger donations_touch   before update on public.donations         for each row execute function public.touch_updated_at();
create trigger budgets_touch     before update on public.budgets           for each row execute function public.touch_updated_at();
create trigger campaigns_touch   before update on public.donation_campaigns for each row execute function public.touch_updated_at();
