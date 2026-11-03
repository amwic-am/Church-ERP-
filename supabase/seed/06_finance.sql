-- 06 · Finance — campaigns, donations, the ledger and the annual budget
--
-- The chart of accounts and the category list are configured by migration 1700;
-- this file supplies the movement. Twelve months of recurring income and expense,
-- real donations against live campaigns and a budget line per department, so the
-- dashboard, the variance report and the approval queue all have something to
-- compute. `transactions.ref_no` is left to the trigger and a paid donation
-- records its own income row through `donations_sync_transaction`.
--
-- Applied with:  supabase db query --linked -f supabase/seed/06_finance.sql

begin;

drop table if exists who, dept, fin_series;

create temporary table who as
select p.id, split_part(p.email, '@', 1) as role
  from public.profiles p
 where p.email like '%@tekleteoflos.demo';

create temporary table dept as
select d.id, d.slug from public.departments d;

-- ─── campaigns ───────────────────────────────────────────────────────────────
insert into public.donation_campaigns (slug, name_am, summary_am, goal_amount, currency,
                                       cover_media_id, starts_on, ends_on,
                                       account_id, category_id, is_active, is_featured, state)
select v.slug, v.name_am, v.summary_am, v.goal, 'ETB',
       (select id from public.media_files where storage_path = 'demo/' || v.cover || '.jpg'),
       current_date - (v.since_days), current_date + (v.until_days),
       (select id from public.finance_accounts where code = v.account),
       (select id from public.finance_categories where name_am = v.category and kind = 'income'),
       v.active, v.featured, 'published'::public.content_state
  from (values
    ('school-building', 'የት/ቤት ግንባታና የክፍል ዕርዳታ',
     'ሰባት የትምህርት ክፍሎችና የመጻሕፍት ማዕከል ለመጨረስ የሚዘጋጅ ልዩ ልገሳ።',
     18500000, 420, -210, true, true, 'church', '6000', 'ልዩ ልገሳ'),
    ('teacher-support', 'የመምህራን ዕገታና የትምህርት ግብዣ',
     'አሠራሩን በማያቋርጡ መምህራን ዕገታና ለተማሪዎች መጻሕፍት የሚውል ወርሃዊ ድጋፍ።',
     4200000, 360, 90, true, true, 'choir', '4100', 'ልገሳ (እጅ)'),
    ('food-support', 'ለቸገሪ ቤተ ሰቦች የምግብ ዕርዳታ',
     'በየወሩ ለመኅላ ሁለት መቶ ቤተ ሰቦች የሚሰጥ ስንዴና በዘይት ዕርዳታ።',
     3600000, 240, 120, true, false, 'outreach', '6100', 'ልዩ ልገሳ'),
    ('hymn-instruments', 'ለኮረብ ቡድን የመሣልና የከበሮ ዕቃ',
     'የዕገታና የዋዜማ መሣሪያ ጥገና ለሚቀጥሉት ኮረብ ቡድኖች የሚዘጋጅ ዕርዳታ።',
     1400000, 150, 30, true, false, 'kebero', '4100', 'የመዝሙር ቀን ገቢ'),
    ('library-expansion', 'የመጻሕፍት ማዕከል ማስፋፊያ (ተጠናቋል)',
     'የአባቶች ትንሣኤና የትምህርት መጻሕፍት ለማዕከሉ የተገኘ ቀደምት ዕርዳታ።',
     900000, 180, -30, false, false, 'library', '4100', 'ልገሳ (እጅ)')
  ) as v(slug, name_am, summary_am, goal, since_days, until_days, active, featured, cover, account, category)
on conflict (slug) do nothing;

