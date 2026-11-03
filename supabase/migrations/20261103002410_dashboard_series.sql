-- ============================================================
-- 241 · dashboard_series — the monthly curves the ERP charts plot
--
-- `dashboard_kpis()` answers "what is true right now". A time-series chart needs
-- one value per month, built the same way, so the line for this month lands on
-- the same number as the card above it:
--
--   income / expense   → `transactions`, approved rows only, bucketed on
--                        `occurred_on` (exactly `dashboard_kpis()` and
--                        `finance_summary()`).
--   donations          → `donations`, `paid`/`partially_paid`, bucketed on
--                        `created_at` (again as `finance_summary()` reads it).
--                        A paid donation also books an income transaction
--                        (`donations_sync_transaction`), so this line is a
--                        SUBSET of income and is never added to it.
--   attendance_rate    → `attendance_records` joined to `attendance_sessions` on
--                        `session_id`, present+late over every mark taken that
--                        month — the same ratio the KPI card computes over 60
--                        days, just per month.
--   students_active    → cumulative active `student_profiles`, each counted from
--                        the month it enrolled (`enrolled_on`, else `created_at`)
--                        onward: a growth curve, not a snapshot.
--   events / news      → published rows dated into the month they went out.
--
-- Buckets are Gregorian months (`date_trunc('month', …)` over the dates already
-- stored) because that is how the ledger, the bank records and the KPI cards are
-- cut. The screen renders the labels in the Ethiopian calendar from `month_start`
-- with `src/lib/ethiopian.ts`, which is where every other Amharic date string in
-- the platform is built; `period` is the stable `YYYY-MM` key for that month.
--
-- Cost: one `generate_series` of month buckets, then a single grouped pass per
-- metric joined back on the bucket's first day. Months with nothing in them come
-- back as zero rather than being dropped, so a chart never skips a period.
--
-- SECURITY DEFINER like `dashboard_kpis()`: a cross-class, cross-account
-- aggregate is not something per-row policies can serve. Money columns are still
-- zeroed for a caller who does not hold `finance.read`, so the aggregate cannot
-- leak what the ledger screen itself would hide.
-- ============================================================

create or replace function public.dashboard_series(p_months integer default 12)
returns table (
  period          text,     -- 'YYYY-MM' — the Gregorian bucket key
  month_start     date,     -- first day of the bucket; the client renders it in Ge'ez
  students_active integer,  -- active students enrolled on or before that month end
  income          numeric,  -- approved income transactions, in that month
  expense         numeric,  -- approved expense transactions, in that month
  donations       numeric,  -- paid/partially-paid donations, in that month
  attendance_rate numeric,  -- percent present or late, 0 when nothing was taken
  events          integer,  -- published events starting in that month
  news            integer   -- published news released in that month
)
language sql stable security definer set search_path = public as $$
  with params as (
    -- A chart cannot draw 600 months; a caller who asks for less than one gets one.
    select greatest(least(coalesce(p_months, 12), 60), 1) as months
  ),
  win as (
    select gs::date as month_start
      from params p
      cross join lateral generate_series(
        date_trunc('month', current_date) - make_interval(months => p.months - 1),
        date_trunc('month', current_date),
        interval '1 month'
      ) as gs
  ),
  buckets as (
    select w.month_start,
           to_char(w.month_start, 'YYYY-MM') as period,
           (w.month_start + interval '1 month' - interval '1 day')::date as month_end
      from win w
  ),
  floor_of as (
    select min(b.month_start) as first_month from buckets b
  ),
  can_money as (
    select public.has_permission('finance.read') as allowed
  ),

  -- One pass over the approved ledger for both money lines.
  ledger as (
    select date_trunc('month', t.occurred_on)::date as month_start,
           sum(t.amount) filter (where t.type = 'income')  as income,
           sum(t.amount) filter (where t.type = 'expense') as expense
      from transactions t, floor_of f
     where t.status = 'approved'
       and t.occurred_on >= f.first_month
     group by 1
  ),

  gifted as (
    select date_trunc('month', d.created_at::date)::date as month_start,
           sum(d.amount) as donations
      from donations d, floor_of f
     where d.status in ('paid', 'partially_paid')
       and d.created_at::date >= f.first_month
     group by 1
  ),

  marked as (
    select date_trunc('month', s.taken_on)::date as month_start,
           round(100.0 * count(*) filter (where r.status in ('present', 'late'))
                 / nullif(count(*), 0), 1) as attendance_rate
      from attendance_records r
      join attendance_sessions s on s.id = r.session_id
      join floor_of f on s.taken_on >= f.first_month
     group by 1
  ),

  -- Joins per month over all history, then summed up to each bucket: the
  -- cumulative head count without re-reading the table once per month.
  enrolments as (
    select date_trunc('month', coalesce(sp.enrolled_on, sp.created_at::date))::date as month_start,
           count(*) as joined
      from student_profiles sp
     where sp.status = 'active'
     group by 1
  ),
  heads as (
    select b.month_start,
           coalesce((select sum(e.joined) from enrolments e where e.month_start <= b.month_end), 0)::int
             as students_active
      from buckets b
  ),

  held as (
    select date_trunc('month', x.on_date)::date as month_start, count(*)::int as events
      from (select e.starts_at::date as on_date
              from events e
             where e.state = 'published') x
      join floor_of f on x.on_date >= f.first_month
     group by 1
  ),
  posted as (
    select date_trunc('month', y.on_date)::date as month_start, count(*)::int as news
      from (select coalesce(n.published_at, n.created_at)::date as on_date
              from news n
             where n.state = 'published') y
      join floor_of f on y.on_date >= f.first_month
     group by 1
  )

  select b.period,
         b.month_start,
         coalesce(hs.students_active, 0) as students_active,
         case when cm.allowed then coalesce(l.income,   0) else 0 end as income,
         case when cm.allowed then coalesce(l.expense,  0) else 0 end as expense,
         case when cm.allowed then coalesce(g.donations, 0) else 0 end as donations,
         coalesce(mk.attendance_rate, 0) as attendance_rate,
         coalesce(h.events, 0) as events,
         coalesce(p.news, 0) as news
    from buckets b
    left join ledger   l  on l.month_start  = b.month_start
    left join gifted   g  on g.month_start  = b.month_start
    left join marked   mk on mk.month_start = b.month_start
    left join heads    hs on hs.month_start = b.month_start
    left join held     h  on h.month_start  = b.month_start
    left join posted   p  on p.month_start  = b.month_start
   cross join can_money cm
   order by b.month_start;
$$;

comment on function public.dashboard_series(integer) is
  'One row per Gregorian month for the last p_months months, on the same definitions as dashboard_kpis(); money columns are zeroed without finance.read.';

-- The dashboard is staff-only: the series is granted to the same role that can
-- already call dashboard_kpis(), and nothing reaches anon.
revoke all on function public.dashboard_series(integer) from public;
grant execute on function public.dashboard_series(integer) to authenticated, service_role;
