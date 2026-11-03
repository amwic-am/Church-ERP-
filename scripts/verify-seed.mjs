// Applies every migration and then every supabase/seed/*.sql to a throwaway
// PGlite database, with the demo sign-in accounts stubbed into auth.users.
// Run this before pushing a seed file at the live project: it is the only place
// a SQL mistake in a seed is cheap to find.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { openDb, applyMigrations, query } from './pg.mjs';

export const SEED_DIR = path.resolve(import.meta.dirname, '../supabase/seed');

const DEMO_ROLES = [
  'superadmin', 'registrar', 'finance', 'approver', 'editor', 'approver-content',
  'media', 'teacher', 'dept', 'student', 'parent', 'member',
];

const COUNTS = [
  ['members', 'public.members'],
  ['student_profiles', 'public.student_profiles'],
  ['teacher_profiles', 'public.teacher_profiles'],
  ['guardians', 'public.guardians'],
  ['volunteer_profiles', 'public.volunteer_profiles'],
  ['classes', 'public.classes'],
  ['class_subjects', 'public.class_subjects'],
  ['class_teachers', 'public.class_teachers'],
  ['curriculum_units', 'public.curriculum_units'],
  ['student_enrollments', 'public.student_enrollments'],
  ['class_sessions', 'public.class_sessions'],
  ['attendance_sessions', 'public.attendance_sessions'],
  ['attendance_records', 'public.attendance_records'],
  ['exams', 'public.exams'],
  ['exam_results', 'public.exam_results'],
  ['lesson_plans', 'public.lesson_plans'],
  ['learning_materials', 'public.learning_materials'],
  ['student_id_cards', 'public.student_id_cards'],
  ['issued_certificates', 'public.issued_certificates'],
  ['promotion_items', 'public.promotion_items'],
  ['news', 'public.news'],
  ['events', 'public.events'],
  ['event_registrations', 'public.event_registrations'],
  ['sermons', 'public.sermons'],
  ['mezmur', 'public.mezmur'],
  ['publications', 'public.publications'],
  ['media_files', 'public.media_files'],
  ['gallery_albums', 'public.gallery_albums'],
  ['album_media', 'public.album_media'],
  ['leadership', 'public.leadership'],
  ['faqs', 'public.faqs'],
  ['org_units', 'public.org_units'],
  ['user_roles', 'public.user_roles'],
  ['donation_campaigns', 'public.donation_campaigns'],
  ['donations', 'public.donations'],
  ['transactions', 'public.transactions'],
  ['budgets', 'public.budgets'],
  ['v_public_classes', 'public.v_public_classes'],
  ['v_public_news', 'public.v_public_news'],
  ['v_public_events', 'public.v_public_events'],
  ['v_public_sermons', 'public.v_public_sermons'],
  ['v_public_mezmur', 'public.v_public_mezmur'],
  ['v_public_media', 'public.v_public_media'],
  ['v_public_albums', 'public.v_public_albums'],
  ['v_public_leadership', 'public.v_public_leadership'],
  ['v_public_faqs', 'public.v_public_faqs'],
];