-- ─── the ledger ──────────────────────────────────────────────────────────────
-- One line per recurring flow, twelve months back. Amounts vary by a fixed
-- pattern rather than random(), so re-running the seed gives the same figures.
create temporary table fin_series (
  key       text,
  type      text,
  account   text,
  to_account text,
  category  text,
  dept      text,
  day       integer,
  base      numeric(14,2),
  what      text,
  how       text
);
insert into fin_series (key, type, account, to_account, category, dept, day, base, what, how) values
  ('tithe',       'income',  '1000', null, 'ልገሳ (እጅ)',        null,                 5, 184000, 'የእሁድ ልገሳ ከጉባኤ በሁለተኛውና በሦስተኛው ዕገታ የተሰበሰበ', 'cash'),
  ('sunday-gift', 'income',  '1000', null, 'የመዝሙር ቀን ገቢ',     'mezmur',             6,  62000, 'የመዝሙር ቀንና የኮረብ ቡድን አገልግሎት ልገሳ', 'cash'),
  ('term-gift',   'income',  '1100', null, 'ልዩ ልገሳ',          'spiritual-education', 12, 240000, 'በማኅበረ ሐዋርያት የተሰበሰበ የወርሃ ልዩ ልገሳ', 'bank_transfer'),
  ('enrol',       'income',  '1000', null, 'የተማሪ ምዝገባ',      'spiritual-education', 20,  38000, 'ለተማሪዎች መጻሕፍትና የመዝገብ እቃ የተሰበሰበ ግብዣ', 'cash'),
  ('draw',        'income',  '1000', null, 'የዕጣ ፈንታ ገቢ',      'volunteer-services',  26,  74000, 'በበዓልና በክስተት የተዘጋጀ የዕጣ ፈንታ ገቢ', 'cash'),
  ('stipend',     'expense', '1000', null, 'የመምህራን ዕገታ',      'spiritual-education', 28, 156000, 'ለዐሥራ ሁለት መምህራን የወርሃ ዕገታና የትምህርት ድጋፍ', 'cash'),
  ('books',       'expense', '1100', null, 'መጻሕፍትና ትምህርት ግብዣ', 'spiritual-education', 9,  88000, 'የተማሪ መጻሕፍትና የዕርሳስ ቅጂ ግዢ', 'bank_transfer'),
  ('power',       'expense', '1000', null, 'ኤሌክትሪክ/ውሃ/ኢንተርኔት', null,                15,  21500, 'የወርሃ ኤሌክትሪክ፣ ውሃና የኢንተርኔት አገልግሎት', 'bank_transfer'),
  ('relief',      'expense', '1000', null, 'ማህበራዊ ዕርዳታ',      'social-affairs',      18, 118000, 'ለቸገሪ ቤተ ሰቦች የወርሃ ስንዴና በዘይት ዕርዳታ', 'cash'),
  ('transport',   'expense', '1000', null, 'ጉዞና ትራንስፖርት',     'evangelism',          22,  43000, 'ለወንጌል ሥርጭትና ለቤተ ሰብ ጉብኝት የተደረገ ጉዞ ወጪ', 'cash'),
  ('vessels',     'expense', '1100', null, 'የሥርዓት ዕቃ ግብይት',   'arts-drama',          25,  36000, 'ለዕገታና ለሥርዓት የተገዛ መሣሪያና የመሐልዮት ጥገና', 'mobile_money'),
  ('training',    'expense', '1100', null, 'ሥልጠናና ኮንፈረንስ',    'spiritual-education', 11,  64000, 'የመምህራን ዝግጅት ሥልጠናና የዕርሳስ ዝግጅት ወጪ', 'bank_transfer'),
  ('banking',     'transfer','1000', '1100', null,              null,                  2,  300000, 'የጥሬ ሳጥን ልገሳ ወደ ባንክ ማዕከል ማስተላለፍ', 'bank_transfer');

insert into public.transactions (type, account_id, to_account_id, category_id, department_id,
                                 amount, currency, occurred_on, description_am, method, status,
                                 recorded_by, approved_by, approved_at)
select s.type::public.transaction_type, a.id, ta.id, c.id, (select id from dept where slug = s.dept),
       round(s.base * (1 + (((m.n * 7 + s.day) % 17) - 8) / 100.0)::numeric, 2),
       'ETB',
       (date_trunc('month', current_date) - make_interval(months => m.n)
        + make_interval(days => s.day - 1))::date,
       s.what, s.how::public.payment_method,
       case when m.n <= 1 then 'pending_approval' else 'approved' end,
       fin.id,
       case when m.n <= 1 then null else ap.id end,
       case when m.n <= 1 then null
            else (date_trunc('month', current_date) - make_interval(months => m.n)
                  + make_interval(days => s.day + 1))::timestamptz end
  from fin_series s
  cross join generate_series(0, 11) as m(n)
  left join public.finance_accounts a  on a.code = s.account
  left join public.finance_accounts ta on ta.code = s.to_account
  left join public.finance_categories c on c.name_am = s.category
  join who fin on fin.role = 'finance'
  join who ap  on ap.role = 'approver'
 where not exists (select 1 from public.transactions t
                     where t.description_am = s.what
                       and t.occurred_on = (date_trunc('month', current_date)
                                            - make_interval(months => m.n)
                                            + make_interval(days => s.day - 1))::date);

-- Three rows in the states the finance screens filter on: a draft the treasurer
-- has not sent, one awaiting the approver and one already rejected.
insert into public.transactions (type, account_id, category_id, department_id, amount, currency,
                                 occurred_on, description_am, method, status,
                                 recorded_by, approved_by, approved_at, rejection_note)
select v.type::public.transaction_type, a.id, c.id, (select id from dept where slug = v.dept),
       v.amount, 'ETB', current_date - v.age_days, v.what, v.how::public.payment_method,
       v.status, fin.id,
       case when v.status = 'rejected' then ap.id end,
       case when v.status = 'rejected' then (current_timestamp - interval '2 days') end,
       case when v.status = 'rejected' then 'የታዘዘው እቃ ዝርዝርና ዋጋ ማብራሪያ ስላልተያያዘ ወደ ገምጋሚ ተመላሽ።' end
  from (values
    ('expense', 'arts-drama',          'የሥርዓት ዕቃ ግብይት',    54000, 'የበዓል መሐልዮትና የዕገታ ልብስ ማዘዘዝ',           'cash',         'draft',            3),
    ('expense', 'social-affairs',      'ማህበራዊ ዕርዳታ',      132000, 'ለተጨማሪ መፃ አሥራ ቤተ ሰቦች የዕርዳታ ዝግጅት',   'bank_transfer', 'pending_approval',  1),
    ('expense', 'spiritual-education', 'መጻሕፍትና ትምህርት ግብዣ', 96000, 'ለሁለተኛው ዙር የተገዙ የመምህራን መጻሕፍት',        'mobile_money',  'rejected',          8)
  ) as v(type, dept, category, amount, what, how, status, age_days)
  left join public.finance_accounts a on a.code = '1000'
  left join public.finance_categories c on c.name_am = v.category and c.kind = 'expense'
  join who fin on fin.role = 'finance'
  join who ap  on ap.role = 'approver'
 where not exists (select 1 from public.transactions t where t.description_am = v.what);

-- ─── donations ───────────────────────────────────────────────────────────────
-- The donor list is the same directory the rest of the demo uses, so a gift
-- against a campaign also lands on the member's giving history. Every row is
-- given a fixed id: `on conflict (id)` is the only re-run guard a table with no
-- natural key has, and it stops the paid rows from re-firing the trigger that
-- writes their income transaction.
drop table if exists donor_ref;
create temporary table donor_ref (key text, member_id uuid, name_am text, phone text, email text);
insert into donor_ref (key, member_id, name_am, phone, email)
select 'm' || m.i, m.id, m.full_name_am, m.phone, m.email
  from (select row_number() over (order by full_name_am) as i, id, full_name_am, phone, email
          from public.members
         where status = 'active'
         order by full_name_am
         limit 20) m;

insert into public.donations (id, campaign_id, member_id, donor_name_am, phone, email,
                              in_honour_of, amount, currency, method, purpose_am,
                              is_pledge, pledged_on, due_on, received_on, source, status,
                              notes, recorded_by)