async function main() {
  const db = await openDb();
  await applyMigrations(db);

  for (const role of DEMO_ROLES) {
    await db.query(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) on conflict (email) do nothing`,
      [`${role}@tekleteoflos.demo`, JSON.stringify({ full_name_am: role, demo_role: role })],
    );
  }
  await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ('mesfinabel511@gmail.com', '{}'::jsonb)
     on conflict (email) do nothing`,
  );

  const files = (await readdir(SEED_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(path.join(SEED_DIR, file), 'utf8');
    try {
      await db.exec(sql);
      console.log(`ok   ${file}`);
    } catch (err) {
      console.error(`FAIL ${file}`);
      console.error(`     ${String(err.message ?? err).split('\n').slice(0, 6).join('\n     ')}`);
      const at = Number(err.position);
      if (Number.isFinite(at)) {
        const line = sql.slice(0, at).split('\n').length;
        console.error(`     near line ${line}: ${sql.split('\n')[line - 1]?.trim().slice(0, 140)}`);
      }
      if (err.where) console.error(`     ${String(err.where).split('\n').slice(0, 3).join(' / ')}`);
      await db.close();
      process.exit(1);
    }
  }

  console.log('');
  for (const [label, rel] of COUNTS) {
    const rows = await query(db, `select count(*)::int as n from ${rel}`);
    console.log(`${String(rows.rows[0].n).padStart(5)}  ${label}`);
  }

  // A seeded database that contradicts itself is worse than an empty one, so the
  // derived numbers the ERP and the site both read have to agree here.
  const drift = await query(db, `
    select count(*)::int as n
      from public.attendance_sessions s
      join lateral (
        select count(*) filter (where r.status = 'present') as present,
               count(*) as total
          from public.attendance_records r where r.session_id = s.id
      ) a on true
     where a.total > 0
       and (s.present_count <> a.present or s.expected_count = 0)
  `);
  console.log(`\nattendance counters out of sync: ${drift.rows[0].n}`);

  const grades = await query(db, `
    select count(*)::int as n from public.exam_results
     where marks is not null and (percent is null or grade_letter is null)
  `);
  console.log(`exam rows without a derived grade: ${grades.rows[0].n}`);

  const orphan = await query(db, `
    select count(*)::int as n from public.student_enrollments e
     where not exists (select 1 from public.classes c where c.id = e.class_id)
  `);
  console.log(`enrollments pointing at a missing class: ${orphan.rows[0].n}`);

  // A paid gift has to appear in the cash book: the trigger creates the income
  // transaction, so a gap here means the seed wrote around it.
  const unpaid = await query(db, `
    select count(*)::int as n from public.donations
     where status = 'paid' and transaction_id is null
  `);
  console.log(`paid donations with no transaction: ${unpaid.rows[0].n}`);

  // The ledger must not carry money for a gift the church never received.
  const ghost = await query(db, `
    select count(*)::int as n from public.donations d
      join public.transactions t on t.id = d.transaction_id
     where d.status in ('cancelled', 'refunded') and t.status = 'approved'
  `);
  console.log(`approved transactions for cancelled gifts: ${ghost.rows[0].n}`);

  const books = await query(db, `
    select coalesce(sum(amount) filter (where type = 'income'), 0)::numeric(14, 2) as income,
           coalesce(sum(amount) filter (where type = 'expense'), 0)::numeric(14, 2) as expense,
           count(*) filter (where account_id is null) as no_account,
           count(*) filter (where type in ('income', 'expense') and category_id is null) as no_category
      from public.transactions where status = 'approved'
  `);
  const b = books.rows[0];
  console.log(`approved ledger: income ${b.income} ETB, expense ${b.expense} ETB, surplus ${b.income - b.expense} ETB`);
  // A transfer moves money between accounts and has no income/expense category;
  // an income or expense row without one cannot be reported on.
  console.log(`approved rows with no account: ${b.no_account}, income/expense rows with no category: ${b.no_category}`);

  // A content block sorts by a column name kept in its `settings` JSON, and
  // Postgres answers an unknown one with a hard error on the public page — the
  // home መዝሙር feed broke exactly that way when its view hid `created_at`. This is
  // the contract between src/site/blocks.tsx, src/site/lists.tsx and the views.
  const FEED_ORDERS = [
    ['v_public_news', 'published_at'],
    ['v_public_events', 'starts_at'],
    ['v_public_sermons', 'delivered_on'],
    ['v_public_sermons', 'created_at'],
    ['v_public_mezmur', 'created_at'],
    ['v_public_mezmur', 'title_am'],
    ['v_public_publications', 'published_on'],
    ['v_public_publications', 'created_at'],
    ['v_public_media', 'created_at'],
    ['v_public_albums', 'published_at'],
    ['v_public_campaigns', 'starts_on'],
    ['v_public_leadership', 'sort_order'],
    ['v_public_departments', 'sort_order'],
    ['v_public_faqs', 'sort_order'],
    ['v_public_classes', 'level_order'],
    ['v_public_class_levels', 'order_no'],
  ];
  const sorts = await query(db, `
    select f.view, f.col
      from (values ${FEED_ORDERS.map(([view, col]) => `('${view}', '${col}')`).join(', ')}) as f(view, col)
     where not exists (
       select 1 from information_schema.columns ic
        where ic.table_schema = 'public' and ic.table_name = f.view and ic.column_name = f.col
     )
  `);
  if (sorts.rows.length > 0) {
    console.error(`\nFAIL feed sorts by a column its view does not expose:`);
    for (const r of sorts.rows) console.error(`     ${r.view}.${r.col}`);
    await db.close();
    process.exit(1);
  }
  console.log(`feed sort columns present: ${FEED_ORDERS.length}`);

  // …and the same for what the seeded blocks actually ask for, block by block.
  const blockSorts = await query(db, `
    select t.block_type, t.col
      from (
        select b.block_type,
               coalesce(nullif(b.settings->>'order_by', ''),
                        case b.block_type
                          when 'news' then 'published_at'
                          when 'events' then 'starts_at'
                          when 'sermons' then 'delivered_on'
                          when 'mezmur' then 'created_at'
                          else 'published_on' end) as col
          from public.page_blocks b
         where b.block_type in ('news','events','sermons','mezmur','publications')
      ) t
     where not exists (
       select 1 from information_schema.columns ic
        where ic.table_schema = 'public'
          and ic.table_name = 'v_public_' || t.block_type
          and ic.column_name = t.col
     )
     group by t.block_type, t.col
  `);
  if (blockSorts.rows.length > 0) {
    console.error(`\nFAIL a seeded content block sorts by a column its view lacks:`);
    for (const r of blockSorts.rows) console.error(`     ${r.block_type} → v_public_${r.block_type}.${r.col}`);
    await db.close();
    process.exit(1);
  }
  console.log('every seeded content block sorts by a real column');

  await db.close();
}

main();