select v.id,
       (select id from public.donation_campaigns where slug = v.campaign),
       r.member_id,
       coalesce(r.name_am, v.ext_name),
       r.phone, r.email,
       nullif(v.in_honour, ''),
       v.amount, 'ETB', v.meth::public.payment_method, nullif(v.purpose, ''),
       v.st = 'pledged',
       case when v.st in ('pledged', 'partially_paid') then current_date - v.days_ago end,
       case when v.st = 'pledged' then current_date - v.days_ago + 45 end,
       case when v.st in ('paid', 'partially_paid') then current_date - v.days_ago end,
       v.src, v.st,
       nullif(v.note, ''),
       case when v.src = 'website' then null else (select id from who where role = 'finance') end
  from (values
    ('ac300000-0000-4000-8000-000000000001'::uuid, 'school-building',   'm1',  null,          250000, 'የክፍል ግንባታ ልገሳ',        'bank_transfer', 'erp',    'paid',            86,  '', 'ለአባት ልደት ሥርዓተ ኣዕላት ቤተሰብ', ''),
    ('ac300000-0000-4000-8000-000000000002'::uuid, 'school-building',   'm2',  null,          120000, 'የመጻሕፍት ክፍል መሣሪያ',      'mobile_money',  'website','paid',            74,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000003'::uuid, 'school-building',   null,  'አቶ ዓሰፈ ተስፋዬ', 400000, 'የጣሪያ ሽፋን ዕጣ',          'bank_transfer', 'phone', 'paid',            61,  '', 'በፍቅረ እግዚአብሔር', ''),
    ('ac300000-0000-4000-8000-000000000004'::uuid, 'school-building',   'm3',  null,           75000, 'የደረጃ ማገጃ ግንባታ',        'cash',          'event',  'paid',            52,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000005'::uuid, 'school-building',   'm4',  null,          180000, '',                       'check',         'erp',    'partially_paid',  40,  '', '', 'ከሁለት ክፍያ ውስጥ አንዱ ብቻ የተረጋገጠ'),
    ('ac300000-0000-4000-8000-000000000006'::uuid, 'school-building',   null,  'ወ/ሮ ሠለመነ ተምላህ', 500000, 'ለጉባኤ ዕርዳታ',         'bank_transfer', 'website','paid',            27,  '', 'ለቤተ ሰብ ሐሳብ', ''),
    ('ac300000-0000-4000-8000-000000000007'::uuid, 'school-building',   'm5',  null,           45000, 'የመስኮት ብረት ማጠናቀቂያ',    'mobile_money',  'erp',    'pledged',         12,  '', '', 'ክፍያው በመጪው ወር ላይ ይጀምራል'),
    ('ac300000-0000-4000-8000-000000000008'::uuid, 'school-building',   'm6',  null,           30000, '',                       'cash',          'website','cancelled',        95,  '', '', 'ልገሳው ወደ ቀጥተኛ ዕርዳታ ተቀየረ'),

    ('ac300000-0000-4000-8000-000000000009'::uuid, 'teacher-support',   'm7',  null,           96000, 'የመምህራን ዕገታ ድጋፍ',      'bank_transfer', 'erp',    'paid',            88,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000010'::uuid, 'teacher-support',   'm8',  null,           24000, '',                       'cash',          'event',  'paid',            70,  '', 'ለዕገታ መምህራን', ''),
    ('ac300000-0000-4000-8000-000000000011'::uuid, 'teacher-support',   null,  'አቶ ገብረ ክርስቶስ',  60000, 'የመጻሕፍት ግብዣ',         'mobile_money',  'website','paid',            58,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000012'::uuid, 'teacher-support',   'm9',  null,           18000, 'ለሥልጠና ወጪ',             'cash',          'erp',    'paid',            44,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000013'::uuid, 'teacher-support',   'm10', null,           36000, '',                       'check',         'phone',  'partially_paid',  30,  '', '', 'የሁለተኛው ክፍያ በመጠበቅ ላይ'),
    ('ac300000-0000-4000-8000-000000000014'::uuid, 'teacher-support',   'm11', null,           15000, 'ወርሃዊ ዕገታ',              'mobile_money',  'website','pledged',          6,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000015'::uuid, 'teacher-support',   null,  'ወ/ሮ አልማዝ በላህ',  27500, 'የተማሪ ወጥብ',            'cash',          'event',  'paid',             3,  '', '', ''),

    ('ac300000-0000-4000-8000-000000000016'::uuid, 'food-support',      'm12', null,           84000, 'የስንዴ ዕርዳታ',            'bank_transfer', 'erp',    'paid',            77,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000017'::uuid, 'food-support',      'm13', null,           22000, '',                       'cash',          'event',  'paid',            65,  '', 'ለነፍሰ ጽዮን', ''),
    ('ac300000-0000-4000-8000-000000000018'::uuid, 'food-support',      null,  'አቶ ሚካኤል አበበ',   150000, 'ለመኅላ ዕርዳታ',           'bank_transfer', 'website','paid',            49,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000019'::uuid, 'food-support',      'm14', null,           16500, 'የበዘይት ጉበት',              'mobile_money',  'erp',    'paid',            35,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000020'::uuid, 'food-support',      'm15', null,           28000, '',                       'cash',          'cash',   'partially_paid',   19,  '', '', 'ወርሃዊ ዕርዳታ በከፊል ተከፋይ'),
    ('ac300000-0000-4000-8000-000000000021'::uuid, 'food-support',      'm16', null,           40000, 'ለበዓል ዕርዳታ',            'check',         'phone',  'pledged',          9,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000022'::uuid, 'food-support',      null,  'በይዘት ማህበር',      72000, 'የምግብ ዕርዳታ',           'bank_transfer', 'erp',    'paid',             2,  '', '', ''),

    ('ac300000-0000-4000-8000-000000000023'::uuid, 'hymn-instruments',  'm17', null,           18000, 'የከበሮ ጥገና',              'cash',          'event',  'paid',            56,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000024'::uuid, 'hymn-instruments',  'm18', null,            9500, 'የዋዜማ ገዢ',               'mobile_money',  'website','paid',            38,  '', 'ለኮረብ ቡድን', ''),
    ('ac300000-0000-4000-8000-000000000025'::uuid, 'hymn-instruments',  null,  'አቶ ተድላ ወልዴ',    35000, '',                       'bank_transfer', 'erp',    'paid',            21,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000026'::uuid, 'hymn-instruments',  'm19', null,            7800, '',                       'cash',          'cash',   'pledged',          4,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000027'::uuid, 'hymn-instruments',  'm20', null,           12600, 'የእገታ ልብስ',              'mobile_money',  'website','cancelled',       44,  '', '', 'ልገሳው ወደ ት/ቤት መጻሕፍት ተባባሪ'),

    ('ac300000-0000-4000-8000-000000000028'::uuid, 'library-expansion', 'm1',  null,           55000, 'የአባቶች ትንሣኤ መጻሕፍት',    'bank_transfer', 'erp',    'paid',           150,  '', '', ''),
    ('ac300000-0000-4000-8000-000000000029'::uuid, 'library-expansion', null,  'ወ/ሮ ወረር ሰውኦም',  38000, '',                       'cash',          'event',  'paid',           132,  '', 'ለንስኤ ቤተሰብ', ''),
    ('ac300000-0000-4000-8000-000000000030'::uuid, 'library-expansion', 'm5',  null,           21000, 'የማዳረሻ ዕቃ',              'check',         'phone',  'paid',           118,  '', '', '')
  ) as v(id, campaign, donor_key, ext_name, amount, purpose, meth, src, st, days_ago, note, in_honour)
  left join donor_ref r on r.key = v.donor_key
on conflict (id) do nothing;

-- A partially paid gift has real money in the till, so it needs its own income
-- row. The trigger only handles fully paid donations, so the partial is booked
-- here and linked back afterwards.
insert into public.transactions (type, account_id, category_id, amount, currency, occurred_on,
                                 description_am, method, status, member_id, recorded_by,
                                 approved_by, approved_at)
select 'income', cp.account_id, cp.category_id,
       round((d.amount * 0.45)::numeric, 2), d.currency,
       coalesce(d.received_on, current_date),
       'ለግስና ' || d.donor_name_am || ' – የከፊል ክፍያ', d.method, 'approved',
       d.member_id, (select id from who where role = 'finance'),
       (select id from who where role = 'approver'), current_timestamp
  from public.donations d
  join public.donation_campaigns cp on cp.id = d.campaign_id
 where d.status = 'partially_paid' and d.transaction_id is null
   and not exists (select 1 from public.transactions t
                    where t.description_am = 'ለግስና ' || d.donor_name_am || ' – የከፊል ክፍያ');

update public.donations d
   set transaction_id = (select t.id from public.transactions t
                          where t.description_am = 'ለግስና ' || d.donor_name_am || ' – የከፊል ክፍያ'
                          order by t.created_at limit 1)
 where d.status = 'partially_paid'
   and d.transaction_id is null;

-- ─── the annual budget ───────────────────────────────────────────────────────
-- One planned line per department plus the church-wide income and relief lines,
-- in the three states the budget screens report on: approved, submitted, draft.
insert into public.budgets (id, period_label_am, fiscal_year, department_id, category_id,
                            account_id, planned_amount, approved_amount, currency, status,
                            notes, created_by, approved_by, approved_at)
select v.id, v.period, v.year,
       (select id from dept where slug = v.dept),
       (select id from public.finance_categories
         where name_am = v.category and kind = v.kind),
       (select id from public.finance_accounts where code = v.account),
       v.planned,
       case when v.st = 'approved' then v.approved end,
       'ETB', v.st, nullif(v.note, ''),
       (select id from who where role = 'finance'),
       case when v.st = 'approved' then (select id from who where role = 'approver') end,
       case when v.st = 'approved' then current_timestamp - interval '20 days' end
  from (values
    ('ac400000-0000-4000-8000-000000000001'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'spiritual-education', 'መጻሕፍትና ትምህርት ግብዣ', 'expense', '5000', 1056000,  980000, 'approved', 'ለአሥራ ሁለት ክፍሎች የመጻሕፍትና የዕርሳስ ወጪ'),
    ('ac400000-0000-4000-8000-000000000002'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'spiritual-education', 'የመምህራን ዕገታ',        'expense', '5000', 1872000, 1800000, 'approved', 'የመምህራን ዕገታ በዓመቱ ዐሥራ ሁለት ወር'),
    ('ac400000-0000-4000-8000-000000000003'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'spiritual-education', 'ሥልጠናና ኮንፈረንስ',      'expense', '5000',  480000,  420000, 'approved', ''),
    ('ac400000-0000-4000-8000-000000000004'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'mezmur',              'ሥልጠናና ኮንፈረንስ',      'expense', '5000',  260000,  null,   'submitted', 'የኮረብ ቡድን ዝግጅት ሥልጠና ጥያቄ'),
    ('ac400000-0000-4000-8000-000000000005'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'mezmur',              'የሥርዓት ዕቃ ግብይት',     'expense', '5100',  430000,  380000, 'approved', 'የመሣልና የከበሮ ጥገና'),
    ('ac400000-0000-4000-8000-000000000006'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'evangelism',          'ጉዞና ትራንስፖርት',        'expense', '5100',  516000,  460000, 'approved', 'የወንጌል ሥርጭት ጉብኝቶች'),
    ('ac400000-0000-4000-8000-000000000007'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'social-affairs',      'ማህበራዊ ዕርዳታ',         'expense', '5100', 1416000, 1260000, 'approved', 'ለመኅሁ ዐሥራ ሁለት ወር የምግብ ዕርዳታ'),
    ('ac400000-0000-4000-8000-000000000008'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'arts-drama',          'የሥርዓት ዕቃ ግብይት',     'expense', '5100',  300000,  null,   'submitted', 'የበዓል ልብስና መሐልዮት ግዢ ጥያቄ'),
    ('ac400000-0000-4000-8000-000000000009'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'media',               'ኤሌክትሪክ/ውሃ/ኢንተርኔት',   'expense', '5100',  258000,  null,   'draft',    ''),
    ('ac400000-0000-4000-8000-000000000010'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, 'volunteer-services',  'ጉዞና ትራንስፖርት',        'expense', '5100',  144000,  null,   'draft',    'የአገልግሎት ቡድን ዕጣ ፈንታ ዝግጅት'),
    ('ac400000-0000-4000-8000-000000000011'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, null,                  'ልገሳ (እጅ)',            'income',  '4100', 2208000, 2050000, 'approved', 'በእሁድ ዕገታ የሚገባ የጉባኤ ልገሳ'),
    ('ac400000-0000-4000-8000-000000000012'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, null,                  'የተማሪ ምዝገባ',          'income',  '4200',  456000,  420000, 'approved', ''),
    ('ac400000-0000-4000-8000-000000000013'::uuid, '፳፻፲፱ ሥ.ዓ', 2019, null,                  'ልዩ ልገሳ',              'income',  '6000', 3600000,  null,   'submitted', 'የግንባታ ማዕከል የልገሳ ዒላማ'),
    ('ac400000-0000-4000-8000-000000000014'::uuid, '፳፻፲፫ ሥ.ዓ', 2013, 'spiritual-education', 'የመምህራን ዕገታ',        'expense', '5000', 1440000, 1440000, 'approved', 'ያለፈው ዓመት የተዘጋ በጀት')
  ) as v(id, period, year, dept, category, kind, account, planned, approved, st, note)
on conflict (id) do nothing;

commit;

select 'donation_campaigns' as subject, count(*) as rows,
       count(*) filter (where is_active) as active
  from public.donation_campaigns
union all
select 'donations', count(*),
       count(*) filter (where status = 'paid')
  from public.donations
union all
select 'transactions', count(*),
       count(*) filter (where status = 'pending_approval')
  from public.transactions
union all
select 'budgets', count(*),
       count(*) filter (where status = 'approved')
  from public.budgets
union all
select 'transaction total (ETB)',
       coalesce(sum(amount), 0)::numeric::bigint,
       coalesce(sum(amount) filter (where type = 'income'), 0)::numeric::bigint
  from public.transactions where status = 'approved';
